import { useParams, useNavigate } from 'react-router-dom';

// Dynamic import — sonner is NOT on the critical rendering path
const sonnerToast: any = (...args: any[]) => {
  import('sonner').then(({ toast }) => (toast as any)(...args));
};
import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Check, X, Star, CheckSquare, Loader2, AlertCircle, CheckCircle2, Info, AlertTriangle, XCircle, Send, CornerDownLeft } from 'lucide-react';
import { LazyMotion, domAnimation, m as motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { FormData as AppFormData, WaitFeedbackMode } from '@/types/form';
import { PageElement } from '@/types/pageElements';
import { invokeEdge } from '@/lib/edgeClient';
import Twemoji from '@/components/Twemoji';
import { interpolateText, interpolateTextToNodes } from '@/lib/variableInterpolation';
import { resolveConditionBranch } from '@/lib/conditionEvaluator';
import { buildWebhookPayload, PixelEventRecord } from '@/lib/webhookPayload';
import { firePixelDual, firePixelDualBlocking, fireWebhookWithWorkflowProof } from '@/lib/firePixel';
import { captureSessionContext, requestGeolocation, contextToAnswers } from '@/lib/sessionContext';
import {
  clearDurablePublicSavesForForm,
  createDurablePublicSaveLane,
  flushDurablePublicSaves,
  sendDurablePublicSavesKeepalive,
  sendPublicSaveRequest,
  type DurablePublicSaveLane,
  type PublicSaveRequest,
} from '@/lib/publicSaveQueue';
import {
  resolveWorkflowWaits,
  waitForAdjustableDuration,
  type PendingWorkflowWait,
  type WorkflowStepResult,
} from '@/lib/workflowWait';
import { applyWebhookResponse } from '@/lib/workflowAnswers';
// consumePrefetchedForm/hasPrefetchedForm moved to shell (FormPreview.tsx)
import { normalizeFontFamily } from '@/lib/fontUtils';
import { prepareRedirectDestination, resolveRedirectDestination } from '@/lib/redirectDestination';
import { getFormScreenKey, getFormScreenMotion, getRedirectNavigationDelay } from '@/lib/formScreenTransition';
import { buildFormBackgroundStyle } from '@/lib/formBackground';
import { resolveFormSeo, serializeJsonLdForHtml } from '@/lib/formSeo';
import { executeWorkflowSideEffect, WorkflowSideEffectError } from '@/lib/workflowSideEffect';
import { revealInvalidFormField } from '@/lib/formValidationFeedback';
import { applyVariableOperations } from '@/lib/variableOperations';
import {
  clearStoredFormResume,
  writeStoredFormResume,
} from '@/lib/formResume';
import {
  buildDefaults,
  applyElementVariableBinding,
  applyPageVariableAssignments as applyConfiguredPageAssignments,
  flattenPageElements,
  getRequiredFieldErrors,
  hasUnansweredInputFields,
  refreshDynamicDefaults,
  resolveUserData,
  prefetchLazyComponentsForElements,
} from './FormPreview.utils';

// InteractiveElement is lazy-loaded to reduce initial parse/compile cost.
// IMPORTANT: we start the import immediately so the *first real page* can mount+animate only when the real UI is ready.
const interactiveElementModule = import('@/components/preview/InteractiveElement');
const InteractiveElement = lazy(() => interactiveElementModule);

// Lazy-loaded heavy preview component used only in loading screen overlay
const loadLoadingPreview = () => import('@/components/preview/LoadingPreview');
const LoadingPreview = lazy(loadLoadingPreview);

// Wrapper to keep Suspense local and avoid route-level blank/loading screens
function LazyWrap({ children }: { children: React.ReactNode }) {
  // Static placeholder only (no skeleton animation) — placeholders must never “consume” entrance motion
  return <Suspense fallback={<div className="w-full min-h-24 rounded-xl bg-muted/20" />}>{children}</Suspense>;
}

type WorkflowDeliveryResponse = {
  success?: boolean;
  processing?: boolean;
  deduplicated?: boolean;
  error?: string;
  result?: unknown;
  workflowProof?: string;
};

type WorkflowPathContext = {
  sourceNodeId: string;
  proof?: string;
};

function deterministicWorkflowFraction(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0x1_0000_0000;
}

function sameRuntimeValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function workflowPathFields(context: WorkflowPathContext) {
  return {
    workflowSourceNodeId: context.sourceNodeId,
    ...(context.proof ? { workflowProof: context.proof } : {}),
  };
}

function acceptWorkflowPathProof(
  context: WorkflowPathContext,
  nodeId: string,
  proof: unknown,
) {
  if (typeof proof !== 'string' || !proof) {
    throw new Error('workflow_path_proof_missing');
  }
  context.sourceNodeId = nodeId;
  context.proof = proof;
}

async function invokeAcknowledgedWorkflowFunction(
  functionName: string,
  body: Record<string, any>,
  signal: AbortSignal,
): Promise<WorkflowDeliveryResponse> {
  const { data, error } = await invokeEdge<WorkflowDeliveryResponse>(functionName, body, { signal });
  if (error || data?.success !== true || data.processing === true) {
    throw error || new Error(data?.processing ? 'delivery_still_processing' : 'delivery_not_acknowledged');
  }
  return data;
}

function getWorkflowFailureMessage(error: unknown): string {
  if (error instanceof WorkflowSideEffectError) {
    return 'A integração não confirmou o recebimento. O formulário permaneceu nesta etapa para evitar perder o envio.';
  }
  return 'Não foi possível executar esta etapa do fluxo. O formulário não avançou; tente novamente.';
}

function selectWebhookRuntimeAnswers(
  answers: Record<string, any>,
): Record<string, any> {
  return Object.fromEntries(Object.entries(answers).filter(([key]) =>
    key.startsWith('__var_') ||
    key.startsWith('__ctx_') ||
    key.startsWith('__param_') ||
    key.startsWith('__webhook_')
  ));
}



interface FormPreviewCoreProps {
  form: AppFormData;
  isEditorPreview: boolean;
}

export default function FormPreviewCore({ form, isEditorPreview }: FormPreviewCoreProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const prefersReducedMotion = Boolean(useReducedMotion());
  // Preview authority comes from the authenticated editor store or from the
  // parent/iframe nonce handshake in FormPreview. A naked query parameter is
  // public traffic and must never disable persistence.
  const isPreviewMode = isEditorPreview;
  const [isInitialStateReady, setIsInitialStateReady] = useState(false);
  const [isInteractiveElementReady, setIsInteractiveElementReady] = useState(false);
  const [animationFrameReady, setAnimationFrameReady] = useState(false);
  const prevMountReadyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    interactiveElementModule
      .then(() => {
        if (!cancelled) setIsInteractiveElementReady(true);
      })
      // Fail-open: never get stuck behind a chunk error
      .catch(() => {
        if (!cancelled) setIsInteractiveElementReady(true);
      });
    return () => { cancelled = true; };
  }, []);

  // The parent keeps its loading cover visible until the actual form renderer
  // is ready. A session nonce binds this acknowledgement to the current iframe
  // instance, including device switches and retries.
  useEffect(() => {
    if (!isPreviewMode || window.parent === window || !isInitialStateReady || !isInteractiveElementReady) return;
    const previewSession = new URLSearchParams(window.location.search).get('previewSession');
    if (!previewSession) return;
    window.parent.postMessage({
      type: 'forms-editor-preview-mounted',
      formId: form.id,
      previewSession,
    }, '*');
  }, [form.id, isInitialStateReady, isInteractiveElementReady, isPreviewMode]);

  // --- First-load animation gate ---
  // Ensures the browser paints the initial (opacity:0) state before framer-motion
  // starts animating to center. Without this, React batches mount + animate in the
  // same frame, causing the animation to be visually skipped on first load.
  const isBootstrappingEarly = !isInitialStateReady;

  useEffect(() => {
    if (isBootstrappingEarly) {
      prevMountReadyRef.current = false;
      setAnimationFrameReady(false);
      return;
    }
    // Already transitioned once — skip
    if (prevMountReadyRef.current) return;

    // Wait 2 rAFs: one for the browser to commit the DOM with initial state,
    // one more to guarantee a painted frame, then allow animation.
    const frameIds: number[] = [];
    frameIds.push(requestAnimationFrame(() => {
      frameIds.push(requestAnimationFrame(() => {
        prevMountReadyRef.current = true;
        setAnimationFrameReady(true);
      }));
    }));
    return () => {
      frameIds.forEach(cancelAnimationFrame);
    };
  }, [isBootstrappingEarly]);

  useEffect(() => {
    if (isPreviewMode || !animationFrameReady || !isInitialStateReady || !isInteractiveElementReady) return;
    const shell = document.getElementById('form-ssr-shell');
    if (!shell || shell.dataset.dismissing === 'true') return;
    shell.dataset.dismissing = 'true';
    shell.style.opacity = '0';
    const timer = window.setTimeout(() => shell.remove(), 220);
    return () => window.clearTimeout(timer);
  }, [animationFrameReady, isInitialStateReady, isInteractiveElementReady, isPreviewMode]);

  // Preview ref for stable access in callbacks
  const isEditorPreviewRef = useRef(isPreviewMode);
  useEffect(() => { isEditorPreviewRef.current = isPreviewMode; }, [isPreviewMode]);

  const [currentPageIndex, setCurrentPageIndex] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [direction, setDirection] = useState(1);
  const [finished, setFinished] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [resolvedRedirectUrl, setResolvedRedirectUrl] = useState<string | null>(null);
  const [blockedElements, setBlockedElements] = useState<Record<string, boolean>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const pageHistoryRef = useRef<number[]>([]);
  const [waitFeedback, setWaitFeedback] = useState<{
    active: boolean;
    mode: WaitFeedbackMode;
    durationMs: number;
    remainingMs: number;
    buttonText?: string;
    loadingStyle?: 'bar' | 'circular' | 'infinite';
    loadingLabel?: string;
    allowSkip?: boolean;
  } | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const navigatingRef = useRef(false);
  const [isFlowProcessing, setIsFlowProcessing] = useState(false);
  const lastWorkflowActionRef = useRef<
    | { kind: 'next' }
    | { kind: 'button'; action: 'specific' | 'finish'; targetPageId?: string }
  >({ kind: 'next' });
  const validatorsRef = useRef<Record<string, () => Promise<boolean>>>({});
  const answersRef = useRef(answers);
  useEffect(() => { answersRef.current = answers; }, [answers]);
  const initialFlowPendingRef = useRef(false);
  const initialDefaultsRef = useRef<Record<string, any>>({});
  const protectedDefaultKeysRef = useRef(new Set<string>());

  // Track all pixel events fired during this session
  const pixelEventsRef = useRef<PixelEventRecord[]>([]);
  // Track nodes that already fired side-effects (fireOnce dedup)
  const firedNodesRef = useRef(new Set<string>());

  // Capture session metadata once on mount
  const sessionMetaRef = useRef((() => {
    const uuid = !isPreviewMode && form.submissionResponseId
      ? form.submissionResponseId
      : crypto.randomUUID();
    // Short hash: base36 from first 12 hex chars of UUID → 8-char alphanumeric
    const hash = parseInt(uuid.replace(/-/g, '').slice(0, 12), 16).toString(36).toUpperCase().slice(0, 8);
    return {
      responseId: uuid,
      responseHash: hash,
      landedAt: new Date().toISOString(),
      queryParams: typeof window !== 'undefined'
        ? Object.fromEntries(new URLSearchParams(window.location.search).entries())
        : {} as Record<string, string>,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      referrer: typeof document !== 'undefined' ? document.referrer : '',
    };
  })());
  const sessionDbIdRef = useRef<string | null>(
    !isPreviewMode && form.submissionSessionId ? form.submissionSessionId : null,
  );
  const maxPageVisitedRef = useRef<number>(-1);
  const pageEnteredAtRef = useRef<number>(Date.now());
  const completionRequestedRef = useRef(false);
  const completionAcknowledgedRef = useRef(false);
  const completionQueueAvailableRef = useRef(false);
  const completionSavePromiseRef = useRef<Promise<boolean> | null>(null);
  const completionRedirectTemplateRef = useRef<string | null>(null);
  const responseSaveLaneRef = useRef<{ key: string; lane: DurablePublicSaveLane } | null>(null);
  const responseSaveLaneKey = `response:${form.id}:${sessionMetaRef.current.responseId}`;
  if (responseSaveLaneRef.current?.key !== responseSaveLaneKey) {
    responseSaveLaneRef.current = {
      key: responseSaveLaneKey,
      lane: createDurablePublicSaveLane(responseSaveLaneKey),
    };
  }

  // PRIMARY save method — uses edge function with service role key (bypasses RLS)
  const saveViaBackend = useCallback(async (args: {
    kind: 'response' | 'session' | 'event';
    action: 'insert' | 'upsert' | 'update';
    payload: Record<string, any>;
    onConflict?: string;
    match?: Record<string, any>;
  }) => {
    try {
      const res = await invokeEdge('form-public-save', { ...args, token: form.submissionToken });
      if (res.error) {
        console.error('[form-public-save] invoke error:', res.error);
      } else if (res.data && !(res.data as any).success) {
        console.error('[form-public-save] server error:', (res.data as any).error);
      }
    } catch (e) {
      console.error('[form-public-save] network error:', e);
    }
  }, [form.submissionToken]);

  const persistCompletion = useCallback((latestAnswers: Record<string, any>): Promise<boolean> => {
    if (isPreviewMode || !form.id) return Promise.resolve(true);
    if (completionAcknowledgedRef.current) return Promise.resolve(true);
    if (completionSavePromiseRef.current) return completionSavePromiseRef.current;

    const { responseId } = sessionMetaRef.current;
    const now = new Date().toISOString();
    const request: PublicSaveRequest = {
      token: form.submissionToken,
      kind: 'response',
      action: 'upsert',
      onConflict: 'form_id,response_id',
      payload: {
        form_id: form.id,
        response_id: responseId,
        session_id: sessionDbIdRef.current,
        answers: latestAnswers,
        metadata: {
          status: 'complete',
          response_hash: sessionMetaRef.current.responseHash,
          user_agent: sessionMetaRef.current.userAgent,
          referrer: sessionMetaRef.current.referrer,
          query_params: sessionMetaRef.current.queryParams,
          landed_at: sessionMetaRef.current.landedAt,
          submitted_at: now,
        },
        total_time_ms: Date.now() - new Date(sessionMetaRef.current.landedAt).getTime(),
        pages_visited: maxPageVisitedRef.current + 1,
        completion_time_on_page_ms: Math.max(0, Date.now() - pageEnteredAtRef.current),
      },
    };
    const savePromise = responseSaveLaneRef.current!.lane.persist(request, {
      attempts: 2,
      baseDelayMs: 250,
      send: (pendingRequest) => sendPublicSaveRequest(pendingRequest, { timeoutMs: 30_000 }),
    }).then(({ delivered, queued }) => {
      completionQueueAvailableRef.current = queued;
      if (!delivered && !queued) {
        console.error('[form-public-save] completion could not be delivered or queued');
      }
      if (delivered) completionAcknowledgedRef.current = true;
      // The thank-you screen requires a backend acknowledgement. A local queue
      // protects the payload, but is not presented as a successful submission.
      return delivered;
    }).finally(() => {
      if (!completionAcknowledgedRef.current) completionSavePromiseRef.current = null;
    });
    completionSavePromiseRef.current = savePromise;
    return savePromise;
  }, [form.id, form.submissionToken, isPreviewMode]);

  const finishForm = useCallback(async (
    latestAnswers: Record<string, any> = answersRef.current,
    redirectTemplateOverride?: string,
  ) => {
    if (redirectTemplateOverride !== undefined) {
      completionRedirectTemplateRef.current = redirectTemplateOverride;
    }
    answersRef.current = latestAnswers;
    setAnswers(latestAnswers);
    completionRequestedRef.current = true;
    setCompletionError(null);
    setIsCompleting(true);
    try {
      const acknowledged = await persistCompletion(latestAnswers);
      if (acknowledged) {
        if (!isPreviewMode) {
          clearStoredFormResume(form.id);
          clearDurablePublicSavesForForm(form.id);
        }
        const redirectTemplate = completionRedirectTemplateRef.current
          ?? (form.completionAction === 'redirect' ? form.completionRedirectUrl : undefined);
        const destination = !isPreviewMode && redirectTemplate
          ? prepareRedirectDestination({
              template: redirectTemplate,
              variables: form.variables || [],
              answers: latestAnswers,
              phase: 'final',
            })
          : null;
        if (redirectTemplate && !destination && !isPreviewMode) {
          console.warn('[redirect] destination is invalid or has unresolved references');
        }
        setResolvedRedirectUrl(destination?.url || null);
        setFinished(true);
        return true;
      }
      setCompletionError(completionQueueAvailableRef.current
        ? 'Não foi possível confirmar o envio. Seus dados estão preservados neste dispositivo; tente novamente.'
        : 'Não foi possível confirmar nem preservar o envio. Não feche esta página e tente novamente.');
      return false;
    } finally {
      setIsCompleting(false);
    }
  }, [form.completionAction, form.completionRedirectUrl, form.id, form.variables, isPreviewMode, persistCompletion]);

  // Static destinations reveal no respondent data and can be warmed as soon as
  // the form is ready. Dynamic templates are deliberately deferred to the final
  // acknowledged submission path above.
  useEffect(() => {
    if (isPreviewMode) return;
    const redirectTemplates = [
      ...(form.completionAction === 'redirect' && form.completionRedirectUrl
        ? [form.completionRedirectUrl]
        : []),
      ...(form.jumpNodes || [])
        .filter((node) => (node.destinationType === 'url' || (!node.destinationType && node.redirectUrl)) && node.redirectUrl)
        .map((node) => node.redirectUrl as string),
    ];
    for (const template of redirectTemplates) {
      prepareRedirectDestination({
        template,
        variables: form.variables || [],
        answers: answersRef.current,
        phase: 'early',
      });
    }
  }, [form.completionAction, form.completionRedirectUrl, form.jumpNodes, form.variables, isPreviewMode]);

  useEffect(() => {
    if (!finished || !resolvedRedirectUrl || isPreviewMode) return;
    const delayMs = getRedirectNavigationDelay(prefersReducedMotion);
    const timeout = window.setTimeout(() => window.location.assign(resolvedRedirectUrl), delayMs);
    return () => window.clearTimeout(timeout);
  }, [finished, isPreviewMode, prefersReducedMotion, resolvedRedirectUrl]);

  // Retry durable completions after reload and whenever connectivity returns.
  useEffect(() => {
    if (isPreviewMode) return;
    void flushDurablePublicSaves();
    const onOnline = () => {
      if (completionRequestedRef.current && !completionAcknowledgedRef.current) {
        void finishForm(answersRef.current);
      } else {
        void flushDurablePublicSaves();
      }
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [finishForm, isPreviewMode]);

  // Retain only the short-lived opaque credential in this tab. Answers are
  // resumed from the canonical encrypted response returned by form-public-get.
  useEffect(() => {
    if (isPreviewMode || !form.id) return;
    if (form.allowResume === true && form.submissionToken) {
      writeStoredFormResume(form.id, {
        submissionToken: form.submissionToken,
        updatedAt: new Date().toISOString(),
      });
    } else {
      clearStoredFormResume(form.id);
    }
  }, [form.allowResume, form.id, form.submissionToken, isPreviewMode]);

  // Initialise answers, page index, and session context once form is loaded
  // Phase 1 (sync): defaults + page index for instant first paint
  // Phase 2 (deferred): session context, geo — via requestIdleCallback
  useEffect(() => {
    if (!form) return;
    setIsInitialStateReady(false);
    protectedDefaultKeysRef.current = new Set();

    // Start-node conditions and assignments may depend on context/GET params, so
    // capture the synchronous portion before resolving the initial route.
    const contextAnswers = contextToAnswers(captureSessionContext());
    const defaults = buildDefaults(form, contextAnswers);
    initialDefaultsRef.current = defaults;
    const initialAnswers = { ...contextAnswers, ...defaults };

    const registerGeolocation = () => {
      if (isPreviewMode || form.enableGeolocation !== true) return undefined;
      let active = true;
      const geoHandler = () => {
        requestGeolocation().then((geo) => {
          if (!active || geo.source === 'none') return;
          const geoAnswers = {
            __ctx_latitude: geo.latitude,
            __ctx_longitude: geo.longitude,
            __ctx_geoCity: geo.geoCity,
            __ctx_geoState: geo.geoState,
            __ctx_geoCountry: geo.geoCountry,
            __ctx_geoCountryCode: geo.geoCountryCode,
            __ctx_geoNeighborhood: geo.geoNeighborhood,
            __ctx_geoStreet: geo.geoStreet,
            __ctx_geoCep: geo.geoCep,
            __ctx_geoSource: geo.source,
          };
          const refreshed = refreshDynamicDefaults(
            form,
            answersRef.current,
            initialDefaultsRef.current,
            {
              runtimeAnswers: geoAnswers,
              protectedKeys: protectedDefaultKeysRef.current,
            },
          );
          initialDefaultsRef.current = refreshed.defaults;
          answersRef.current = refreshed.answers;
          setAnswers(refreshed.answers);
        });
      };
      // Only trigger on user interaction — never auto-trigger to avoid blocking rendering.
      window.addEventListener('pointerdown', geoHandler, { once: true, passive: true });
      return () => {
        active = false;
        window.removeEventListener('pointerdown', geoHandler);
      };
    };

    // The browser never provides answer data here. form-public-get has already
    // verified the opaque credential and loaded this bounded snapshot from the
    // canonical encrypted partial response.
    if (!isPreviewMode && form.allowResume && form.submissionResumed) {
      const snapshot = form.submissionResumeState;
      const parsedPageIndex = Number(snapshot?.pageIndex);
      const hasValidSavedIndex = Number.isInteger(parsedPageIndex)
        && parsedPageIndex >= 0
        && parsedPageIndex < (form.pages?.length ?? 0);
      if (snapshot?.answers && hasValidSavedIndex) {
        protectedDefaultKeysRef.current = new Set(
          Object.keys(snapshot.answers).filter((key) => !key.startsWith('__ctx_')),
        );
        const resumedAnswers = { ...initialAnswers, ...snapshot.answers };
        const refreshed = refreshDynamicDefaults(form, resumedAnswers, defaults, {
          protectedKeys: protectedDefaultKeysRef.current,
        });
        initialDefaultsRef.current = refreshed.defaults;
        answersRef.current = refreshed.answers;
        setAnswers(refreshed.answers);
        setCurrentPageIndex(parsedPageIndex);
        maxPageVisitedRef.current = Math.max(parsedPageIndex, Number(snapshot.maxPage) || 0);
        initialFlowPendingRef.current = false;

        prefetchLazyComponentsForElements(form.pages?.[parsedPageIndex]?.elements || [], 'immediate');
        setIsInitialStateReady(true);
        return registerGeolocation();
      }
    }

    const mustResolveStart = form.showWelcomeScreen !== true;
    const initialElements = form.showWelcomeScreen
      ? (form.welcomePage?.elements || [])
      : (form.pages?.[0]?.elements || []);

    prefetchLazyComponentsForElements(initialElements, 'immediate');
    answersRef.current = initialAnswers;
    setAnswers(initialAnswers);
    setCurrentPageIndex(null);
    initialFlowPendingRef.current = mustResolveStart;
    // Without welcome, keep content hidden until the start graph picks the page.
    setIsInitialStateReady(!mustResolveStart);

    return registerGeolocation();
  }, [form?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save session for resume + partial responses
  useEffect(() => {
    if (!form?.id || finished || isPreviewMode) return;
    if (completionRequestedRef.current) return;
    if (currentPageIndex === null) return;

    const timer = window.setTimeout(() => {
      // A timer may have been scheduled just before the final submit click.
      if (completionRequestedRef.current) return;
      // Save partial response to DB
      if (form.savePartialResponses !== false) {
        const { responseId } = sessionMetaRef.current;
        const sessionId = sessionDbIdRef.current;
        const request: PublicSaveRequest = {
          token: form.submissionToken,
          kind: 'response',
          action: 'upsert',
          onConflict: 'form_id,response_id',
          payload: {
            form_id: form.id,
            response_id: responseId,
            session_id: sessionId,
            answers: answersRef.current,
            metadata: {
              status: 'partial',
              response_hash: sessionMetaRef.current.responseHash,
              user_agent: sessionMetaRef.current.userAgent,
              referrer: sessionMetaRef.current.referrer,
              query_params: sessionMetaRef.current.queryParams,
              landed_at: sessionMetaRef.current.landedAt,
              last_page_index: currentPageIndex,
            },
            pages_visited: maxPageVisitedRef.current + 1,
          },
        };
        void responseSaveLaneRef.current!.lane.persist(request, {
          attempts: 1,
          send: (pendingRequest) => sendPublicSaveRequest(pendingRequest, { timeoutMs: 15_000 }),
        }).then(({ delivered, queued }) => {
          if (!delivered && !queued) {
            console.error('[form-public-save] partial response could not be delivered or queued');
          }
        });
      }
    }, 700);

    return () => window.clearTimeout(timer);
  }, [answers, currentPageIndex, form?.id, finished, isPreviewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save the latest partial synchronously into the durable queue before unload,
  // then make a best-effort keepalive delivery of every queued payload.
  useEffect(() => {
    if (!form?.id || isPreviewMode) return;
    const handler = () => {
      if (!completionRequestedRef.current && form.savePartialResponses !== false && !finished) {
        const { responseId } = sessionMetaRef.current;
        const request: PublicSaveRequest = {
          token: form.submissionToken,
          kind: 'response',
          action: 'upsert',
          onConflict: 'form_id,response_id',
          payload: {
            form_id: form.id,
            response_id: responseId,
            session_id: sessionDbIdRef.current,
            answers: answersRef.current,
            metadata: {
              status: 'partial',
              response_hash: sessionMetaRef.current.responseHash,
              user_agent: sessionMetaRef.current.userAgent,
              referrer: sessionMetaRef.current.referrer,
              query_params: sessionMetaRef.current.queryParams,
              landed_at: sessionMetaRef.current.landedAt,
              last_page_index: currentPageIndex,
            },
            pages_visited: maxPageVisitedRef.current + 1,
          },
        };
        // persist() enqueues synchronously before its promise is returned.
        void responseSaveLaneRef.current!.lane.persist(request, { attempts: 1 });
      }
      sendDurablePublicSavesKeepalive();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [currentPageIndex, form?.id, form?.submissionToken, finished, isPreviewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Insert session record on form load — DEFERRED to avoid blocking first paint
  useEffect(() => {
    if (!form?.id || isPreviewMode) return;
    const generatedSessionId = form.submissionSessionId || crypto.randomUUID();
    sessionDbIdRef.current = generatedSessionId;

    // Defer session insert to after first paint — not needed for rendering
    const schedule = typeof requestIdleCallback === 'function' ? requestIdleCallback : (fn: () => void) => setTimeout(fn, 50);
    schedule(() => {
      const { responseId, userAgent, queryParams, referrer } = sessionMetaRef.current;
      if (form.submissionResumed) {
        saveViaBackend({
          kind: 'session',
          action: 'update',
          match: { id: generatedSessionId },
          payload: {
            status: 'active',
            last_seen_at: new Date().toISOString(),
            total_pages: form.pages?.length || 0,
          },
        });
      } else {
        saveViaBackend({
          kind: 'session',
          action: 'insert',
          payload: {
            id: generatedSessionId,
            form_id: form.id,
            response_id: responseId,
            status: 'active',
            total_pages: form.pages?.length || 0,
            source_url: typeof window !== 'undefined' ? window.location.href : '',
            referrer: referrer || null,
            user_agent: userAgent,
            query_params: queryParams,
          },
        });

        // A resumed visit keeps the original form_start/session identity.
        saveViaBackend({
          kind: 'event',
          action: 'insert',
          payload: { form_id: form.id, response_id: responseId, event_type: 'form_start' },
        });
      }
    });
  }, [form?.id, isPreviewMode]); // eslint-disable-line react-hooks/exhaustive-deps


  // Fire pixel load events once the form is ready — DEFERRED to avoid blocking first paint
  useEffect(() => {
    if (!form?.id || isPreviewMode) return;
    const loadEvents = form.pixelLoadEvents || [];
    if (loadEvents.length === 0) return;

    // Pixels are non-critical — fire after first paint
    const schedule = typeof requestIdleCallback === 'function' ? requestIdleCallback : (fn: () => void) => setTimeout(fn, 100);
    schedule(() => {
      const sourceUrl = typeof window !== 'undefined' ? window.location.href : '';
      const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      const { responseId } = sessionMetaRef.current;

      for (const evt of loadEvents) {
        const eventName = evt.eventType === 'custom'
          ? (evt.customEventName || 'CustomEvent')
          : evt.eventType;
        const eventId = `${form.id}_load_${evt.id}_${Date.now()}`;

        const userData = resolveUserData(evt.userDataMapping, answersRef.current, form);

        firePixelDual({
          submissionToken: form.submissionToken,
          nodeId: evt.id,
          platform: evt.platform,
          eventName,
          eventId,
          formId: form.id,
          responseId,
          triggerType: 'load_event',
          answers: answersRef.current,
          variables: {},
          userData,
          sourceUrl,
          userAgent,
          onFired: (rec) => pixelEventsRef.current.push(rec),
        });
      }
    });
  }, [form?.id, isPreviewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track page views & session progress when page changes or form completes
  useEffect(() => {
    if (!form?.id || isPreviewMode) return;
    const { responseId } = sessionMetaRef.current;
    const sessionId = sessionDbIdRef.current;
    const now = new Date().toISOString();
    const timeOnPage = Date.now() - pageEnteredAtRef.current;
    pageEnteredAtRef.current = Date.now();

    if (finished) {
      // Safety net for completion paths. finishForm already awaited this same
      // promise; form-public-save atomically persists response, completed
      // session and the idempotent form_complete event before acknowledging.
      const latestAnswers = answersRef.current;
      void persistCompletion(latestAnswers);

      // Clear resume data
      if (form.allowResume) {
        clearStoredFormResume(form.id);
      }

      return;
    }

    if (currentPageIndex !== null) {
      const page = form.pages?.[currentPageIndex];
      const newMax = Math.max(currentPageIndex, maxPageVisitedRef.current);
      maxPageVisitedRef.current = newMax;
      if (sessionId) {
        saveViaBackend({
          kind: 'session',
          action: 'update',
          payload: {
            current_page_index: currentPageIndex,
            pages_visited: newMax + 1,
            last_seen_at: now,
          },
          match: { id: sessionId },
        });
      }
      saveViaBackend({
        kind: 'event',
        action: 'insert',
        payload: {
          session_id: sessionId,
          form_id: form.id,
          response_id: responseId,
          page_id: page?.id,
          page_index: currentPageIndex,
          page_title: page?.title,
          event_type: 'page_view',
          time_on_page_ms: currentPageIndex > 0 ? timeOnPage : null,
        },
      });
    }
  }, [currentPageIndex, finished, form?.id, isPreviewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Always-fresh ref to form — avoids stale closures in callbacks
  const formRef = useRef(form);
  useEffect(() => { formRef.current = form; }, [form]);

  // Scroll to top on page change
  useEffect(() => {
    scrollContainerRef.current?.scrollTo?.({ top: 0 });
  }, [currentPageIndex, finished]);


  const pages = useMemo(() => form?.pages || [], [form?.pages]);
  const currentPage = currentPageIndex !== null ? pages[currentPageIndex] : null;

  // Self-healing: if restored page index is invalid, recover to a safe starting point
  useEffect(() => {
    if (currentPageIndex === null) return;
    if (currentPage) return;

    if (pages.length === 0) {
      setCurrentPageIndex(null);
      return;
    }

    setCurrentPageIndex(form?.showWelcomeScreen ? null : 0);
  }, [currentPageIndex, currentPage, pages.length, form?.showWelcomeScreen]);

  // Flow-aware "last page" detection: a page is last if its outgoing edges
  // only lead to 'end' node or it has no outgoing edges at all (terminal)
  const isFlowLastPage = useMemo(() => {
    if (currentPageIndex === null || !currentPage) return false;
    const edges = form?.flowEdges || [];
    const nodeId = `p-${currentPage.id}`;
    const outEdges = edges.filter(e => e.source === nodeId);
    if (outEdges.length === 0) return true; // no outgoing edges = terminal
    // Check if ALL paths from this node lead to 'end' (BFS, skipping non-page nodes)
    const visited = new Set<string>();
    const queue = outEdges.map(e => e.target);
    while (queue.length > 0) {
      const n = queue.shift()!;
      if (visited.has(n)) continue;
      visited.add(n);
      if (n === 'end') continue;
      if (n.startsWith('p-')) return false; // leads to another page → not last
      // Non-page node (condition, variable-op, etc.) — follow its edges
      for (const e of edges) {
        if (e.source === n && !visited.has(e.target)) queue.push(e.target);
      }
    }
    return true; // all paths lead to 'end'
  }, [currentPageIndex, currentPage, form?.flowEdges]);


  // Auto-complete ONLY when user reaches a truly empty terminal page
  // (avoid auto-finishing on informational pages like "Página 2" with text/confetti)
  useEffect(() => {
    if (!form || finished || currentPageIndex === null) return;

    const page = pages[currentPageIndex];
    if (!page) return;

    const hasAnyElements = (page.elements?.length ?? 0) > 0;
    const flattenedElements = flattenPageElements(page.elements || []);
    const hasInputFields = flattenedElements.some(el => el.type.startsWith('input_'));
    const hasActionButtons = flattenedElements.some(el => el.type === 'button');
    const hasOutgoingFlow = (form.flowEdges || []).some(edge => edge.source === `p-${page.id}`);
    const isLastPage = isFlowLastPage;

    if (!hasAnyElements && !hasInputFields && !hasActionButtons && !hasOutgoingFlow && isLastPage) {
      void finishForm();
    }
  }, [form, finished, currentPageIndex, pages, isFlowLastPage, finishForm]);

  const totalScore = useMemo(() => {
    if (!form) return 0;
    let score = 0;
    for (const page of form.pages || []) {
      for (const el of flattenPageElements(page.elements || [])) {
        const val = answers[el.id];
        if (val === undefined || val === null) continue;

        if (el.type === 'input_yes_no') {
          if (val === 'yes' && el.yesScore) score += el.yesScore;
          if (val === 'no' && el.noScore) score += el.noScore;
        } else if (['input_select', 'input_radio', 'input_quiz_icon', 'input_quiz_image'].includes(el.type)) {
          const opt = (el.options || []).find(o => o.id === val);
          if (opt?.score) score += opt.score;
        } else if (el.type === 'input_multi_select' && Array.isArray(val)) {
          for (const optId of val) {
            const opt = (el.options || []).find(o => o.id === optId);
            if (opt?.score) score += opt.score;
          }
        }
      }
    }
    return score;
  }, [form, answers]);

  // Sync totalScore into answers so it's available for conditions, variable interpolation, and webhooks
  useEffect(() => {
    setAnswers(prev => {
      const next = { ...prev, __score: totalScore };
      // Also sync to any user-created variables whose name relates to score
      // This allows {{pontuacao}}, {{score}}, {{nota}} etc. to resolve via __var_X
      const scoreVarNames = ['pontuacao', 'score', 'nota', 'points', 'pontos'];
      const formVars = formRef.current?.variables || [];
      for (const v of formVars) {
        if (scoreVarNames.includes(v.name.toLowerCase()) || v.name.toLowerCase().includes('score') || v.name.toLowerCase().includes('pontuac')) {
          next[`__var_${v.name}`] = String(totalScore);
        }
      }
      // Check if anything actually changed to prevent unnecessary re-renders
      const changed = Object.keys(next).some(k => prev[k] !== next[k]);
      return changed ? next : prev;
    });
  }, [totalScore]);

  const isWelcome = currentPageIndex === null && !finished;
  const isThankYou = finished;
  const currentValidationElements = useMemo(() => {
    if (isWelcome && form.showWelcomeScreen) return form.welcomePage?.elements || [];
    return currentPage?.elements || [];
  }, [currentPage, form.showWelcomeScreen, form.welcomePage?.elements, isWelcome]);
  const currentValidationElementsRef = useRef(currentValidationElements);
  currentValidationElementsRef.current = currentValidationElements;
  const validationAttemptedElementsRef = useRef(new Set<string>());
  const nonEmptyPages = useMemo(() => pages.filter(p => p.elements && p.elements.length > 0), [pages]);
  const totalSteps = nonEmptyPages.length;
  // Progress based on journey step count (history length), not page array position
  // This ensures progress always increases linearly regardless of workflow page order
  const journeyStep = pageHistoryRef.current.length + (currentPageIndex !== null ? 1 : 0);
  const progress = isWelcome ? 0 : isThankYou ? 100 : totalSteps > 0 ? Math.min((journeyStep / totalSteps) * 100, 100) : 0;

  // Prefetch lazy preview chunks for current + next screen to avoid blank/loading between transitions
  useEffect(() => {
    if (!form) return;

    const currentElements = isWelcome
      ? (form.showWelcomeScreen ? (form.welcomePage?.elements || []) : (pages[0]?.elements || []))
      : isThankYou
        ? (form.thankYouPage?.elements || [])
        : (currentPage?.elements || []);

    prefetchLazyComponentsForElements(currentElements, 'immediate');

    if (!isWelcome && !isThankYou && currentPageIndex !== null) {
      prefetchLazyComponentsForElements(pages[currentPageIndex + 1]?.elements || [], 'idle');
    }
  }, [form, pages, currentPage, currentPageIndex, isWelcome, isThankYou]);

  /** Check if a page has any meaningful elements for the respondent */
  const isPageEmpty = useCallback((page: import('@/types/form').FunnelPage | undefined): boolean => {
    if (!page) return true;
    return !page.elements || page.elements.length === 0;
  }, []);

  const isPageBlocked = useMemo(() => {
    return flattenPageElements(currentValidationElements).some(el => blockedElements[el.id]);
  }, [currentValidationElements, blockedElements]);

  const setElementBlocked = useCallback((elementId: string, blocked: boolean) => {
    setBlockedElements(prev => ({ ...prev, [elementId]: blocked }));
  }, []);

  const registerValidator = useCallback((elementId: string, validator: (() => Promise<boolean>) | null) => {
    if (validator) {
      validatorsRef.current[elementId] = validator;
    } else {
      delete validatorsRef.current[elementId];
    }
  }, []);

  const revealInvalidField = useCallback((elementId: string) => {
    const root = scrollContainerRef.current;
    if (!root) return;
    revealInvalidFormField({ root, elementId, prefersReducedMotion });
  }, [prefersReducedMotion]);

  const validateCurrentPageBeforeNavigation = useCallback(async (): Promise<boolean> => {
    if (isPageBlocked) return false;

    const elementsInVisualOrder = flattenPageElements(currentValidationElements);
    elementsInVisualOrder.forEach((element) => {
      if (element.type.startsWith('input_')) validationAttemptedElementsRef.current.add(element.id);
    });
    const synchronousErrors = getRequiredFieldErrors(currentValidationElements, answersRef.current);
    setFieldErrors(synchronousErrors);

    // Required/constraint checks and async validators share the same visual
    // walk. This ensures an invalid optional field above a required empty field
    // receives feedback first.
    for (const element of elementsInVisualOrder) {
      if (synchronousErrors[element.id]) {
        revealInvalidField(element.id);
        return false;
      }

      const validator = validatorsRef.current[element.id];
      if (!validator) continue;
      let isValid = false;
      try {
        isValid = await validator();
      } catch {
        isValid = false;
      }
      if (!isValid) {
        revealInvalidField(element.id);
        return false;
      }
    }

    return true;
  }, [currentValidationElements, isPageBlocked, revealInvalidField]);

  /** Apply variableAssignments for a given page when entering it */
  const applyPageVariableAssignments = useCallback((
    page: import('@/types/form').FunnelPage,
    currentAnswers: Record<string, any>,
    assignedKeys?: Set<string>,
  ) => {
    const f = formRef.current;
    return f ? applyConfiguredPageAssignments(f, page, currentAnswers, assignedKeys) : currentAnswers;
  }, []);

  const authorizeWorkflowCheckpoint = useCallback(async (
    context: WorkflowPathContext,
    targetNodeId: string,
    currentAnswers: Record<string, any>,
  ) => {
    const f = formRef.current;
    if (!f || isEditorPreviewRef.current) return;
    const { data, error } = await invokeEdge<WorkflowDeliveryResponse>('workflow-path-checkpoint', {
      submissionToken: f.submissionToken,
      formId: f.id,
      responseId: sessionMetaRef.current.responseId,
      targetNodeId,
      answers: currentAnswers,
      ...workflowPathFields(context),
    });
    if (error || data?.success !== true) {
      throw error || new Error(data?.error || 'workflow_checkpoint_not_authorized');
    }
    acceptWorkflowPathProof(context, targetNodeId, data.workflowProof);
  }, []);

  /**
   * Walk the workflow graph from `fromNodeId`, evaluating conditions and variable-op nodes.
   * Uses an iterative approach to avoid stale closures.
   *
   * Returns: { nextNodeId, updatedAnswers }
   *   - nextNodeId: 'p-<id>', 'end', or null (no connection defined)
   *   - updatedAnswers: answers after applying all variable operations along the path
   */
  const walkWorkflow = useCallback(async (
    fromNodeId: string,
    currentAnswers: Record<string, any>,
    skipSideEffects = false,
    pathContext?: WorkflowPathContext,
  ): Promise<WorkflowStepResult> => {
    // Em editor preview, pulamos integrações externas (webhooks/pixels/WhatsApp/email) por segurança,
    // mas permitimos nós internos (IA/variáveis/condições) para que o fluxo seja testável.
    const skipExternal = skipSideEffects || isEditorPreviewRef.current;
    const skipAI = skipSideEffects || isEditorPreviewRef.current;
    const f = formRef.current;
    const edges = f?.flowEdges || [];
    const workflowPath = pathContext ?? { sourceNodeId: fromNodeId };

    if (!edges.length) {
      console.warn('[walkWorkflow] No flowEdges defined — canvas has no connections');
      return { nextNodeId: null, updatedAnswers: currentAnswers };
    }

    // Helper: apply all operations of a variable-op node
    const applyVopNode = (vopId: string, ans: Record<string, any>): Record<string, any> => {
      const vop = f?.variableOpNodes?.find(v => v.id === vopId);
      if (!vop || !vop.operations?.length) return ans;
      return applyVariableOperations(vop.operations, f?.variables || [], ans);
    };

    // Iterative graph traversal — no recursion, no stale closures
    let currentNodeId = fromNodeId;
    let currentAns = { ...currentAnswers };
    const visited = new Set<string>();
    const disabledNodes = new Set(f?.disabledNodes || []);

    for (let i = 0; i < 200; i++) {
      if (visited.has(currentNodeId)) {
        console.warn('[walkWorkflow] Cycle detected at node:', currentNodeId);
        break;
      }
      visited.add(currentNodeId);

      const outEdges = edges.filter(e => e.source === currentNodeId);
      if (outEdges.length === 0) {
        // A persisted page without outgoing edges is an intentional terminal
        // destination. Treat it like `end`; malformed intermediate nodes must
        // still emit the routing diagnostics below.
        const terminalPageId = currentNodeId.startsWith('p-')
          ? currentNodeId.slice(2)
          : null;
        if (terminalPageId && f?.pages?.some(page => page.id === terminalPageId)) {
          return { nextNodeId: 'end', updatedAnswers: currentAns };
        }
        console.warn('[walkWorkflow] Dead end — no outgoing edges from:', currentNodeId, '| All edges:', JSON.stringify(edges.map(e => ({ s: e.source, t: e.target }))));
        break;
      }

      // Determine which edge to follow
      let nextEdge = outEdges[0]; // default for ordinary single-output nodes

      // If current node is a condition node, pick branch by evaluation
      if (currentNodeId.startsWith('c-')) {
        const condId = currentNodeId.replace('c-', '');
        const condData = f?.conditions?.find(c => c.id === condId);
        if (!condData) throw new Error(`workflow_condition_missing:${condId}`);

        // Collect all elements from all pages for option-label resolution.
        // A missing matched branch is a broken graph and must never silently
        // fall through to whichever edge happens to be stored first.
        const allElements = f?.pages?.flatMap(p => flattenPageElements(p.elements || [])) || [];
        const matchedBranchId = resolveConditionBranch(condData, currentAns, f?.variables, allElements);
        const handleId = `branch-${matchedBranchId}`;
        const branchEdge = outEdges.find(e => e.sourceHandle === handleId);
        if (!branchEdge) throw new Error(`workflow_condition_branch_unconnected:${condId}:${matchedBranchId}`);
        nextEdge = branchEdge;
      }

      // If current node is an AB test, pick variant by weight
      if (currentNodeId.startsWith('ab-')) {
        const abId = currentNodeId.replace('ab-', '');
        const abNode = f?.abTestNodes?.find(n => n.id === abId);
        if (!abNode?.variants?.length) throw new Error(`workflow_ab_test_missing:${abId}`);
        const weightedVariants = abNode.variants.filter((variant) => Number.isFinite(variant.weight) && variant.weight > 0);
        const totalWeight = weightedVariants.reduce((sum, variant) => sum + variant.weight, 0);
        if (weightedVariants.length === 0 || totalWeight <= 0) throw new Error(`workflow_ab_test_invalid_weights:${abId}`);
        let random = deterministicWorkflowFraction(
          `${sessionMetaRef.current.responseId}:${abId}`,
        ) * totalWeight;
        let chosenVariant = weightedVariants[weightedVariants.length - 1];
        for (const variant of weightedVariants) {
          random -= variant.weight;
          if (random <= 0) { chosenVariant = variant; break; }
        }
        const variantEdge = outEdges.find(e => e.sourceHandle === `ab-${chosenVariant.id}`);
        if (!variantEdge) throw new Error(`workflow_ab_test_variant_unconnected:${abId}:${chosenVariant.id}`);
        nextEdge = variantEdge;
      }

      const target = nextEdge.target;
      // If the target node is disabled, skip it entirely (pass-through)
      if (disabledNodes.has(target) && target !== 'end') {
        currentNodeId = target;
        continue;
      }

      // Terminal: found a page
      if (target.startsWith('p-')) {
        return { nextNodeId: target, updatedAnswers: currentAns };
      }

      // Terminal: end node
      if (target === 'end') {
        return { nextNodeId: 'end', updatedAnswers: currentAns };
      }

      // Intermediate: variable-op node — apply ops and advance
      if (target.startsWith('vo-')) {
        const vopId = target.replace('vo-', '');
        currentAns = applyVopNode(vopId, currentAns);
        currentNodeId = target;
        continue;
      }

      // Intermediate: webhook integration node
      if (target.startsWith('int-')) {
        if (!skipExternal) {
          const intgId = target.replace('int-', '');
          const intgNode = f?.integrationNodes?.find(n => n.id === intgId);
          // The server ledger deduplicates fireOnce nodes and returns a fresh
          // path proof. Never skip this acknowledgement client-side.
          const shouldFire = Boolean(intgNode);
          if (intgNode && f && shouldFire) {
            const eventId = `${f.id}_${intgId}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
            const sourceUrl = typeof window !== 'undefined' ? window.location.href : '';
            const extraParams = Object.fromEntries(
              (intgNode.webhookParams || []).filter(p => p.key).map(p => [
                p.key,
                interpolateText(p.value || '', f.variables || [], currentAns),
              ])
            );
            const { payload: wPayload, userData } = buildWebhookPayload({
              form: f,
              answers: currentAns,
              respondent: { user_agent: sessionMetaRef.current.userAgent },
              responseId: sessionMetaRef.current.responseId,
              responseHash: sessionMetaRef.current.responseHash,
              landedAt: sessionMetaRef.current.landedAt,
              submittedAt: new Date().toISOString(),
              extraParams,
              queryParams: sessionMetaRef.current.queryParams,
              pixelEvents: pixelEventsRef.current,
            });

            const webhookOpts = {
              submissionToken: f.submissionToken,
              nodeId: intgId,
              platform: 'webhook' as const,
              eventName: 'webhook_fired',
              eventId,
              formId: f.id,
              responseId: sessionMetaRef.current.responseId,
              triggerType: 'flow_node' as const,
              sourceUrl,
              webhookUrl: intgNode.webhookUrl,
              webhookMethod: intgNode.webhookMethod,
              webhookPayload: wPayload,
              // Raw form fields already live in webhookPayload.answers_raw.
              // Send only runtime state separately so the Edge resolver can
              // distinguish explicit overrides and resolve context/GET values
              // without nearly doubling the request body.
              answers: selectWebhookRuntimeAnswers(currentAns),
              webhookHeaders: intgNode.webhookHeaders,
              webhookQueryParams: intgNode.webhookQueryParams,
              webhookBodyParams: intgNode.webhookBodyParams,
              userData,
              queryParams: sessionMetaRef.current.queryParams,
              userAgent: sessionMetaRef.current.userAgent,
              ...workflowPathFields(workflowPath),
            };

            const delivery = await fireWebhookWithWorkflowProof(webhookOpts);
            const responseBody = delivery.webhookResponseBody;
            if (responseBody !== null && responseBody !== undefined) {
              // Keep the complete response available to direct webhook
              // conditions and {{webhook:node:path}} interpolation.
              currentAns = applyWebhookResponse(
                currentAns,
                intgId,
                responseBody,
                intgNode.responseMappings || [],
                f.variables || [],
              );
            }
            acceptWorkflowPathProof(workflowPath, target, delivery.workflowProof);
            firedNodesRef.current.add(target);
          }
        }
        currentNodeId = target;
        continue;
      }

      // Intermediate: analytics node — fire server-side with retry (AdBlock-proof)
      if (target.startsWith('an-')) {
        if (!skipExternal) {
          const anId = target.replace('an-', '');
          const anNode = f?.analyticsNodes?.find(n => n.id === anId);
          const shouldFire = Boolean(anNode);
          if (anNode && f && shouldFire) {
            const variables: Record<string, any> = {};
            for (const [k, v] of Object.entries(currentAns)) {
              if (k.startsWith('__var_')) variables[k.replace('__var_', '')] = v;
            }
            const sourceUrl = typeof window !== 'undefined' ? window.location.href : '';

            const platformEntries = anNode.platforms
              ? anNode.platforms.filter(p => p.enabled)
              : anNode.platform
                ? [{ id: anId, platform: anNode.platform, eventType: anNode.eventType || 'Lead', enabled: true, customParams: [] as any[] }]
                : [];

            if (platformEntries.length === 0) {
              throw new WorkflowSideEffectError('o evento de analytics', 1, target);
            }

            const analyticsPath = { ...workflowPath };
            let analyticsProof: string | undefined;
            for (const entry of platformEntries) {
              const eventId = `${f.id}_${anId}_${entry.id}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
              const eventName = entry.eventType === 'custom'
                ? (('customEventName' in entry ? entry.customEventName : undefined) || 'CustomEvent')
                : (entry.eventType || 'Lead');
              const extraParams = Object.fromEntries(
                (entry.customParams || []).filter(p => p.key).map(p => [
                  p.key,
                  interpolateText(p.value || '', f.variables || [], currentAns),
                ])
              );
              const userData = resolveUserData(
                'userDataMapping' in entry ? (entry as any).userDataMapping : undefined,
                currentAns,
                f,
              );

              const delivery = await firePixelDualBlocking({
                submissionToken: f.submissionToken,
                nodeId: anId,
                entryId: entry.id,
                platform: entry.platform,
                eventName,
                eventId,
                formId: f.id,
                responseId: sessionMetaRef.current.responseId,
                triggerType: 'flow_node',
                answers: currentAns,
                variables,
                customParams: extraParams,
                userData,
                sourceUrl,
                userAgent: sessionMetaRef.current.userAgent,
                ...workflowPathFields(analyticsPath),
                onFired: (rec) => pixelEventsRef.current.push(rec),
              });
              analyticsProof = typeof delivery.workflowProof === 'string'
                ? delivery.workflowProof
                : analyticsProof;
            }
            acceptWorkflowPathProof(workflowPath, target, analyticsProof);
            firedNodesRef.current.add(target);
          }
        }
        currentNodeId = target;
        continue;
      }
      // Intermediate: WhatsApp node — processamento bloqueante
      if (target.startsWith('wa-')) {
        if (!skipExternal) {
          const waId = target.replace('wa-', '');
          const waNode = f?.whatsappNodes?.find(n => n.id === waId);
          const shouldFire = Boolean(waNode);
          if (waNode && f && shouldFire) {
            const body: Record<string, any> = {
              submissionToken: f.submissionToken,
              formId: f.id,
              responseId: sessionMetaRef.current.responseId,
              nodeId: waId,
              answers: currentAns,
              ...workflowPathFields(workflowPath),
            };

            const data = await executeWorkflowSideEffect({
              label: 'o envio por WhatsApp',
              nodeId: target,
              operation: (signal) => invokeAcknowledgedWorkflowFunction('whatsapp-send', body, signal),
            });
            acceptWorkflowPathProof(workflowPath, target, data.workflowProof);
            firedNodesRef.current.add(target);
          }
        }
        currentNodeId = target;
        continue;
      }

      // Intermediate: Email node — processamento bloqueante
      if (target.startsWith('em-')) {
        if (!skipExternal) {
          const emId = target.replace('em-', '');
          const emNode = f?.emailNodes?.find(n => n.id === emId);
          const shouldFire = Boolean(emNode);
          if (emNode && f && shouldFire) {
            const body: Record<string, any> = {
              submissionToken: f.submissionToken,
              formId: f.id,
              responseId: sessionMetaRef.current.responseId,
              nodeId: emId,
              answers: currentAns,
              ...workflowPathFields(workflowPath),
            };

            const data = await executeWorkflowSideEffect({
              label: 'o envio de e-mail',
              nodeId: target,
              operation: (signal) => invokeAcknowledgedWorkflowFunction('resend-send', body, signal),
            });
            acceptWorkflowPathProof(workflowPath, target, data.workflowProof);
            firedNodesRef.current.add(target);
          }
        }
        currentNodeId = target;
        continue;
      }

      // Intermediate: A/B Test node — handled above via sourceHandle selection
      if (target.startsWith('ab-')) {
        currentNodeId = target;
        continue;
      }

      // Intermediate: Wait node — stop traversal here. The caller resumes from
      // this node only after the delay, so downstream side effects cannot run early.
      if (target.startsWith('wt-')) {
        const wtId = target.replace('wt-', '');
        const wtNode = f?.waitNodes?.find(n => n.id === wtId);
        if (wtNode) {
          if (!skipExternal) {
            await authorizeWorkflowCheckpoint(workflowPath, target, currentAns);
          }
          const multiplier = wtNode.unit === 'hours' ? 3600000 : wtNode.unit === 'minutes' ? 60000 : 1000;
          const durationMs = (wtNode.duration || 1) * multiplier;
          return {
            nextNodeId: null,
            updatedAnswers: currentAns,
            pendingWait: { durationMs, feedback: wtNode.feedback, resumeFromNodeId: target },
          };
        }
        currentNodeId = target;
        continue;
      }

      // Intermediate: AI node — call ai-process edge function
      if (target.startsWith('ai-')) {
        const aiId = target.replace('ai-', '');
        const aiNode = f?.aiNodes?.find(n => n.id === aiId);

        if (!skipAI) {
          const shouldFire = Boolean(aiNode);
          if (aiNode && f && shouldFire) {
            const body = {
              submissionToken: f.submissionToken,
              formId: f.id,
              responseId: sessionMetaRef.current.responseId,
              nodeId: aiId,
              answers: currentAns,
              ...workflowPathFields(workflowPath),
            };

            // BLOQUEANTE: sempre aguarda a IA antes de avançar
            const data = await executeWorkflowSideEffect({
              label: 'o processamento de IA',
              nodeId: target,
              operation: (signal) => invokeAcknowledgedWorkflowFunction('ai-process', body, signal),
            });
            if (aiNode.outputVariableId) {
              const outVar = f.variables?.find(v => v.id === aiNode.outputVariableId);
              if (outVar) {
                currentAns = { ...currentAns, [`__var_${outVar.name}`]: data.result ?? '' };
              }
            }
            acceptWorkflowPathProof(workflowPath, target, data.workflowProof);
            firedNodesRef.current.add(target);
          }
        }
        currentNodeId = target;
        continue;
      }

      // Intermediate: ImageGen node — fire-and-forget image composition
      if (target.startsWith('ig-')) {
        if (!skipExternal) {
          const igId = target.replace('ig-', '');
          const igNode = f?.imageGenNodes?.find(n => n.id === igId);
          const shouldFire = igNode ? (igNode.fireOnce !== false ? !firedNodesRef.current.has(target) : true) : false;
          if (igNode && f && shouldFire) {
            firedNodesRef.current.add(target);
            // ImageGen composition is handled client-side; store output var if configured
            if (igNode.outputVariableId) {
              const outVar = f?.variables?.find(v => v.id === igNode.outputVariableId);
              if (outVar) {
                // For now, mark as pending — actual canvas rendering happens in preview
                currentAns = { ...currentAns, [`__var_${outVar.name}`]: '__imagegen_pending__' };
              }
            }
          }
        }
        currentNodeId = target;
        continue;
      }

      // Intermediate: Jump node — either route internally or complete and
      // redirect. Existing nodes without destinationType remain page jumps.
      if (target.startsWith('jp-')) {
        const jpId = target.replace('jp-', '');
        const jpNode = f?.jumpNodes?.find(n => n.id === jpId);
        const destinationType = jpNode?.destinationType || (jpNode?.redirectUrl ? 'url' : 'page');
        if (destinationType === 'url' && jpNode?.redirectUrl) {
          return {
            nextNodeId: 'end',
            updatedAnswers: currentAns,
            redirectUrlTemplate: jpNode.redirectUrl,
          };
        }
        if (destinationType === 'page' && jpNode?.targetPageId) {
          // Return with `p-` prefix so goNext can match it correctly
          return { nextNodeId: `p-${jpNode.targetPageId}`, updatedAnswers: currentAns };
        }
        currentNodeId = target;
        continue;
      }

      // Intermediate: condition node — branch selection handled above
      if (target.startsWith('c-')) {
        currentNodeId = target;
        continue;
      }

      // Any other node (start, unknown) — just advance
      console.warn('[walkWorkflow] Unknown node type, advancing through:', target);
      currentNodeId = target;
    }

    // If we reached here, traversal ended without finding a page or 'end' node.
    // Attempt BFS fallback: find the nearest reachable page from the last visited node.
    console.warn('[walkWorkflow] Traversal ended without destination. Last node:', currentNodeId, 'Visited:', [...visited]);
    const bfsQueue = [currentNodeId];
    const bfsVisited = new Set(visited);
    while (bfsQueue.length > 0) {
      const node = bfsQueue.shift()!;
      const outEdges = edges.filter(e => e.source === node);
      for (const edge of outEdges) {
        if (bfsVisited.has(edge.target)) continue;
        bfsVisited.add(edge.target);
        if (edge.target.startsWith('p-')) {
          console.warn('[walkWorkflow] BFS found page:', edge.target);
          return { nextNodeId: edge.target, updatedAnswers: currentAns };
        }
        if (edge.target === 'end') {
          return { nextNodeId: 'end', updatedAnswers: currentAns };
        }
        bfsQueue.push(edge.target);
      }
    }

    console.warn('[walkWorkflow] No reachable page found from:', fromNodeId);
    return { nextNodeId: null, updatedAnswers: currentAns };
  }, [authorizeWorkflowCheckpoint]);

  const preparePageEntryAnswers = useCallback((
    targetIndex: number | null,
    newAnswers: Record<string, any>,
  ) => {
    const currentForm = formRef.current;
    const page = targetIndex === null ? currentForm?.welcomePage : pages[targetIndex];
    if (!page || !currentForm) return newAnswers;

    const sourceKeys = new Set<string>();
    for (const [key, value] of Object.entries(newAnswers)) {
      if (
        key.startsWith('__var_') &&
        !sameRuntimeValue(value, answersRef.current[key])
      ) sourceKeys.add(key);
    }

    const assignedAnswers = applyPageVariableAssignments(page, newAnswers, sourceKeys);
    const refreshed = refreshDynamicDefaults(
      currentForm,
      assignedAnswers,
      initialDefaultsRef.current,
      {
        protectedKeys: protectedDefaultKeysRef.current,
        sourceKeys,
      },
    );
    initialDefaultsRef.current = refreshed.defaults;
    return refreshed.answers;
  }, [applyPageVariableAssignments, pages]);

  // Helper: navigate forward to a page index, pushing current to history
  const navigateToPage = useCallback((targetIndex: number, newAnswers: Record<string, any>) => {
    if (currentPageIndex !== null) {
      pageHistoryRef.current.push(currentPageIndex);
    }
    const finalAnswers = preparePageEntryAnswers(targetIndex, newAnswers);
    answersRef.current = finalAnswers;
    setAnswers(finalAnswers);
    setWorkflowError(null);
    setCurrentPageIndex(targetIndex);
  }, [currentPageIndex, preparePageEntryAnswers]);

  const waitForWorkflowNode = useCallback(async (pending: PendingWorkflowWait) => {
    const fb = pending.feedback || { mode: 'button_countdown' as WaitFeedbackMode };
    const mode = fb.mode || 'button_countdown';
    const originalDurationMs = pending.durationMs;
    const skipAction = fb.skipAction || 'continue';
    const storageNamespace = isEditorPreviewRef.current ? 'preview' : 'public';
    const waitStorageKey = `__wait_${storageNamespace}_${formRef.current?.id || id}_${pending.resumeFromNodeId}`;

    let startedAt = Date.now();
    let effectiveDurationMs = originalDurationMs;
    try {
      const stored = sessionStorage.getItem(waitStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Number.isFinite(parsed.startedAt)) startedAt = parsed.startedAt;
        if (Number.isFinite(parsed.effectiveDurationMs)) effectiveDurationMs = parsed.effectiveDurationMs;
      }
    } catch {
      // Session storage can be unavailable; the wait still works in memory.
    }

    if (Date.now() - startedAt >= effectiveDurationMs) {
      try { sessionStorage.removeItem(waitStorageKey); } catch { /* unavailable */ }
      return {};
    }

    const persistWait = (durationMs: number) => {
      try {
        sessionStorage.setItem(waitStorageKey, JSON.stringify({
          startedAt,
          effectiveDurationMs: durationMs,
        }));
      } catch {
        // Session storage can be unavailable.
      }
    };
    persistWait(effectiveDurationMs);

    const remainingMs = Math.max(0, effectiveDurationMs - (Date.now() - startedAt));
    setWaitFeedback({
      active: true,
      mode,
      durationMs: effectiveDurationMs,
      remainingMs,
      buttonText: fb.buttonText,
      loadingStyle: fb.loadingStyle,
      loadingLabel: fb.loadingLabel,
      allowSkip: fb.allowSkip || false,
    });

    if (fb.showToast) {
      sonnerToast(fb.toastTitle || 'Processando...', {
        description: fb.toastDescription || undefined,
        duration: remainingMs,
      });
    }

    const reduceUnit = fb.skipReduceUnit || 'seconds';
    const reduceAmount = fb.skipReduceAmount || 5;
    const reductionMs = reduceAmount * (reduceUnit === 'hours' ? 3_600_000 : reduceUnit === 'minutes' ? 60_000 : 1_000);
    const signal = { cancelled: false, reductionRequests: 0 };
    (window as any).__waitCancelRef = signal;
    (window as any).__waitSkipAction = skipAction;
    (window as any).__waitSkipFeedback = fb;

    try {
      const outcome = await waitForAdjustableDuration({
        startedAt,
        durationMs: effectiveDurationMs,
        reductionMs,
        signal,
        onDurationChange: persistWait,
        onTick: (remaining, duration) => {
          setWaitFeedback((previous) => previous ? {
            ...previous,
            remainingMs: remaining,
            durationMs: duration,
          } : null);
        },
      });

      if (outcome.skipped && skipAction === 'go_to_page' && fb.skipTargetPageId) {
        return { targetNodeId: `p-${fb.skipTargetPageId}` };
      }
      return {};
    } finally {
      setWaitFeedback(null);
      try { sessionStorage.removeItem(waitStorageKey); } catch { /* unavailable */ }
      delete (window as any).__waitCancelRef;
      delete (window as any).__waitSkipAction;
      delete (window as any).__waitSkipFeedback;
    }
  }, [id]);


  const goNext = useCallback(async () => {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    lastWorkflowActionRef.current = { kind: 'next' };
    setWorkflowError(null);
    setIsFlowProcessing(true);

    try {
      if (!await validateCurrentPageBeforeNavigation()) return;

      setDirection(1);

      const fromNodeId = currentPageIndex === null ? 'start' : `p-${pages[currentPageIndex].id}`;

      // Use answersRef.current to always get the latest state — avoids stale closure
      const latestAnswers = answersRef.current;
      const workflowPath: WorkflowPathContext = { sourceNodeId: fromNodeId };
      const initialResult = await walkWorkflow(fromNodeId, latestAnswers, isPreviewMode, workflowPath);
      const { nextNodeId, updatedAnswers, redirectUrlTemplate } = await resolveWorkflowWaits(
        initialResult,
        (resumeFromNodeId, resumedAnswers) => walkWorkflow(resumeFromNodeId, resumedAnswers, isPreviewMode, workflowPath),
        waitForWorkflowNode,
      );

      if (redirectUrlTemplate) {
        await finishForm(updatedAnswers, redirectUrlTemplate);
        return;
      }

      if (nextNodeId === 'end') {
        // Apply any variable ops that ran along the path to 'end'
        await finishForm(updatedAnswers);
        return;
      }

      if (nextNodeId && nextNodeId.startsWith('p-')) {
        const pageId = nextNodeId.replace('p-', '');
        const targetIndex = pages.findIndex(p => p.id === pageId);
        if (targetIndex !== -1) {
          // Skip empty pages in workflow-resolved navigation
          if (isPageEmpty(pages[targetIndex])) {
            if (!isPreviewMode) {
              await authorizeWorkflowCheckpoint(workflowPath, `p-${pageId}`, updatedAnswers);
            }
            // Recursively navigate from this empty page
            const emptyInitialResult = await walkWorkflow(`p-${pageId}`, updatedAnswers, isPreviewMode, workflowPath);
            const {
              nextNodeId: n2,
              updatedAnswers: a2,
              redirectUrlTemplate: nestedRedirectUrlTemplate,
            } = await resolveWorkflowWaits(
              emptyInitialResult,
              (resumeFromNodeId, resumedAnswers) => walkWorkflow(resumeFromNodeId, resumedAnswers, isPreviewMode, workflowPath),
              waitForWorkflowNode,
            );
            if (nestedRedirectUrlTemplate) {
              await finishForm(a2, nestedRedirectUrlTemplate);
              return;
            }
            if (n2 === 'end') { await finishForm(a2); return; }
            if (n2 && n2.startsWith('p-')) {
              const idx2 = pages.findIndex(p => p.id === n2.replace('p-', ''));
              if (idx2 !== -1) {
                navigateToPage(idx2, a2);
                return;
              }
            }
            // No workflow connection from empty page — fall through to sequential from this index
            const nextNonEmpty = (() => {
              for (let i = targetIndex + 1; i < pages.length; i++) {
                if (!isPageEmpty(pages[i])) return i;
              }
              return -1;
            })();
            // Prevent dead-end loops (e.g. jumping back to the same current page)
            if (nextNonEmpty !== -1 && (currentPageIndex === null || nextNonEmpty > currentPageIndex)) {
              navigateToPage(nextNonEmpty, updatedAnswers);
              return;
            }
            await finishForm(updatedAnswers);
            return;
          }
          navigateToPage(targetIndex, updatedAnswers);
          return;
        }
      }

      // Canvas is the single source of truth for execution order.
      // If walkWorkflow returned null, check if we have ANY flow edges defined.
      const allFormEdges = formRef.current?.flowEdges || [];
      const hasAnyFlowEdges = allFormEdges.length > 0;
      const currentNodeOutEdges = allFormEdges.filter(e => e.source === fromNodeId);

      // Helper: sequential fallback (used only as recovery or when no canvas exists)
      const findNextNonEmpty = (startIdx: number): number => {
        for (let i = startIdx; i < pages.length; i++) {
          if (!isPageEmpty(pages[i])) return i;
        }
        return -1;
      };

      if (hasAnyFlowEdges) {
        console.error('[goNext] walkWorkflow returned null. fromNode:', fromNodeId,
          '| outEdges from current:', currentNodeOutEdges.length,
          '| totalEdges:', allFormEdges.length,
          '| edges:', JSON.stringify(allFormEdges.map(e => ({ s: e.source, t: e.target }))));

        // RECOVERY 1: If the current page HAS outgoing edges but walkWorkflow failed,
        // try a simple BFS to find the next page directly from the edges.
        if (currentNodeOutEdges.length > 0) {
          console.warn('[goNext] Attempting BFS recovery from:', fromNodeId);
          const bfsQueue = currentNodeOutEdges.map(e => e.target);
          const bfsVisited = new Set<string>([fromNodeId]);
          while (bfsQueue.length > 0) {
            const node = bfsQueue.shift()!;
            if (bfsVisited.has(node)) continue;
            bfsVisited.add(node);
            if (node.startsWith('p-')) {
              const pageId = node.replace('p-', '');
              const idx = pages.findIndex(p => p.id === pageId);
              if (idx !== -1) {
                console.warn('[goNext] BFS recovery found page:', node);
                navigateToPage(idx, updatedAnswers);
                return;
              }
            }
            if (node === 'end') {
              await finishForm(updatedAnswers);
              return;
            }
            for (const e of allFormEdges) {
              if (e.source === node && !bfsVisited.has(e.target)) bfsQueue.push(e.target);
            }
          }
        }

        // RECOVERY 2: Never finish the form just because routing failed.
        // If the current node is disconnected/mismatched, fall back to sequential.
        const startIdx = currentPageIndex === null ? 0 : currentPageIndex + 1;
        const seqIdx = findNextNonEmpty(startIdx);
        if (seqIdx !== -1) {
          console.warn('[goNext] Recovery: falling back to sequential navigation. fromNode:', fromNodeId, '| toIndex:', seqIdx);
          navigateToPage(seqIdx, updatedAnswers);
          return;
        }

        await finishForm(updatedAnswers);
        return;
      }

      // Legacy fallback: sequential navigation ONLY when NO flow edges are defined at all
      // (forms without any canvas connections)
      if (currentPageIndex === null) {
        const idx = findNextNonEmpty(0);
        if (idx !== -1) {
          navigateToPage(idx, updatedAnswers);
        } else {
          await finishForm(updatedAnswers);
        }
      } else if (currentPageIndex < pages.length - 1) {
        const idx = findNextNonEmpty(currentPageIndex + 1);
        if (idx !== -1) {
          navigateToPage(idx, updatedAnswers);
        } else {
          await finishForm(updatedAnswers);
        }
      } else {
        await finishForm(updatedAnswers);
      }
    } catch (error) {
      console.error('[workflow] navigation blocked before delivery acknowledgement:', error);
      setWorkflowError(getWorkflowFailureMessage(error));
    } finally {
      setIsFlowProcessing(false);
      navigatingRef.current = false;
    }
  }, [currentPageIndex, pages, validateCurrentPageBeforeNavigation, navigateToPage, walkWorkflow, isPageEmpty, isPreviewMode, waitForWorkflowNode, finishForm, authorizeWorkflowCheckpoint]);

  // Forms without a welcome screen still enter through the canvas start node.
  // Keeping initial content hidden avoids flashing page[0] before conditions,
  // variables, waits or jumps resolve the actual first page.
  useEffect(() => {
    if (!initialFlowPendingRef.current) return;
    initialFlowPendingRef.current = false;
    let mounted = true;

    void goNext()
      .catch((error) => {
        console.error('[initial workflow] failed to resolve start node:', error);
        const firstPageIndex = pages.findIndex((page) => !isPageEmpty(page));
        if (firstPageIndex !== -1) navigateToPage(firstPageIndex, answersRef.current);
      })
      .finally(() => {
        if (mounted) setIsInitialStateReady(true);
      });

    return () => { mounted = false; };
  }, [form.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Apply SEO meta tags — deferred to avoid blocking first paint ──
  useEffect(() => {
    if (isPreviewMode || !form) return;

    // SEO tags don't affect visual rendering — defer
    const schedule = typeof requestIdleCallback === 'function' ? requestIdleCallback : (fn: () => void) => setTimeout(fn, 50);
    schedule(() => {
      const seo = resolveFormSeo({
        id: form.id,
        title: form.title,
        description: form.description,
        status: form.status,
        updatedAt: form.updatedAt,
        brand: form.brand,
        seo: form.seo,
        preview: { primaryColor: form.style?.buttonBgColor || form.style?.primaryColor },
      }, { origin: window.location.origin });
      document.title = seo.title;

      const setMeta = (name: string, content: string, attr = 'name') => {
        let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
        if (!el) { el = document.createElement('meta'); el.setAttribute(attr, name); document.head.appendChild(el); }
        el.content = content;
      };
      setMeta('description', seo.description);
      setMeta('keywords', seo.keywords);
      setMeta('author', seo.author);
      setMeta('creator', seo.author);
      setMeta('robots', seo.robots);
      setMeta('theme-color', seo.themeColor);
      setMeta('og:title', seo.title, 'property');
      setMeta('og:description', seo.description, 'property');
      setMeta('og:type', seo.ogType, 'property');
      setMeta('og:url', seo.canonicalUrl, 'property');
      setMeta('og:site_name', seo.siteName, 'property');
      setMeta('og:locale', seo.locale, 'property');
      setMeta('og:image', seo.imageUrl, 'property');
      setMeta('og:image:secure_url', seo.imageUrl, 'property');
      setMeta('og:image:type', seo.imageType, 'property');
      setMeta('og:image:width', String(seo.imageWidth), 'property');
      setMeta('og:image:height', String(seo.imageHeight), 'property');
      setMeta('og:image:alt', seo.imageAlt, 'property');
      setMeta('twitter:card', seo.twitterCard);
      setMeta('twitter:title', seo.title);
      setMeta('twitter:description', seo.description);
      setMeta('twitter:image', seo.imageUrl);
      setMeta('twitter:image:alt', seo.imageAlt);
      setMeta('pinterest-rich-pin', 'true');
      setMeta('pinterest:title', seo.title);
      setMeta('pinterest:description', seo.description);
      setMeta('pinterest:image', seo.imageUrl);

      let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
      if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.appendChild(canonical); }
      canonical.href = seo.canonicalUrl;
      let favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
      if (!favicon) { favicon = document.createElement('link'); favicon.rel = 'icon'; document.head.appendChild(favicon); }
      favicon.href = seo.faviconUrl;

      let script = document.getElementById('form-seo-jsonld') as HTMLScriptElement | null;
      if (!script) { script = document.createElement('script'); script.id = 'form-seo-jsonld'; script.type = 'application/ld+json'; document.head.appendChild(script); }
      script.textContent = serializeJsonLdForHtml(seo.jsonLd);
    });
  }, [form, isPreviewMode]);

  const goBack = useCallback(() => {
    // A pending wait, integration or completion owns the navigation lane. Going
    // back while it is still resolving can otherwise let the stale async result
    // jump forward from a different page.
    if (navigatingRef.current) return;
    // A public completion is canonical/immutable. Reopening it for edits would
    // let the respondent see a second "success" even though the backend keeps
    // the first acknowledged payload. Preview remains freely reversible.
    if (finished && !isPreviewMode) return;
    setDirection(-1);
    setFieldErrors({});
    setWorkflowError(null);
    if (finished) {
      setFinished(false);
      completionRequestedRef.current = false;
      completionAcknowledgedRef.current = false;
      completionQueueAvailableRef.current = false;
      completionSavePromiseRef.current = null;
      completionRedirectTemplateRef.current = null;
      setResolvedRedirectUrl(null);
      setCompletionError(null);
      if (currentPageIndex !== null) {
        const refreshedAnswers = preparePageEntryAnswers(currentPageIndex, answersRef.current);
        answersRef.current = refreshedAnswers;
        setAnswers(refreshedAnswers);
      }
      return;
    }
    // Use navigation history to go back to the actual previous page in the flow
    const history = pageHistoryRef.current;
    if (history.length > 0) {
      const prevIndex = history.pop()!;
      const refreshedAnswers = preparePageEntryAnswers(prevIndex, answersRef.current);
      answersRef.current = refreshedAnswers;
      setAnswers(refreshedAnswers);
      setCurrentPageIndex(prevIndex);
      return;
    }
    // No history — go to welcome if available
    if (currentPageIndex !== null && form?.showWelcomeScreen) {
      const refreshedAnswers = preparePageEntryAnswers(null, answersRef.current);
      answersRef.current = refreshedAnswers;
      setAnswers(refreshedAnswers);
      setCurrentPageIndex(null);
    }
  }, [currentPageIndex, finished, form?.showWelcomeScreen, isPreviewMode, preparePageEntryAnswers]);

  const setAnswer = useCallback((elementId: string, value: any) => {
    protectedDefaultKeysRef.current.add(elementId);
    const pagesToSearch = [
      ...(formRef.current.pages || []),
      formRef.current.welcomePage,
      formRef.current.thankYouPage,
    ].filter(Boolean);
    const configuredElement = pagesToSearch
      .flatMap(page => flattenPageElements(page?.elements || []))
      .find(candidate => candidate.id === elementId);
    const boundVariable = formRef.current.variables?.find(
      variable => configuredElement?.variableId === variable.id,
    );
    if (boundVariable) protectedDefaultKeysRef.current.add(`__var_${boundVariable.name}`);
    // Once validation has been attempted, keep the visible state truthful on
    // every edit. It only returns to the theme after the value is actually
    // valid, and becomes invalid again if a corrected required value is erased.
    setFieldErrors(prev => {
      const validationWasAttempted = validationAttemptedElementsRef.current.has(elementId);
      const nextError = validationWasAttempted
        ? getRequiredFieldErrors(currentValidationElementsRef.current, {
          ...answersRef.current,
          [elementId]: value,
        })[elementId]
        : undefined;

      if (nextError) {
        if (prev[elementId] === nextError) return prev;
        return { ...prev, [elementId]: nextError };
      }
      if (prev[elementId]) {
        const next = { ...prev };
        delete next[elementId];
        return next;
      }
      return prev;
    });
    setAnswers(prev => {
      const next = { ...prev, [elementId]: value };
      // Flatten compound field sub-values (e.g. address.street, company.razao_social)
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        for (const [subKey, subVal] of Object.entries(value)) {
          if (subVal !== undefined && subVal !== null) {
            next[`${elementId}.${subKey}`] = String(subVal);
          }
        }
      }
      const withVariableBinding = applyElementVariableBinding(formRef.current, elementId, value, next);
      // Keep ref in sync immediately to avoid stale saves on fast submit/navigation
      answersRef.current = withVariableBinding;
      return withVariableBinding;
    });
  }, []);

  // Auto-continue: after a single-selection field completes the page, advance automatically
  const handleSelectionMade = useCallback((elementType: PageElement['type']) => {
    // This is called ~500ms after the selection (after tactile animation)
    if (navigatingRef.current || isFlowProcessing) return;
    // A respondent may open a date picker or another modal during the tactile
    // delay. Never let the older selection close that newer interaction by
    // navigating underneath it.
    if (typeof document !== 'undefined' && document.querySelector('[role="dialog"]')) return;
    // Multi-value controls need an explicit manual advance because the first
    // toggle cannot tell us that the respondent finished choosing.
    if (elementType === 'input_multi_select' || elementType === 'input_checkbox') return;
    const pageElements = currentPageIndex !== null
      ? pages[currentPageIndex]?.elements
      : (formRef.current?.showWelcomeScreen ? formRef.current.welcomePage?.elements : undefined);
    if (!pageElements) return;

    // Auto-advance only when the click filled the final unanswered input.
    // Optional fields still count here; manual navigation may leave them blank.
    const latestAns = answersRef.current;
    const allFieldsAnswered = !hasUnansweredInputFields(pageElements, latestAns);

    // Also check no elements are blocked (e.g. email validation in progress)
    const anyBlocked = flattenPageElements(pageElements).some(el => blockedElements[el.id]);
    if (anyBlocked) return;

    if (allFieldsAnswered) {
      goNext();
    }
  }, [currentPageIndex, pages, goNext, isFlowProcessing, blockedElements]);

  const handleButtonNavigate = useCallback(async (action: 'next' | 'previous' | 'specific' | 'finish', targetPageId?: string) => {
    // Automated elements (loading/timer) share this path with explicit action
    // buttons. Never let an automation navigate underneath an active picker or
    // dialog: doing so discards the respondent's in-progress interaction.
    if (typeof document !== 'undefined' && document.querySelector('[role="dialog"]')) return;
    if (action === 'next') {
      await goNext();
      return;
    }
    if (action === 'previous') {
      goBack();
      return;
    }
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    lastWorkflowActionRef.current = { kind: 'button', action, targetPageId };
    setWorkflowError(null);
    setIsFlowProcessing(true);

    try {
      if (!await validateCurrentPageBeforeNavigation()) return;

      const fromNodeId = currentPageIndex === null ? 'start' : `p-${pages[currentPageIndex].id}`;
      const workflowPath: WorkflowPathContext = { sourceNodeId: fromNodeId };
      const initialResult = await walkWorkflow(fromNodeId, answersRef.current, isPreviewMode, workflowPath);
      const { updatedAnswers, redirectUrlTemplate } = await resolveWorkflowWaits(
        initialResult,
        (resumeFromNodeId, resumedAnswers) => walkWorkflow(resumeFromNodeId, resumedAnswers, isPreviewMode, workflowPath),
        waitForWorkflowNode,
      );

      if (redirectUrlTemplate) {
        setDirection(1);
        await finishForm(updatedAnswers, redirectUrlTemplate);
        return;
      }

      if (action === 'finish') {
        setDirection(1);
        await finishForm(updatedAnswers);
        return;
      }

      if (action === 'specific' && targetPageId) {
        const targetIndex = pages.findIndex((page) => page.id === targetPageId);
        if (targetIndex !== -1) {
          setDirection(targetIndex > (currentPageIndex ?? -1) ? 1 : -1);
          navigateToPage(targetIndex, updatedAnswers);
        }
      }
    } catch (error) {
      console.error('[workflow] button action blocked before delivery acknowledgement:', error);
      setWorkflowError(getWorkflowFailureMessage(error));
    } finally {
      setIsFlowProcessing(false);
      navigatingRef.current = false;
    }
  }, [goNext, goBack, pages, currentPageIndex, walkWorkflow, navigateToPage, isPreviewMode, validateCurrentPageBeforeNavigation, waitForWorkflowNode, finishForm]);

  const retryLastWorkflowAction = useCallback(() => {
    const previous = lastWorkflowActionRef.current;
    if (previous.kind === 'button') {
      void handleButtonNavigate(previous.action, previous.targetPageId);
      return;
    }
    void goNext();
  }, [goNext, handleButtonNavigate]);

  // Keyboard navigation: Enter = next (always), ArrowDown = next (except last page), ArrowUp = back
  const isLastPage = isFlowLastPage;
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tag = target.tagName;
      const isTextarea = tag === 'TEXTAREA';
      const inputType = tag === 'INPUT' ? (target as HTMLInputElement).type : '';
      const ownsEnter = tag === 'BUTTON'
        || tag === 'A'
        || tag === 'SELECT'
        || target.isContentEditable
        || (tag === 'INPUT' && ['button', 'checkbox', 'file', 'radio', 'range', 'reset', 'submit'].includes(inputType));
      const ownsArrowKeys = ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(tag)
        || target.isContentEditable;

      if (e.key === 'Enter' && !isTextarea && !ownsEnter) {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowDown' && !ownsArrowKeys && !isLastPage) {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowUp' && !ownsArrowKeys) {
        e.preventDefault();
        goBack();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goNext, goBack, isLastPage]);

  // Build full-page background style from form design settings (must be before early returns)
  const outerContainerStyle = useMemo((): React.CSSProperties => {
    if (!form) return {};
    const pageStyle = form.globalPageStyle || {};
    const fontFamily = normalizeFontFamily(pageStyle.fontFamily || form.style?.fontFamily);
    const formStyle = form.style;
    const s: React.CSSProperties = {
      fontFamily,
      ...buildFormBackgroundStyle(formStyle, pageStyle.backgroundColor),
    };

    if (formStyle?.textColor) {
      s.color = formStyle.textColor;
    }

    // Override --primary inside form preview to match the form's configured primary color
    if (formStyle?.primaryColor) {
      (s as any)['--primary'] = formStyle.primaryColor;
    }

    return s;
  }, [form]);

  const isBootstrapping = !isInitialStateReady;

  const screenKey = getFormScreenKey(finished, currentPageIndex, currentPage?.id);
  const screenMotion = getFormScreenMotion(prefersReducedMotion);

  const hasVariables = (form.variables?.length ?? 0) > 0;

  return (
    <LazyMotion features={domAnimation} strict>
    <main role="main">
    <motion.div
      initial={false}
      animate={{ opacity: 1 }}
      className="min-h-screen flex flex-col relative"
      style={outerContainerStyle}
    >

      {/* Close — only visible when opened from the editor (not inside iframe) */}
      {isPreviewMode && window.self === window.top && (
        <div className="absolute top-4 right-4 z-20">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/editor/${id}`)}>
            <X className="h-5 w-5" />
          </Button>
        </div>
      )}

      {/* Progress + Logo — unified top bar */}
      {(() => {
        const hasProgress = !isWelcome && !isThankYou && form?.showProgressBar !== false;
        const hasLogo = !!form.style?.logoUrl;
        if (!hasProgress && !hasLogo) return null;
        return (
          <div className="px-4 md:px-8 pt-4 flex items-center gap-4">
            {hasLogo && (
              <img
                src={form.style!.logoUrl}
                alt="Logo do formulário"
                className="object-contain flex-shrink-0"
                style={{ height: form.style!.logoHeight || 40, maxWidth: 128 }}
                width={128}
                height={form.style!.logoHeight || 40}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                loading="eager"
              />
            )}
            {hasProgress && (
              <div className="flex-1">
                <Progress value={progress} className="h-1" />
              </div>
            )}
          </div>
        );
      })()}

      {/* Content */}
      {(() => {
        const pageStyle = form.globalPageStyle || {};
        const headingFontFamily = normalizeFontFamily(form.style?.headingFontFamily || pageStyle.fontFamily || form.style?.fontFamily);
        const bodyFontFamily = normalizeFontFamily(form.style?.bodyFontFamily || pageStyle.fontFamily || form.style?.fontFamily);
        const paddingX = pageStyle.paddingX ?? 24;
        const mobilePaddingX = Math.min(paddingX, 16);
        const paddingY = pageStyle.paddingY ?? 32;
        const gap = pageStyle.gap ?? 32;

        // Only show default welcome if welcome screen is enabled AND has no custom elements
        const showDefaultWelcome = isWelcome && form.showWelcomeScreen && (!form.welcomePage?.elements?.length);
        const showDefaultThankYou = isThankYou && !form.thankYouPage?.elements?.length;
        const isDefaultScreen = showDefaultWelcome || showDefaultThankYou;
        const contentContainerStyle = isDefaultScreen ? { maxWidth: 672, padding: '32px 16px' } : {
          maxWidth: 672 + paddingX * 2,
          paddingLeft: `clamp(${mobilePaddingX}px, 4vw, ${paddingX}px)`,
          paddingRight: `clamp(${mobilePaddingX}px, 4vw, ${paddingX}px)`,
          paddingTop: paddingY,
          paddingBottom: paddingY,
        };

        const screenUsesInteractiveElements = (
          (isWelcome && form.showWelcomeScreen && (form.welcomePage?.elements?.length ?? 0) > 0) ||
          (isThankYou && (form.thankYouPage?.elements?.length ?? 0) > 0) ||
          (!!currentPage && (currentPage.elements?.length ?? 0) > 0)
        );

        // Mount the content when data is ready; gate animation start with animationFrameReady
        // so the browser paints the initial (invisible) state before framer-motion animates.
        const contentReady = !isBootstrapping && (!screenUsesInteractiveElements || isInteractiveElementReady);

        return (

          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-auto flex flex-col relative"
          >
            <AnimatePresence mode="wait" custom={direction}>
              {contentReady && (
              <motion.div
                key={screenKey}
                data-testid={`form-screen-${screenKey}`}
                custom={direction}
                variants={screenMotion.variants}
                initial="enter"
                animate={animationFrameReady ? 'center' : 'enter'}
                exit="exit"
                transition={screenMotion.transition}
                className="w-full mx-auto my-auto"
                style={contentContainerStyle}
              >
              <Suspense fallback={null}>
                {/* Default welcome (no custom elements) */}
                {showDefaultWelcome && (
                  <div className="text-center space-y-4 md:space-y-5">
                    <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-foreground" style={{ fontFamily: headingFontFamily }}>
                      {form.welcomeTitle || form.title}
                    </h1>
                    <p className="text-base md:text-lg text-muted-foreground" style={{ fontFamily: bodyFontFamily }}>
                      {form.welcomeDescription || form.description || 'Clique em começar para iniciar.'}
                    </p>
                    <Button size="lg" onClick={goNext} className="mt-6 md:mt-8 text-base px-6 md:px-8 py-3 h-auto">
                      Começar
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </div>
                )}

                {/* Welcome with custom elements */}
                {isWelcome && form.showWelcomeScreen && (form.welcomePage?.elements?.length ?? 0) > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap }}>
                    {form.welcomePage!.elements.map((el, elIdx) => {
                      const isField = el.type.startsWith('input_');
                      const fieldIndex = isField
                        ? form.welcomePage!.elements.slice(0, elIdx + 1).filter(e => e.type.startsWith('input_')).length
                        : elIdx + 1;
                      return (
                        <InteractiveElement
                          key={el.id}
                          element={el}
                          value={answers[el.id]}
                          onChange={v => setAnswer(el.id, v)}
                          stepNumber={fieldIndex}
                          letterOffset={0}
                          onBlockedChange={blocked => setElementBlocked(el.id, blocked)}
                          registerValidator={validator => registerValidator(el.id, validator)}
                          onNavigate={handleButtonNavigate}
                          variables={form.variables || []}
                          answers={answers}
                          fieldError={fieldErrors[el.id]}
                          formStyle={form.style}
                          onSelectionMade={handleSelectionMade}
                          onElementChange={setAnswer}
                          onElementBlockedChange={setElementBlocked}
                          registerElementValidator={registerValidator}
                          fieldErrors={fieldErrors}
                          publicValidationContext={!isPreviewMode ? {
                            formId: form.id,
                            submissionToken: form.submissionToken,
                            responseId: sessionMetaRef.current.responseId,
                          } : undefined}
                        />
                      );
                    })}
                  </div>
                )}

                {/* Default thank you (no custom elements) */}
                {showDefaultThankYou && (
                  <div className="text-center space-y-4 md:space-y-5">
                    <div className="mx-auto w-16 h-16 md:w-20 md:h-20 bg-primary/10 rounded-full flex items-center justify-center mb-4 md:mb-6">
                      <Check className="h-8 w-8 md:h-10 md:w-10 text-primary" />
                    </div>
                    <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-foreground" style={{ fontFamily: headingFontFamily }}>
                      {form.thankYouTitle || 'Obrigado!'}
                    </h1>
                    <p className="text-base md:text-lg text-muted-foreground" style={{ fontFamily: bodyFontFamily }}>
                      {form.thankYouDescription || (isPreviewMode
                        ? 'Simulação concluída. Nenhuma resposta foi salva.'
                        : 'Suas respostas foram enviadas com sucesso.')}
                    </p>
                    {totalScore > 0 && (
                      <div className="mt-4 p-4 rounded-xl bg-primary/10 border border-primary/20 inline-block">
                        <p className="text-sm text-muted-foreground">Sua pontuação</p>
                        <p className="text-3xl md:text-4xl font-bold text-primary">{totalScore}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Thank you with custom elements */}
                {isThankYou && (form.thankYouPage?.elements?.length ?? 0) > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap }}>
                    {form.thankYouPage!.elements.map((el, elIdx) => {
                      const isField = el.type.startsWith('input_');
                      const fieldIndex = isField
                        ? form.thankYouPage!.elements.slice(0, elIdx + 1).filter(e => e.type.startsWith('input_')).length
                        : elIdx + 1;
                      return (
                        <InteractiveElement
                          key={el.id}
                          element={el}
                          value={answers[el.id]}
                          onChange={v => setAnswer(el.id, v)}
                          stepNumber={fieldIndex}
                          letterOffset={0}
                          onBlockedChange={blocked => setElementBlocked(el.id, blocked)}
                          registerValidator={validator => registerValidator(el.id, validator)}
                          onNavigate={handleButtonNavigate}
                          variables={form.variables || []}
                          answers={answers}
                          fieldError={fieldErrors[el.id]}
                          formStyle={form.style}
                          onSelectionMade={handleSelectionMade}
                          onElementChange={setAnswer}
                          onElementBlockedChange={setElementBlocked}
                          registerElementValidator={registerValidator}
                          fieldErrors={fieldErrors}
                          publicValidationContext={!isPreviewMode ? {
                            formId: form.id,
                            submissionToken: form.submissionToken,
                            responseId: sessionMetaRef.current.responseId,
                          } : undefined}
                        />
                      );
                    })}
                  </div>
                )}

                {/* Page content (normal pages) */}
                {!currentPage && !isWelcome && !isThankYou && (
                  <p className="text-muted-foreground text-center py-8">Carregando campos...</p>
                )}
                {currentPage && !isThankYou && (
                  <>
                    {currentPage.elements.length === 0 ? (
                      <p className="text-muted-foreground text-center py-8">Página sem elementos</p>
                    ) : (
                      (() => {
                        const SELECTION_TYPES = ['input_select', 'input_radio', 'input_multi_select', 'input_quiz_icon', 'input_quiz_image'];
                        let cumulativeLetterOffset = 0;
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap }}>
                            {currentPage.elements.map((el, elIdx) => {
                              const isField = el.type.startsWith('input_');
                              const fieldIndex = isField
                                ? currentPage.elements.slice(0, elIdx + 1).filter(e => e.type.startsWith('input_')).length
                                : elIdx + 1;
                              const letterOffset = SELECTION_TYPES.includes(el.type) ? cumulativeLetterOffset : 0;
                              if (SELECTION_TYPES.includes(el.type)) {
                                cumulativeLetterOffset += (el.options || []).length;
                              }
                              return (
                                <InteractiveElement
                                  key={el.id}
                                  element={el}
                                  value={answers[el.id]}
                                  onChange={v => setAnswer(el.id, v)}
                                  stepNumber={fieldIndex}
                                  letterOffset={letterOffset}
                                  onBlockedChange={blocked => setElementBlocked(el.id, blocked)}
                                  registerValidator={validator => registerValidator(el.id, validator)}
                                  onNavigate={handleButtonNavigate}
                                  variables={form.variables || []}
                                  answers={answers}
                                  fieldError={fieldErrors[el.id]}
                                  formStyle={form.style}
                                  onSelectionMade={handleSelectionMade}
                                  onElementChange={setAnswer}
                                  onElementBlockedChange={setElementBlocked}
                                  registerElementValidator={registerValidator}
                                  fieldErrors={fieldErrors}
                                  publicValidationContext={!isPreviewMode ? {
                                    formId: form.id,
                                    submissionToken: form.submissionToken,
                                    responseId: sessionMetaRef.current.responseId,
                                  } : undefined}
                                />
                              );
                            })}
                          </div>
                        );
                      })()
                    )}
                  </>
                )}
              </Suspense>
              </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })()}

      {completionError && !isThankYou && (
        <div className="fixed bottom-20 left-1/2 z-[70] w-[min(92vw,520px)] -translate-x-1/2 rounded-xl border border-destructive/30 bg-background/95 p-3 shadow-xl backdrop-blur-md">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">Envio ainda não confirmado</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{completionError}</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={isCompleting}
              onClick={() => { void finishForm(answersRef.current); }}
              className="shrink-0"
            >
              {isCompleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Tentar novamente'}
            </Button>
          </div>
        </div>
      )}

      {workflowError && !isThankYou && (
        <div
          role="alert"
          className="fixed bottom-20 left-1/2 z-[70] w-[min(92vw,560px)] -translate-x-1/2 rounded-xl border border-destructive/30 bg-background/95 p-3 shadow-xl backdrop-blur-md"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">Etapa não confirmada</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{workflowError}</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={isFlowProcessing}
              onClick={retryLastWorkflowAction}
              className="shrink-0"
            >
              {isFlowProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Tentar novamente'}
            </Button>
          </div>
        </div>
      )}

      {/* Navigation bar — centered at bottom */}
      {!isWelcome && !isThankYou && (() => {
        const hasActionButtons = flattenPageElements(currentPage?.elements || []).some((element) => (
          element.type === 'button'
          && (
            (element.buttonAction !== undefined && element.buttonAction !== 'none')
            || Boolean(resolveRedirectDestination(element.href, form.variables || [], answers)?.url)
          )
        ));
        if (hasActionButtons) return null;
        const canGoBack = pageHistoryRef.current.length > 0 || (currentPageIndex !== null && !!form?.showWelcomeScreen);
        const isLastPage = isFlowLastPage;
        return (
          <div className="fixed bottom-4 md:bottom-6 left-1/2 -translate-x-1/2 z-50">
            <div className="flex items-center gap-2 bg-card/90 backdrop-blur-md border border-border rounded-full shadow-lg px-2 py-1.5">
              {canGoBack && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={isFlowProcessing || !!waitFeedback || isCompleting ? undefined : goBack}
                  disabled={isFlowProcessing || !!waitFeedback || isCompleting}
                  className="h-9 px-3 gap-1.5 text-xs"
                  style={{
                    backgroundColor: form.style?.backButtonBgColor || 'transparent',
                    color: form.style?.backButtonTextColor || undefined,
                    borderRadius: form.style?.backButtonBorderRadius ?? 9999,
                    border: (form.style?.backButtonBorderWidth ?? 0) > 0
                      ? `${form.style?.backButtonBorderWidth}px solid ${form.style?.backButtonBorderColor || 'transparent'}`
                      : undefined,
                  }}
                  aria-label="Voltar"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Voltar</span>
                </Button>
              )}
              {canGoBack && <div className="w-px h-5 bg-border" />}
              <Button
                variant="default"
                size="sm"
                onClick={waitFeedback || isFlowProcessing ? undefined : goNext}
                disabled={isPageBlocked || !!waitFeedback || isFlowProcessing}
                className="h-9 gap-2 text-xs"
                style={{
                  backgroundColor: form.style?.buttonBgColor || form.style?.primaryColor || undefined,
                  color: form.style?.buttonTextColor || (form.style?.buttonBgColor || form.style?.primaryColor ? '#FFFFFF' : undefined),
                  borderRadius: form.style?.buttonBorderRadius ?? 9999,
                  padding: form.style?.buttonSize === 'sm' ? '6px 18px' : form.style?.buttonSize === 'lg' ? '14px 36px' : '10px 28px',
                  fontSize: form.style?.buttonSize === 'sm' ? 13 : form.style?.buttonSize === 'lg' ? 16 : undefined,
                }}
                aria-label={isLastPage ? 'Enviar' : 'Avançar'}
              >
                {waitFeedback && waitFeedback.mode !== 'loading_screen' ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>
                      {waitFeedback.buttonText || (waitFeedback.mode === 'button_countdown' ? 'Aguarde' : 'Processando...')}
                      {waitFeedback.mode === 'button_countdown' && (
                        <span className="ml-1 tabular-nums">
                          {(() => {
                            const totalSec = Math.ceil(waitFeedback.remainingMs / 1000);
                            const h = Math.floor(totalSec / 3600);
                            const m = Math.floor((totalSec % 3600) / 60);
                            const s = totalSec % 60;
                            const pad = (n: number) => String(n).padStart(2, '0');
                            if (h > 0) return `${pad(h)}h ${pad(m)}m ${pad(s)}s`;
                            if (m > 0) return `${pad(m)}m ${pad(s)}s`;
                            return `${pad(s)}s`;
                          })()}
                        </span>
                      )}
                    </span>
                  </>
                ) : isFlowProcessing ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Pensando...</span>
                  </>
                ) : isPageBlocked ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : isLastPage ? (
                  <>
                    <span>Enviar</span>
                    <Send className="h-3.5 w-3.5" />
                  </>
                ) : (
                  <>
                    <span>Continuar</span>
                    <ArrowDown className="h-3.5 w-3.5" style={{ color: form.style?.buttonTextColor || undefined }} />
                  </>
                )}
              </Button>
              {waitFeedback && waitFeedback.allowSkip && waitFeedback.mode !== 'loading_screen' ? (
                <button
                  onClick={() => {
                    const ref = (window as any).__waitCancelRef;
                    const action = (window as any).__waitSkipAction || 'continue';
                    if (ref) {
                      if (action === 'reduce_time') {
                        ref.reductionRequests = (ref.reductionRequests || 0) + 1;
                      } else {
                        ref.cancelled = true;
                      }
                    }
                  }}
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2 pl-1 pr-1 whitespace-nowrap shrink-0"
                >
                  {(() => {
                    const fb = (window as any).__waitSkipFeedback;
                    if (fb?.skipButtonText) return fb.skipButtonText;
                    const action = (window as any).__waitSkipAction || 'continue';
                    if (action === 'reduce_time') {
                      const amt = fb?.skipReduceAmount || 5;
                      const unit = fb?.skipReduceUnit || 'seconds';
                      const unitLabel = unit === 'hours' ? 'h' : unit === 'minutes' ? 'min' : 's';
                      return `−${amt}${unitLabel}`;
                    }
                    return 'Pular espera';
                  })()}
                </button>
              ) : !waitFeedback ? (
                <div className="hidden sm:flex items-center gap-1 text-[10px] text-muted-foreground/60 pl-1 pr-1">
                  <span>ou</span>
                  <kbd className="inline-flex items-center gap-0.5 rounded border border-border bg-muted/50 px-1 py-0.5 font-mono text-[10px]">
                    Enter <CornerDownLeft className="h-2.5 w-2.5" />
                  </kbd>
                </div>
              ) : null}
            </div>
          </div>
        );
      })()}

      {/* Loading screen overlay for wait feedback mode 'loading_screen' */}
      <AnimatePresence>
        {waitFeedback && waitFeedback.mode === 'loading_screen' && (
          <motion.div
            key="wait-loading-screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-background"
          >
            <div className="w-full max-w-xs px-6 flex flex-col items-center gap-4">
              <Suspense fallback={<div className="h-6 w-6 rounded-full border-2 border-foreground/20 border-t-foreground animate-spin" />}>
                <LoadingPreview
                  style={waitFeedback.loadingStyle || 'bar'}
                  duration={waitFeedback.durationMs / 1000}
                  targetPercent={100}
                  label={waitFeedback.loadingLabel || 'Carregando...'}
                  interactive
                />
              </Suspense>
              {waitFeedback.allowSkip && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const ref = (window as any).__waitCancelRef;
                    const action = (window as any).__waitSkipAction || 'continue';
                    if (ref) {
                      if (action === 'reduce_time') {
                        ref.reductionRequests = (ref.reductionRequests || 0) + 1;
                      } else {
                        ref.cancelled = true;
                      }
                    }
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {(() => {
                    const fb = (window as any).__waitSkipFeedback;
                    if (fb?.skipButtonText) return fb.skipButtonText;
                    const action = (window as any).__waitSkipAction || 'continue';
                    if (action === 'reduce_time') {
                      const amt = fb?.skipReduceAmount || 5;
                      const unit = fb?.skipReduceUnit || 'seconds';
                      const unitLabel = unit === 'hours' ? 'h' : unit === 'minutes' ? 'min' : 's';
                      return `−${amt}${unitLabel}`;
                    }
                    return 'Pular espera';
                  })()}
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
    </main>
    </LazyMotion>
  );
}

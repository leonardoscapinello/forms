import { useParams, useNavigate } from 'react-router-dom';

// Dynamic import — sonner is NOT on the critical rendering path
const sonnerToast: any = (...args: any[]) => {
  import('sonner').then(({ toast }) => (toast as any)(...args));
};
import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Check, X, Star, CheckSquare, Loader2, AlertCircle, CheckCircle2, Info, AlertTriangle, XCircle, Send, CornerDownLeft } from 'lucide-react';
import { LazyMotion, domAnimation, m as motion, AnimatePresence } from 'framer-motion';
import { FunnelPage, FormData as AppFormData, UserDataMapping, FormVariable, FormStyle, WaitFeedbackConfig, WaitFeedbackMode } from '@/types/form';
import { PageElement } from '@/types/pageElements';
import { supabase } from '@/integrations/supabase/client';
import Twemoji from '@/components/Twemoji';
import { interpolateText, interpolateTextToNodes } from '@/lib/variableInterpolation';
import { resolveConditionBranch } from '@/lib/conditionEvaluator';
import { buildWebhookPayload, PixelEventRecord } from '@/lib/webhookPayload';
import { firePixel, firePixelDual, fireWebhookWithResponse } from '@/lib/firePixel';
import { captureSessionContext, requestGeolocation, contextToAnswers } from '@/lib/sessionContext';
import { enqueueTask } from '@/lib/backgroundQueue';
// consumePrefetchedForm/hasPrefetchedForm moved to shell (FormPreview.tsx)
import { validateEmailFormat } from '@/lib/emailValidation';
import { normalizeFontFamily } from '@/lib/fontUtils';
import { buildDefaults, resolveUserData, prefetchLazyComponentsForElements } from './FormPreview.utils';

// InteractiveElement is lazy-loaded to reduce initial parse/compile cost
const InteractiveElement = lazy(() => import('@/components/preview/InteractiveElement'));

// Lazy-loaded heavy preview component used only in loading screen overlay
const loadLoadingPreview = () => import('@/components/preview/LoadingPreview');
const LoadingPreview = lazy(loadLoadingPreview);

// Wrapper to keep Suspense local and avoid route-level blank/loading screens
function LazyWrap({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div className="w-full min-h-24 rounded-xl bg-muted/30 animate-pulse" />}>{children}</Suspense>;
}


interface FormPreviewCoreProps {
  form: AppFormData;
  isEditorPreview: boolean;
}

export default function FormPreviewCore({ form, isEditorPreview }: FormPreviewCoreProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [isInitialStateReady, setIsInitialStateReady] = useState(false);

  // isEditorPreview ref for stable access in callbacks
  const isEditorPreviewRef = useRef(isEditorPreview);

  const [currentPageIndex, setCurrentPageIndex] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [direction, setDirection] = useState(1);
  const [finished, setFinished] = useState(false);
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
  const validatorsRef = useRef<Record<string, () => Promise<boolean>>>({});
  const answersRef = useRef(answers);
  useEffect(() => { answersRef.current = answers; }, [answers]);

  // Track all pixel events fired during this session
  const pixelEventsRef = useRef<PixelEventRecord[]>([]);
  // Track nodes that already fired side-effects (fireOnce dedup)
  const firedNodesRef = useRef(new Set<string>());

  // Capture session metadata once on mount
  const sessionMetaRef = useRef((() => {
    const uuid = crypto.randomUUID();
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
  const sessionDbIdRef = useRef<string | null>(null);
  const maxPageVisitedRef = useRef<number>(-1);
  const pageEnteredAtRef = useRef<number>(Date.now());

  // PRIMARY save method — uses edge function with service role key (bypasses RLS)
  const saveViaBackend = useCallback(async (args: {
    kind: 'response' | 'session';
    action: 'insert' | 'upsert' | 'update';
    payload: Record<string, any>;
    onConflict?: string;
    match?: Record<string, any>;
  }) => {
    try {
      const res = await supabase.functions.invoke('form-public-save', { body: args });
      if (res.error) {
        console.error('[form-public-save] invoke error:', res.error);
      } else if (res.data && !(res.data as any).success) {
        console.error('[form-public-save] server error:', (res.data as any).error);
      }
    } catch (e) {
      console.error('[form-public-save] network error:', e);
    }
  }, []);

  // Initialise answers, page index, and session context once form is loaded
  // Phase 1 (sync): defaults + page index for instant first paint
  // Phase 2 (deferred): session context, geo — via requestIdleCallback
  useEffect(() => {
    if (!form) return;
    setIsInitialStateReady(false);

    const defaults = buildDefaults(form);

    // Try to resume from saved session
    if (form.allowResume && form.id) {
      const storageKey = `form_resume_${form.id}`;
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          const parsedPageIndex = Number(parsed.pageIndex);
          const hasValidSavedIndex = Number.isInteger(parsedPageIndex)
            && parsedPageIndex >= 0
            && parsedPageIndex < (form.pages?.length ?? 0);

          if (parsed.answers && hasValidSavedIndex) {
            setAnswers({ ...defaults, ...parsed.answers });
            setCurrentPageIndex(parsedPageIndex);
            maxPageVisitedRef.current = parsed.maxPage ?? parsedPageIndex;

            prefetchLazyComponentsForElements(form.pages?.[parsedPageIndex]?.elements || [], 'immediate');
            setIsInitialStateReady(true);

            // Capture context after paint
            const sched = typeof requestIdleCallback === 'function' ? requestIdleCallback : (fn: () => void) => setTimeout(fn, 1);
            sched(() => {
              const ctx = captureSessionContext();
              const ctxAns = contextToAnswers(ctx);
              setAnswers(prev => ({ ...ctxAns, ...prev }));
            });
            return;
          }
        }
      } catch { /* ignore corrupt data */ }
    }

    const initialPageIndex = form.showWelcomeScreen ? null : 0;
    const initialElements = initialPageIndex === null
      ? (form.welcomePage?.elements || [])
      : (form.pages?.[initialPageIndex]?.elements || []);

    prefetchLazyComponentsForElements(initialElements, 'immediate');
    setAnswers(defaults);
    setCurrentPageIndex(initialPageIndex);
    setIsInitialStateReady(true);

    // Phase 2: capture session context after first paint — deferred
    const sched = typeof requestIdleCallback === 'function' ? requestIdleCallback : (fn: () => void) => setTimeout(fn, 1);
    sched(() => {
      const ctx = captureSessionContext();
      const ctxAns = contextToAnswers(ctx);
      setAnswers(prev => ({ ...ctxAns, ...prev }));
    });

    // Request geolocation ONLY when explicitly enabled in form settings
    // Uses a one-shot interaction listener to defer the heavy geo call
    if (form.enableGeolocation === true) {
      const geoHandler = () => {
        requestGeolocation().then((geo) => {
          if (geo.source !== 'none') {
            setAnswers(prev => ({
              ...prev,
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
            }));
          }
        });
      };
      // Only trigger on user interaction — never auto-trigger to avoid blocking rendering
      window.addEventListener('pointerdown', geoHandler, { once: true, passive: true });
      return () => window.removeEventListener('pointerdown', geoHandler);
    }
  }, [form?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save session for resume + partial responses
  useEffect(() => {
    if (!form?.id || finished || isEditorPreview) return;
    if (currentPageIndex === null) return;

    const timer = window.setTimeout(() => {
      // Save to localStorage for resume
      if (form.allowResume) {
        const storageKey = `form_resume_${form.id}`;
        try {
          localStorage.setItem(storageKey, JSON.stringify({
            answers: answersRef.current,
            pageIndex: currentPageIndex,
            maxPage: maxPageVisitedRef.current,
            updatedAt: new Date().toISOString(),
          }));
        } catch { /* quota exceeded */ }
      }

      // Save partial response to DB
      if (form.savePartialResponses !== false) {
        const { responseId } = sessionMetaRef.current;
        const sessionId = sessionDbIdRef.current;
        saveViaBackend({
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
        });
      }
    }, 700);

    return () => window.clearTimeout(timer);
  }, [answers, currentPageIndex, form?.id, finished, isEditorPreview]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save partial on beforeunload — use edge function via fetch keepalive
  useEffect(() => {
    if (!form?.id || isEditorPreview) return;
    const handler = () => {
      if (form.savePartialResponses === false) return;
      if (finished) return;
      const { responseId } = sessionMetaRef.current;
      const sessionId = sessionDbIdRef.current;
      const edgeBody = JSON.stringify({
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
              landed_at: sessionMetaRef.current.landedAt,
            },
          pages_visited: maxPageVisitedRef.current + 1,
        },
      });
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/form-public-save`;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      try {
        fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': anonKey,
            'Authorization': `Bearer ${anonKey}`,
          },
          body: edgeBody,
          keepalive: true,
        }).catch(() => {});
      } catch { /* ignore */ }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [form?.id, finished, isEditorPreview]); // eslint-disable-line react-hooks/exhaustive-deps

  // Insert session record on form load — DEFERRED to avoid blocking first paint
  useEffect(() => {
    if (!form?.id || isEditorPreview) return;
    const generatedSessionId = crypto.randomUUID();
    sessionDbIdRef.current = generatedSessionId;

    // Defer session insert to after first paint — not needed for rendering
    const schedule = typeof requestIdleCallback === 'function' ? requestIdleCallback : (fn: () => void) => setTimeout(fn, 50);
    schedule(() => {
      const { responseId, userAgent, queryParams, referrer } = sessionMetaRef.current;
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

      // Insert form_start page event
      ;(supabase as any).from('form_page_events').insert({
        form_id: form.id,
        response_id: responseId,
        event_type: 'form_start',
      }).then(() => {});
    });
  }, [form?.id, isEditorPreview]); // eslint-disable-line react-hooks/exhaustive-deps


  // Fire pixel load events once the form is ready — DEFERRED to avoid blocking first paint
  useEffect(() => {
    if (!form?.id || isEditorPreview) return;
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
  }, [form?.id, isEditorPreview]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track page views & session progress when page changes or form completes
  useEffect(() => {
    if (!form?.id || isEditorPreview) return;
    const { responseId } = sessionMetaRef.current;
    const sessionId = sessionDbIdRef.current;
    const now = new Date().toISOString();
    const timeOnPage = Date.now() - pageEnteredAtRef.current;
    pageEnteredAtRef.current = Date.now();

    if (finished) {
      if (sessionId) {
        saveViaBackend({
          kind: 'session',
          action: 'update',
          match: { id: sessionId },
          payload: {
            status: 'completed',
            completed_at: now,
            last_seen_at: now,
            pages_visited: maxPageVisitedRef.current + 1,
          },
        });
      }
      ;(supabase as any).from('form_page_events').insert({
        session_id: sessionId,
        form_id: form.id,
        response_id: responseId,
        event_type: 'form_complete',
        time_on_page_ms: timeOnPage > 0 ? timeOnPage : null,
      }).then(() => {});

      // Save/update form responses as complete
      const latestAnswers = answersRef.current;
      saveViaBackend({
        kind: 'response',
        action: 'upsert',
        onConflict: 'form_id,response_id',
        payload: {
          form_id: form.id,
          response_id: responseId,
          session_id: sessionId,
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
        },
      });

      // Clear resume data
      if (form.allowResume) {
        try { localStorage.removeItem(`form_resume_${form.id}`); } catch {}
      }

      // Fire completion webhook
      if (form.completionWebhookUrl) {
        const { payload } = buildWebhookPayload({
          form,
          answers: latestAnswers,
          responseId,
          responseHash: sessionMetaRef.current.responseHash,
          landedAt: sessionMetaRef.current.landedAt,
          submittedAt: now,
          queryParams: sessionMetaRef.current.queryParams as Record<string, string>,
          sourceUrl: window.location.href,
          referrer: sessionMetaRef.current.referrer,
          respondent: {
            user_agent: sessionMetaRef.current.userAgent,
          },
          pixelEvents: pixelEventsRef.current,
        });
        fetch(form.completionWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).catch(() => {}); // fire-and-forget
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
      ;(supabase as any).from('form_page_events').insert({
        session_id: sessionId,
        form_id: form.id,
        response_id: responseId,
        page_id: page?.id,
        page_index: currentPageIndex,
        page_title: page?.title,
        event_type: 'page_view',
        time_on_page_ms: currentPageIndex > 0 ? timeOnPage : null,
      }).then(() => {});
    }
  }, [currentPageIndex, finished, form?.id, isEditorPreview]); // eslint-disable-line react-hooks/exhaustive-deps

  // Always-fresh ref to form — avoids stale closures in callbacks
  const formRef = useRef(form);
  useEffect(() => { formRef.current = form; }, [form]);

  // Scroll to top on page change
  useEffect(() => {
    scrollContainerRef.current?.scrollTo({ top: 0 });
  }, [currentPageIndex, finished]);


  const pages = form?.pages || [];
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
    const hasInputFields = page.elements?.some(el => el.type.startsWith('input_'));
    const hasActionButtons = page.elements?.some(el => el.type === 'button');
    const hasOutgoingFlow = (form.flowEdges || []).some(edge => edge.source === `p-${page.id}`);
    const isLastPage = isFlowLastPage;

    if (!hasAnyElements && !hasInputFields && !hasActionButtons && !hasOutgoingFlow && isLastPage) {
      setFinished(true);
    }
  }, [form, finished, currentPageIndex, pages, isFlowLastPage]);

  const totalScore = useMemo(() => {
    if (!form) return 0;
    let score = 0;
    for (const page of form.pages || []) {
      for (const el of page.elements || []) {
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
    if (!currentPage) return false;
    return currentPage.elements.some(el => blockedElements[el.id]);
  }, [currentPage, blockedElements]);

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

  /** Check that all required fields on the current page have a non-empty value */
  const areRequiredFieldsFilled = useCallback(() => {
    if (!currentPage) return true;
    const errors: Record<string, string> = {};
    for (const el of currentPage.elements) {
      if (el.required && el.type.startsWith('input_')) {
        const val = answers[el.id];
        if (val === undefined || val === null || val === '' || val === false) {
          errors[el.id] = el.requiredMessage || 'Preencha este campo';
        }
        // multi_select: require at least one selection
        if (el.type === 'input_multi_select' && Array.isArray(val) && val.length === 0) {
          errors[el.id] = el.requiredMessage || 'Selecione ao menos uma opção';
        }
      }
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return false;
    }
    setFieldErrors({});
    return true;
  }, [currentPage, answers]);

  /** Apply variableAssignments for a given page when entering it */
  const applyPageVariableAssignments = useCallback((page: import('@/types/form').FunnelPage, currentAnswers: Record<string, any>) => {
    const f = formRef.current;
    if (!page.variableAssignments?.length || !f?.variables?.length) return currentAnswers;
    const updated = { ...currentAnswers };
    for (const assignment of page.variableAssignments) {
      const variable = f.variables?.find(v => v.id === assignment.variableId);
      if (!variable) continue;
      if (assignment.sourceType === 'field' && assignment.sourceElementId) {
        const val = currentAnswers[assignment.sourceElementId];
        if (val !== undefined && val !== null) {
          updated[`__var_${variable.name}`] = String(val);
        }
      } else if (assignment.sourceType === 'free') {
        const resolved = interpolateText(assignment.value || '', f.variables || [], currentAnswers);
        updated[`__var_${variable.name}`] = resolved;
      }
    }
    return updated;
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
  ): Promise<{ nextNodeId: string | null; updatedAnswers: Record<string, any>; pendingWait?: { durationMs: number; feedback?: WaitFeedbackConfig; remainingNodeId: string } }> => {
    // SAFETY NET: always skip side-effects in preview mode, regardless of caller
    const effectiveSkip = skipSideEffects || isEditorPreviewRef.current;
    const f = formRef.current;
    const edges = f?.flowEdges || [];

    console.info('[walkWorkflow] START from:', fromNodeId, '| edges:', edges.length, '| effectiveSkip:', effectiveSkip);
    if (edges.length > 0) {
      console.info('[walkWorkflow] Edge map:', edges.map(e => `${e.source} → ${e.target}${e.sourceHandle ? ` [${e.sourceHandle}]` : ''}`).join(' | '));
    }

    if (!edges.length) {
      console.warn('[walkWorkflow] No flowEdges defined — canvas has no connections');
      return { nextNodeId: null, updatedAnswers: currentAnswers };
    }

    // Helper: apply all operations of a variable-op node
    const applyVopNode = (vopId: string, ans: Record<string, any>): Record<string, any> => {
      const vop = f?.variableOpNodes?.find(v => v.id === vopId);
      if (!vop || !vop.operations?.length) return ans;
      const updated = { ...ans };
      for (const op of vop.operations) {
        const variable = f?.variables?.find(v => v.id === op.variableId);
        if (!variable) continue;
        const storeKey = `__var_${variable.name}`;
        const operandType = op.operandType ?? 'literal';

        let resolvedOperand: string;
        if (operandType === 'field') {
          if (!op.operandFieldId) continue;
          const fieldVal = updated[op.operandFieldId];
          if (fieldVal === undefined || fieldVal === null || fieldVal === '') continue;
          resolvedOperand = String(fieldVal);
        } else {
          resolvedOperand = interpolateText(op.operand ?? '', f?.variables || [], updated);
          if (op.op === 'set' && resolvedOperand === '' && (op.operand ?? '') === '') continue;
        }

        if (op.op === 'set') {
          updated[storeKey] = resolvedOperand;
          continue;
        }

        const currentRaw = updated[storeKey] ?? variable.defaultValue ?? '0';
        const currentNum = parseFloat(String(currentRaw)) || 0;
        const operandNum = parseFloat(resolvedOperand) || 0;
        switch (op.op) {
          case 'add':      updated[storeKey] = String(currentNum + operandNum); break;
          case 'subtract': updated[storeKey] = String(currentNum - operandNum); break;
          case 'multiply': updated[storeKey] = String(currentNum * operandNum); break;
          case 'divide':   updated[storeKey] = operandNum !== 0 ? String(currentNum / operandNum) : String(currentNum); break;
          default:         updated[storeKey] = resolvedOperand;
        }
      }
      return updated;
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
        console.warn('[walkWorkflow] Dead end — no outgoing edges from:', currentNodeId, '| All edges:', JSON.stringify(edges.map(e => ({ s: e.source, t: e.target }))));
        break;
      }

      // Determine which edge to follow
      let nextEdge = outEdges[0]; // default: first edge

      // If current node is a condition node, pick branch by evaluation
      if (currentNodeId.startsWith('c-')) {
        const condId = currentNodeId.replace('c-', '');
        const condData = f?.conditions?.find(c => c.id === condId);
        if (condData) {
          const matchedBranchId = resolveConditionBranch(condData, currentAns, f?.variables);
          const handleId = `branch-${matchedBranchId}`;
          const branchEdge = outEdges.find(e => e.sourceHandle === handleId);
          if (branchEdge) nextEdge = branchEdge;
        }
      }

      // If current node is an AB test, pick variant by weight
      if (currentNodeId.startsWith('ab-')) {
        const abId = currentNodeId.replace('ab-', '');
        const abNode = f?.abTestNodes?.find(n => n.id === abId);
        if (abNode && abNode.variants?.length) {
          const totalWeight = abNode.variants.reduce((s, v) => s + v.weight, 0);
          let random = Math.random() * totalWeight;
          let chosenVariant = abNode.variants[0];
          for (const variant of abNode.variants) {
            random -= variant.weight;
            if (random <= 0) { chosenVariant = variant; break; }
          }
          const variantEdge = outEdges.find(e => e.sourceHandle === `ab-${chosenVariant.id}`);
          if (variantEdge) nextEdge = variantEdge;
        }
      }

      const target = nextEdge.target;
      console.info(`[walkWorkflow] Step ${i}: ${currentNodeId} → ${target}`);

      // If the target node is disabled, skip it entirely (pass-through)
      if (disabledNodes.has(target) && target !== 'end') {
        console.info('[walkWorkflow] Skipping disabled node:', target);
        currentNodeId = target;
        continue;
      }

      // Terminal: found a page
      if (target.startsWith('p-')) {
        console.info('[walkWorkflow] ✓ Resolved to page:', target);
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
        if (!effectiveSkip) {
          const intgId = target.replace('int-', '');
          const intgNode = f?.integrationNodes?.find(n => n.id === intgId);
          const shouldFire = intgNode ? (intgNode.fireOnce !== false ? !firedNodesRef.current.has(target) : true) : false;
          if (intgNode && f && shouldFire) {
            firedNodesRef.current.add(target);
          
            const eventId = `${f.id}_${intgId}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
            const sourceUrl = typeof window !== 'undefined' ? window.location.href : '';
            const extraParams = Object.fromEntries(
              (intgNode.webhookParams || []).filter(p => p.key).map(p => [p.key, p.value])
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
              webhookHeaders: intgNode.webhookHeaders,
              webhookQueryParams: intgNode.webhookQueryParams,
              webhookBodyParams: intgNode.webhookBodyParams,
              userData,
              queryParams: sessionMetaRef.current.queryParams,
              userAgent: sessionMetaRef.current.userAgent,
            };

            const hasResponseMappings = intgNode.responseMappings?.some(m => m.responsePath && m.variableId);

            if (hasResponseMappings) {
              try {
                const responseBody = await fireWebhookWithResponse(webhookOpts);
                if (responseBody && intgNode.responseMappings?.length) {
                  const getNestedValue = (obj: any, path: string): any => {
                    const tokens = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
                    return tokens.reduce((acc, key) => acc != null ? acc[key] : undefined, obj);
                  };
                  for (const mapping of intgNode.responseMappings) {
                    if (!mapping.responsePath || !mapping.variableId) continue;
                    const value = getNestedValue(responseBody, mapping.responsePath);
                    if (value !== undefined) {
                      const mappedVar = f?.variables?.find(v => v.id === mapping.variableId);
                      const varKey = mappedVar ? `__var_${mappedVar.name}` : `__var_${mapping.variableId}`;
                      currentAns = { ...currentAns, [varKey]: String(value) };
                    }
                  }
                }
              } catch (err) {
                console.error('Webhook (with mappings) error:', err);
              }
            } else {
              enqueueTask(() => fireWebhookWithResponse(webhookOpts).then(() => {}), `webhook:${intgNode.webhookUrl}`);
            }
          }
        }
        currentNodeId = target;
        continue;
      }

      // Intermediate: analytics node — fire server-side with retry (AdBlock-proof)
      if (target.startsWith('an-')) {
        if (!effectiveSkip) {
          const anId = target.replace('an-', '');
          const anNode = f?.analyticsNodes?.find(n => n.id === anId);
          const shouldFire = anNode ? (anNode.fireOnce !== false ? !firedNodesRef.current.has(target) : true) : false;
          if (anNode && f && shouldFire) {
            firedNodesRef.current.add(target);
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

            for (const entry of platformEntries) {
              const eventId = `${f.id}_${anId}_${entry.id}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
              const eventName = entry.eventType === 'custom'
                ? (('customEventName' in entry ? entry.customEventName : undefined) || 'CustomEvent')
                : (entry.eventType || 'Lead');
              const extraParams = Object.fromEntries(
                (entry.customParams || []).filter(p => p.key).map(p => [p.key, p.value])
              );
              const userData = resolveUserData(
                'userDataMapping' in entry ? (entry as any).userDataMapping : undefined,
                currentAns,
                f,
              );

              firePixelDual({
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
                onFired: (rec) => pixelEventsRef.current.push(rec),
              });
            }
          }
        }
        currentNodeId = target;
        continue;
      }
      // Intermediate: WhatsApp node — fire-and-forget via background queue
      if (target.startsWith('wa-')) {
        if (!effectiveSkip) {
          const waId = target.replace('wa-', '');
          const waNode = f?.whatsappNodes?.find(n => n.id === waId);
          const shouldFire = waNode ? (waNode.fireOnce !== false ? !firedNodesRef.current.has(target) : true) : false;
          if (waNode && f && waNode.instanceId && waNode.recipientNumber && shouldFire) {
            firedNodesRef.current.add(target);
            const resolvedNumber = interpolateText(waNode.recipientNumber || '', f.variables || [], currentAns);
            const resolvedMessage = interpolateText(waNode.messageText || '', f.variables || [], currentAns);
            const resolvedMediaUrl = waNode.mediaUrl ? interpolateText(waNode.mediaUrl, f.variables || [], currentAns) : undefined;

            const body: Record<string, any> = {
              instanceId: waNode.instanceId,
              recipientNumber: resolvedNumber,
              messageText: resolvedMessage,
            };
            if (waNode.sendMedia && resolvedMediaUrl) {
              body.mediaUrl = resolvedMediaUrl;
              body.mediaType = waNode.mediaType || 'image';
              if (waNode.mediaFileName) body.mediaFileName = waNode.mediaFileName;
            }

            enqueueTask(
              () => supabase.functions.invoke('whatsapp-send', { body }).then(() => {}),
              `whatsapp:${resolvedNumber}`,
            );
          }
        }
        currentNodeId = target;
        continue;
      }

      // Intermediate: Email node — fire-and-forget via background queue
      if (target.startsWith('em-')) {
        if (!effectiveSkip) {
          const emId = target.replace('em-', '');
          const emNode = f?.emailNodes?.find(n => n.id === emId);
          const shouldFire = emNode ? (emNode.fireOnce !== false ? !firedNodesRef.current.has(target) : true) : false;
          if (emNode && f && emNode.instanceId && emNode.toEmail && shouldFire) {
            firedNodesRef.current.add(target);
            const resolvedTo = interpolateText(emNode.toEmail || '', f.variables || [], currentAns);
            const resolvedFrom = emNode.fromEmail ? interpolateText(emNode.fromEmail, f.variables || [], currentAns) : undefined;
            const resolvedFromName = emNode.fromName ? interpolateText(emNode.fromName, f.variables || [], currentAns) : undefined;
            const resolvedSubject = interpolateText(emNode.subject || '', f.variables || [], currentAns);
            const resolvedBody = interpolateText(emNode.bodyText || '', f.variables || [], currentAns);
            const resolvedHtml = emNode.bodyHtml ? interpolateText(emNode.bodyHtml, f.variables || [], currentAns) : undefined;

            const body: Record<string, any> = {
              instanceId: emNode.instanceId,
              toEmail: resolvedTo,
              fromEmail: resolvedFrom,
              fromName: resolvedFromName,
              subject: resolvedSubject,
              bodyText: resolvedBody,
              bodyHtml: resolvedHtml,
              useHtml: emNode.useHtml,
            };

            enqueueTask(
              () => supabase.functions.invoke('resend-send', { body }).then(() => {}).catch(() => {}),
              `email:${resolvedTo}`,
            );
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

      // Intermediate: Wait node — return wait info instead of blocking
      if (target.startsWith('wt-')) {
        const wtId = target.replace('wt-', '');
        const wtNode = f?.waitNodes?.find(n => n.id === wtId);
        if (wtNode) {
          const multiplier = wtNode.unit === 'hours' ? 3600000 : wtNode.unit === 'minutes' ? 60000 : 1000;
          const durationMs = (wtNode.duration || 1) * multiplier;
          // Walk the rest of the workflow from the wait node to find the destination
          const restResult = await walkWorkflow(target, currentAns, effectiveSkip);
          return {
            ...restResult,
            pendingWait: { durationMs, feedback: wtNode.feedback, remainingNodeId: target },
          };
        }
        currentNodeId = target;
        continue;
      }

      // Intermediate: AI node — call ai-process edge function
      if (target.startsWith('ai-')) {
        const aiId = target.replace('ai-', '');
        const aiNode = f?.aiNodes?.find(n => n.id === aiId);
        
        console.info('[walkWorkflow] Processing AI node:', target, '| effectiveSkip:', effectiveSkip, '| hasNode:', !!aiNode);
        
        if (!effectiveSkip) {
          const shouldFire = aiNode ? (aiNode.fireOnce !== false ? !firedNodesRef.current.has(target) : true) : false;
          if (aiNode && f && shouldFire) {
            firedNodesRef.current.add(target);
            console.info('[walkWorkflow] Executing AI node:', target, '| inputs:', aiNode.inputSources?.length || 0, '| prompt:', aiNode.prompt?.slice(0, 50) + '...');

            // Gather input data from selected sources
            const inputData: Record<string, any> = {};
            for (const sourceId of aiNode.inputSources || []) {
              const val = currentAns[sourceId];
              if (val !== undefined && val !== null) {
                // Try to find a human label for the field
                const element = f.pages?.flatMap(p => p.elements || []).find(el => el.id === sourceId);
                const label = element?.label || element?.placeholder || sourceId;
                inputData[label] = val;
              }
            }

            const resolvedPrompt = interpolateText(aiNode.prompt || '', f.variables || [], currentAns);

            const body = {
              objective: aiNode.objective || 'custom',
              prompt: resolvedPrompt,
              systemPrompt: aiNode.systemPrompt || '',
              inputData,
              model: aiNode.model,
              maxTokens: aiNode.maxTokens || 500,
              temperature: aiNode.temperature ?? 0.7,
            };

            const isSync = (aiNode.executionMode || 'sync') === 'sync';

            const doInvoke = async () => {
              try {
                console.info('[walkWorkflow] AI invoke starting...', body);
                const { data, error } = await supabase.functions.invoke('ai-process', { body });
                console.info('[walkWorkflow] AI response:', { success: data?.success, hasResult: !!data?.result, error });
                
                if (!error && data?.success && data.result && aiNode.outputVariableId) {
                  const outVar = f?.variables?.find(v => v.id === aiNode.outputVariableId);
                  if (outVar) {
                    console.info('[walkWorkflow] AI result saved to variable:', outVar.name, '=', data.result);
                    currentAns = { ...currentAns, [`__var_${outVar.name}`]: data.result };
                  }
                }
              } catch (err) {
                console.error('AI node error:', err);
              }
            };

            if (isSync) {
              await doInvoke();
            } else {
              enqueueTask(doInvoke, `ai:${aiId}`);
            }
          } else {
            console.info('[walkWorkflow] AI node skipped:', target, '| shouldFire:', shouldFire, '| alreadyFired:', firedNodesRef.current.has(target));
          }
        } else {
          console.info('[walkWorkflow] AI node skipped (editor preview mode):', target);
        }
        currentNodeId = target;
        continue;
      }

      // Intermediate: ImageGen node — fire-and-forget image composition
      if (target.startsWith('ig-')) {
        if (!effectiveSkip) {
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

      // Intermediate: Jump node — redirect to target page
      if (target.startsWith('jp-')) {
        const jpId = target.replace('jp-', '');
        const jpNode = f?.jumpNodes?.find(n => n.id === jpId);
        if (jpNode?.targetPageId) {
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
  }, []);

  // Helper: navigate forward to a page index, pushing current to history
  const navigateToPage = useCallback((targetIndex: number, newAnswers: Record<string, any>) => {
    if (currentPageIndex !== null) {
      pageHistoryRef.current.push(currentPageIndex);
    }
    setAnswers(applyPageVariableAssignments(pages[targetIndex], newAnswers));
    setCurrentPageIndex(targetIndex);
  }, [currentPageIndex, pages, applyPageVariableAssignments]);


  const goNext = useCallback(async () => {
    if (navigatingRef.current) return;
    if (isPageBlocked) return;
    if (!areRequiredFieldsFilled()) return;
    navigatingRef.current = true;

    try {
      // Run async validators for current page
      if (currentPage) {
        const validators = currentPage.elements
          .map(el => validatorsRef.current[el.id])
          .filter(Boolean);
        if (validators.length > 0) {
          const results = await Promise.all(validators.map(v => v()));
          if (results.some(r => !r)) return;
        }
      }

      setDirection(1);

      const fromNodeId = currentPageIndex === null ? 'start' : `p-${pages[currentPageIndex].id}`;
      const allEdges = formRef.current?.flowEdges || [];
      const currentNodeHasOutEdges = allEdges.some(e => e.source === fromNodeId);

      // Use answersRef.current to always get the latest state — avoids stale closure
      const latestAnswers = answersRef.current;
      const { nextNodeId, updatedAnswers, pendingWait } = await walkWorkflow(fromNodeId, latestAnswers, isEditorPreview);

      // If there's a wait node in the path, show feedback and delay navigation
      if (pendingWait) {
        const fb = pendingWait.feedback || { mode: 'button_countdown' as WaitFeedbackMode };
        const mode = fb.mode || 'button_countdown';
        const originalDurationMs = pendingWait.durationMs;
        const skipAction = fb.skipAction || 'continue';
        const waitNodeId = pendingWait.remainingNodeId || 'wait';

        // ── Session-aware wait: resume from where we left off ──
        const waitStorageKey = `__wait_${id}_${waitNodeId}`;
        let startTime: number;
        let effectiveDuration: number;

        const stored = sessionStorage.getItem(waitStorageKey);
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            startTime = parsed.startedAt;
            effectiveDuration = parsed.effectiveDurationMs ?? originalDurationMs;
            const elapsed = Date.now() - startTime;
            if (elapsed >= effectiveDuration) {
              // Already completed in this session — skip wait entirely
              sessionStorage.removeItem(waitStorageKey);
              // fall through to navigation below (no wait needed)
              goto_after_wait: {
                if (nextNodeId === 'end') {
                  setAnswers(updatedAnswers); answersRef.current = updatedAnswers; setFinished(true); return;
                }
                if (nextNodeId && nextNodeId.startsWith('p-')) {
                  const pageId = nextNodeId.replace('p-', '');
                  const targetIndex = pages.findIndex(p => p.id === pageId);
                  if (targetIndex !== -1) { navigateToPage(targetIndex, updatedAnswers); return; }
                }
                // No flow target — finish
                setFinished(true);
                return;
              }
            }
          } catch { startTime = Date.now(); effectiveDuration = originalDurationMs; }
        } else {
          startTime = Date.now();
          effectiveDuration = originalDurationMs;
        }

        // Persist start info to sessionStorage
        sessionStorage.setItem(waitStorageKey, JSON.stringify({ startedAt: startTime, effectiveDurationMs: effectiveDuration }));

        const elapsedSoFar = Date.now() - startTime;
        const remainingMs = Math.max(0, effectiveDuration - elapsedSoFar);

        // Set up the feedback state
        const allowSkip = fb.allowSkip || false;
        setWaitFeedback({
          active: true,
          mode,
          durationMs: effectiveDuration,
          remainingMs,
          buttonText: fb.buttonText,
          loadingStyle: fb.loadingStyle,
          loadingLabel: fb.loadingLabel,
          allowSkip,
        });

        // Show toast notification if configured
        if (fb.showToast) {
          sonnerToast(fb.toastTitle || 'Processando...', {
            description: fb.toastDescription || undefined,
            duration: remainingMs,
          });
        }

        // Countdown interval for button_countdown mode
        const countdownInterval = mode === 'button_countdown'
          ? setInterval(() => {
              const elapsed = Date.now() - startTime;
              const remaining = Math.max(0, effectiveDuration - elapsed);
              setWaitFeedback(prev => prev ? { ...prev, remainingMs: remaining } : null);
            }, 100)
          : null;

        // Wait for remaining duration — but allow cancellation/reduction via ref
        const waitCancelRef = { cancelled: false, reduced: false };
        (window as any).__waitCancelRef = waitCancelRef;
        (window as any).__waitSkipAction = skipAction;
        (window as any).__waitSkipFeedback = fb;

        const wasSkipped = await new Promise<boolean>(resolve => {
          const timer = setTimeout(() => resolve(false), remainingMs);
          const checkCancel = setInterval(() => {
            if (waitCancelRef.cancelled) {
              clearTimeout(timer);
              clearInterval(checkCancel);
              resolve(true);
            }
            if (waitCancelRef.reduced) {
              waitCancelRef.reduced = false;
              const reduceUnit = fb.skipReduceUnit || 'seconds';
              const reduceAmount = fb.skipReduceAmount || 5;
              const reduceMs = reduceAmount * (reduceUnit === 'hours' ? 3600000 : reduceUnit === 'minutes' ? 60000 : 1000);
              effectiveDuration = Math.max(0, effectiveDuration - reduceMs);
              // Update sessionStorage with new effective duration
              sessionStorage.setItem(waitStorageKey, JSON.stringify({ startedAt: startTime, effectiveDurationMs: effectiveDuration }));
              const elapsed = Date.now() - startTime;
              const remaining = Math.max(0, effectiveDuration - elapsed);
              setWaitFeedback(prev => prev ? { ...prev, remainingMs: remaining, durationMs: effectiveDuration } : null);
              if (remaining <= 0) {
                clearTimeout(timer);
                clearInterval(checkCancel);
                resolve(false);
              }
            }
          }, 50);
          setTimeout(() => clearInterval(checkCancel), remainingMs + 100);
        });

        if (countdownInterval) clearInterval(countdownInterval);
        setWaitFeedback(null);
        sessionStorage.removeItem(waitStorageKey);
        delete (window as any).__waitCancelRef;
        delete (window as any).__waitSkipAction;
        delete (window as any).__waitSkipFeedback;

        // Handle skip actions
        if (wasSkipped && skipAction === 'go_to_page' && fb.skipTargetPageId) {
          const targetIndex = pages.findIndex(p => p.id === fb.skipTargetPageId);
          if (targetIndex !== -1) {
            navigateToPage(targetIndex, updatedAnswers);
            return;
          }
        }
        // For 'continue' and 'reduce_time' (when timer hits 0), fall through to normal navigation

        // Navigate to the resolved destination
        if (nextNodeId === 'end') {
          setAnswers(updatedAnswers);
          answersRef.current = updatedAnswers;
          setFinished(true);
          return;
        }
        if (nextNodeId && nextNodeId.startsWith('p-')) {
          const pageId = nextNodeId.replace('p-', '');
          const targetIndex = pages.findIndex(p => p.id === pageId);
          if (targetIndex !== -1) {
            navigateToPage(targetIndex, updatedAnswers);
            return;
          }
        }
        // Fallback: finish
        setFinished(true);
        return;
      }

      if (nextNodeId === 'end') {
        // Apply any variable ops that ran along the path to 'end'
        setAnswers(updatedAnswers);
        answersRef.current = updatedAnswers;
        setFinished(true);
        return;
      }

      if (nextNodeId && nextNodeId.startsWith('p-')) {
        const pageId = nextNodeId.replace('p-', '');
        const targetIndex = pages.findIndex(p => p.id === pageId);
        if (targetIndex !== -1) {
          // Skip empty pages in workflow-resolved navigation
          if (isPageEmpty(pages[targetIndex])) {
            // Recursively navigate from this empty page
            const { nextNodeId: n2, updatedAnswers: a2 } = await walkWorkflow(`p-${pageId}`, updatedAnswers, isEditorPreview);
            if (n2 === 'end') { setAnswers(a2); answersRef.current = a2; setFinished(true); return; }
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
            setFinished(true);
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
              setFinished(true);
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

        setFinished(true);
        return;
      }

      // Legacy fallback: sequential navigation ONLY when NO flow edges are defined at all
      // (forms without any canvas connections)
      if (currentPageIndex === null) {
        const idx = findNextNonEmpty(0);
        if (idx !== -1) {
          navigateToPage(idx, updatedAnswers);
        } else {
          setFinished(true);
        }
      } else if (currentPageIndex < pages.length - 1) {
        const idx = findNextNonEmpty(currentPageIndex + 1);
        if (idx !== -1) {
          navigateToPage(idx, updatedAnswers);
        } else {
          setFinished(true);
        }
      } else {
        setFinished(true);
      }
    } finally {
      navigatingRef.current = false;
    }
  }, [currentPageIndex, pages, isPageBlocked, currentPage, areRequiredFieldsFilled, navigateToPage, walkWorkflow, isPageEmpty, isEditorPreview]);

  // ── Apply SEO meta tags — deferred to avoid blocking first paint ──
  useEffect(() => {
    if (isEditorPreview || !form) return;
    const seo = form.seo;
    if (!seo && !form.title) return;

    // SEO tags don't affect visual rendering — defer
    const schedule = typeof requestIdleCallback === 'function' ? requestIdleCallback : (fn: () => void) => setTimeout(fn, 50);
    schedule(() => {
      if (seo?.title) document.title = seo.title;
      else if (form.title) document.title = form.title;

      const setMeta = (name: string, content: string, attr = 'name') => {
        if (!content) return;
        let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
        if (!el) { el = document.createElement('meta'); el.setAttribute(attr, name); document.head.appendChild(el); }
        el.content = content;
      };

      if (seo) {
        if (seo.description) { setMeta('description', seo.description); setMeta('og:description', seo.description, 'property'); }
        if (seo.keywords) setMeta('keywords', seo.keywords);
        if (seo.ogImage) { setMeta('og:image', seo.ogImage, 'property'); setMeta('twitter:image', seo.ogImage); }
        if (seo.ogType) setMeta('og:type', seo.ogType, 'property');
        setMeta('og:title', seo.title || form.title || '', 'property');
        if (seo.twitterCard) setMeta('twitter:card', seo.twitterCard);
        if (seo.robots) setMeta('robots', seo.robots);
        if (seo.themeColor) setMeta('theme-color', seo.themeColor);

        if (seo.canonicalUrl) {
          let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
          if (!link) { link = document.createElement('link'); link.rel = 'canonical'; document.head.appendChild(link); }
          link.href = seo.canonicalUrl;
        }

        if (seo.favicon) {
          let link = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
          if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
          link.href = seo.favicon;
        }

        if (seo.structuredData) {
          try {
            JSON.parse(seo.structuredData);
            let script = document.getElementById('seo-jsonld') as HTMLScriptElement | null;
            if (!script) { script = document.createElement('script'); script.id = 'seo-jsonld'; script.type = 'application/ld+json'; document.head.appendChild(script); }
            script.textContent = seo.structuredData;
          } catch { /* invalid JSON, skip */ }
        }
      }
    });
  }, [form?.seo, form?.title, isEditorPreview]);

  const goBack = useCallback(() => {
    setDirection(-1);
    setFieldErrors({});
    if (finished) {
      setFinished(false);
      return;
    }
    // Use navigation history to go back to the actual previous page in the flow
    const history = pageHistoryRef.current;
    if (history.length > 0) {
      const prevIndex = history.pop()!;
      setCurrentPageIndex(prevIndex);
      return;
    }
    // No history — go to welcome if available
    if (currentPageIndex !== null && form?.showWelcomeScreen) {
      setCurrentPageIndex(null);
    }
  }, [currentPageIndex, finished, form?.showWelcomeScreen]);

  const setAnswer = useCallback((elementId: string, value: any) => {
    // Clear field error when user provides a value
    setFieldErrors(prev => {
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
      // Keep ref in sync immediately to avoid stale saves on fast submit/navigation
      answersRef.current = next;
      return next;
    });
  }, []);

  const handleButtonNavigate = useCallback(async (action: 'next' | 'previous' | 'specific' | 'finish', targetPageId?: string) => {
    if (action === 'next') {
      goNext();
    } else if (action === 'previous') {
      goBack();
    } else if (action === 'finish') {
      // Run the workflow from current page before finishing — ensures WhatsApp, webhooks, analytics execute
      setDirection(1);
      const fromNodeId = currentPageIndex === null ? 'start' : `p-${pages[currentPageIndex].id}`;
      const latestAnswers = answersRef.current;
      const { updatedAnswers } = await walkWorkflow(fromNodeId, latestAnswers, isEditorPreview);
      setAnswers(updatedAnswers);
      answersRef.current = updatedAnswers;
      setFinished(true);
    } else if (action === 'specific' && targetPageId) {
      const targetIndex = pages.findIndex(p => p.id === targetPageId);
      if (targetIndex !== -1) {
        setDirection(targetIndex > (currentPageIndex ?? -1) ? 1 : -1);
        // Run workflow from current page to execute intermediate nodes
        const fromNodeId = currentPageIndex === null ? 'start' : `p-${pages[currentPageIndex].id}`;
        const latestAnswers = answersRef.current;
        const { updatedAnswers } = await walkWorkflow(fromNodeId, latestAnswers, isEditorPreview);
        navigateToPage(targetIndex, updatedAnswers);
        answersRef.current = updatedAnswers;
      }
    }
  }, [goNext, goBack, pages, currentPageIndex, walkWorkflow, navigateToPage, isEditorPreview]);

  // Keyboard navigation: Enter = next (always), ArrowDown = next (except last page), ArrowUp = back
  const isLastPage = isFlowLastPage;
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isTextarea = tag === 'TEXTAREA';

      if (e.key === 'Enter' && !isTextarea) {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowDown' && tag !== 'SELECT' && !isLastPage) {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowUp' && tag !== 'SELECT') {
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
    const bgColor = pageStyle.backgroundColor || undefined;
    const fontFamily = normalizeFontFamily(pageStyle.fontFamily || form.style?.fontFamily);
    const formStyle = form.style;
    const s: React.CSSProperties = { fontFamily };

    if (formStyle?.backgroundType === 'gradient' && formStyle.backgroundGradient) {
      s.background = formStyle.backgroundGradient;
    } else if (formStyle?.backgroundType === 'image' && formStyle.backgroundImage) {
      s.backgroundImage = `url(${formStyle.backgroundImage})`;
      s.backgroundSize = formStyle.backgroundSize || 'cover';
      s.backgroundPosition = 'center';
      s.backgroundRepeat = 'no-repeat';
    } else {
      const rawBg = bgColor || formStyle?.backgroundColor || '#FAFAF6';
      s.backgroundColor = rawBg.startsWith('#') ? rawBg : `hsl(${rawBg})`;
    }

    if (formStyle?.textColor) {
      s.color = formStyle.textColor;
    }

    // Override --primary inside form preview to match the form's configured primary color
    if (formStyle?.primaryColor) {
      (s as any)['--primary'] = formStyle.primaryColor;
    }

    return s;
  }, [form?.globalPageStyle, form?.style]);

  const isBootstrapping = !isInitialStateReady;

  if (isBootstrapping) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin" />
      </div>
    );
  }

  const variants = {
    enter: (d: number) => ({
      opacity: 0,
      y: d >= 0 ? 60 : -60,
    }),
    center: { opacity: 1, y: 0 },
    exit: (d: number) => ({
      opacity: 0,
      y: d >= 0 ? -60 : 60,
    }),
  };

  const hasVariables = (form.variables?.length ?? 0) > 0;

  return (
    <LazyMotion features={domAnimation} strict>
    <main role="main">
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="min-h-screen flex flex-col relative"
      style={outerContainerStyle}
    >

      {/* Close — only visible when opened from the editor (not inside iframe) */}
      {isEditorPreview && window.self === window.top && (
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

        return (
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-auto flex flex-col relative"
          >
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={currentPageIndex ?? (finished ? 'end' : 'welcome')}
                custom={direction}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="w-full mx-auto my-auto"
                style={contentContainerStyle}
              >
              <Suspense fallback={
                <div className="w-full min-h-[160px] rounded-xl bg-muted/30 animate-pulse" />
              }>
                {/* Default welcome (no custom elements) */}
                {showDefaultWelcome && (
                  <div className="text-center space-y-4 md:space-y-5">
                    <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-foreground">
                      {form.welcomeTitle || form.title}
                    </h1>
                    <p className="text-base md:text-lg text-muted-foreground">
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
                    <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-foreground">
                      {form.thankYouTitle || 'Obrigado!'}
                    </h1>
                    <p className="text-base md:text-lg text-muted-foreground">
                      {form.thankYouDescription || 'Suas respostas foram enviadas com sucesso.'}
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
            </AnimatePresence>
          </div>
        );
      })()}

      {/* Navigation bar — centered at bottom */}
      {!isWelcome && !isThankYou && (() => {
        const hasActionButtons = currentPage?.elements?.some(el => el.type === 'button');
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
                  onClick={goBack}
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
                onClick={waitFeedback ? undefined : goNext}
                disabled={isPageBlocked || !!waitFeedback}
                className="h-9 gap-1.5 text-xs"
                style={{
                  backgroundColor: form.style?.buttonBgColor || form.style?.primaryColor || undefined,
                  color: form.style?.buttonTextColor || undefined,
                  borderRadius: form.style?.buttonBorderRadius ?? 9999,
                  padding: form.style?.buttonSize === 'sm' ? '6px 16px' : form.style?.buttonSize === 'lg' ? '14px 32px' : '10px 24px',
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
                        ref.reduced = true;
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
              <Suspense fallback={<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}>
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
                        ref.reduced = true;
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


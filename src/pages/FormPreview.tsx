import { useParams, useNavigate } from 'react-router-dom';
import { useFormStoreSafe } from '@/hooks/useFormStore';
import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Check, X, Star, CheckSquare, Loader2, AlertCircle, CheckCircle2, Info, AlertTriangle, XCircle, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { FunnelPage, FormData as AppFormData } from '@/types/form';
import { PageElement } from '@/types/pageElements';
import { supabase } from '@/integrations/supabase/client';
import Twemoji from '@/components/Twemoji';
import { interpolateText } from '@/lib/variableInterpolation';
import { FormVariable } from '@/types/form';
import { resolveConditionBranch } from '@/lib/conditionEvaluator';
import { buildWebhookPayload, PixelEventRecord } from '@/lib/webhookPayload';
import { firePixel, firePixelDual, fireWebhookWithResponse } from '@/lib/firePixel';
import { captureSessionContext, requestGeolocation, contextToAnswers } from '@/lib/sessionContext';
import { consumePrefetchedForm } from '@/lib/formPrefetch';
import { validateEmailFormat } from '@/lib/emailValidation';

// Lazy-loaded heavy preview components — only loaded when the form actually uses them
const PhoneFieldPreview = lazy(() => import('@/components/preview/PhoneFieldPreview'));
const EmailDomainSuggestions = lazy(() => import('@/components/preview/EmailDomainSuggestions'));
const HeightWeightField = lazy(() => import('@/components/preview/HeightWeightField'));
const ChartLivePreview = lazy(() => import('@/components/editor/chart-designer/ChartLivePreview'));
const ComparativeChartPreview = lazy(() => import('@/components/preview/charts/ComparativeChartPreview'));
const CircularProgressPreview = lazy(() => import('@/components/preview/CircularProgressPreview'));
const IOSNotification = lazy(() => import('@/components/preview/IOSNotification'));
const DateFieldPreview = lazy(() => import('@/components/preview/DateFieldPreview'));
const TimerPreview = lazy(() => import('@/components/preview/TimerPreview'));
const ListPreview = lazy(() => import('@/components/preview/ListPreview'));
const LoadingPreview = lazy(() => import('@/components/preview/LoadingPreview'));
const DocumentFieldPreview = lazy(() => import('@/components/preview/DocumentFieldPreview'));
const CompanyFieldPreview = lazy(() => import('@/components/preview/CompanyFieldPreview'));
const AddressFieldPreview = lazy(() => import('@/components/preview/AddressFieldPreview'));
const ProgressBarColumn = lazy(() => import('@/components/preview/ProgressBarColumn'));
const BeforeAfterSlider = lazy(() => import('@/components/preview/BeforeAfterSlider'));
const DebugPanel = lazy(() => import('@/components/preview/DebugPanel'));
// Section previews are lightweight — import directly
import { ArgumentsPreview, TestimonialsPreview, FAQPreview, PricingPreview, CarouselPreview } from '@/components/editor/page-builder/SectionPreviews';

// Wrapper to avoid Suspense boundary per element — shows nothing while loading (instant swap)
function LazyWrap({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div className="animate-pulse h-10 rounded bg-muted/30" />}>{children}</Suspense>;
}

function buildDefaults(form: AppFormData | null) {
  if (!form) return {};
  const defaults: Record<string, any> = {};
  for (const page of form.pages || []) {
    for (const el of page.elements || []) {
      if (el.defaultValue !== undefined && el.defaultValue !== '') {
        defaults[el.id] = el.defaultValue;
      }
    }
  }
  // Initialize variables with their default values
  for (const v of form.variables || []) {
    if (v.defaultValue !== undefined && v.defaultValue !== '') {
      defaults[`__var_${v.name}`] = v.defaultValue;
    }
  }
  return defaults;
}

export default function FormPreview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const store = useFormStoreSafe();

  // Try to get form from store first (when editor is open), otherwise fetch publicly
  const storeForm = store?.getForm(id!) ?? null;
  const [publicForm, setPublicForm] = useState<AppFormData | null>(null);
  const [publicLoading, setPublicLoading] = useState(!storeForm);
  const [showPublicSkeleton, setShowPublicSkeleton] = useState(true);

  useEffect(() => {
    if (storeForm || !id) return;
    setPublicLoading(true);

    const parseFormData = (data: any) => {
      const d = data.data as Record<string, unknown>;
      const form: AppFormData = {
        ...(d as unknown as AppFormData),
        id: data.id,
        title: data.title,
        status: data.status as AppFormData['status'],
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
      setPublicForm(form);
      setPublicLoading(false);
    };

    // Try to consume prefetched data first (started in main.tsx before React mounted)
    consumePrefetchedForm(id).then((result) => {
      if (result?.data && !result.error) {
        parseFormData(result.data);
      } else {
        // Fallback: fetch normally if prefetch missed
        supabase
          .from('forms')
          .select('id, title, status, data, created_at, updated_at')
          .eq('id', id)
          .single()
          .then(({ data, error }) => {
            if (error || !data) { setPublicLoading(false); return; }
            parseFormData(data);
          });
      }
    });
  }, [id, storeForm]);

  const form = storeForm || publicForm;
  const isEditorPreview = !!storeForm; // true when opened from within the editor

  useEffect(() => {
    if (!publicLoading) setShowPublicSkeleton(false);
  }, [publicLoading]);

  const [currentPageIndex, setCurrentPageIndex] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [direction, setDirection] = useState(1);
  const [finished, setFinished] = useState(false);
  const [blockedElements, setBlockedElements] = useState<Record<string, boolean>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const validatorsRef = useRef<Record<string, () => Promise<boolean>>>({});
  const answersRef = useRef(answers);
  useEffect(() => { answersRef.current = answers; }, [answers]);

  // Track all pixel events fired during this session
  const pixelEventsRef = useRef<PixelEventRecord[]>([]);

  // Capture session metadata once on mount
  const sessionMetaRef = useRef({
    responseId: crypto.randomUUID(),
    landedAt: new Date().toISOString(),
    queryParams: typeof window !== 'undefined'
      ? Object.fromEntries(new URLSearchParams(window.location.search).entries())
      : {} as Record<string, string>,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    referrer: typeof document !== 'undefined' ? document.referrer : '',
  });
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
  useEffect(() => {
    if (!form) return;
    const ctx = captureSessionContext();
    const ctxAnswers = contextToAnswers(ctx);
    const defaults = { ...buildDefaults(form), ...ctxAnswers };

    // Try to resume from saved session
    if (form.allowResume && form.id) {
      const storageKey = `form_resume_${form.id}`;
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.answers && typeof parsed.pageIndex === 'number') {
            setAnswers({ ...defaults, ...parsed.answers });
            setCurrentPageIndex(parsed.pageIndex);
            maxPageVisitedRef.current = parsed.maxPage ?? parsed.pageIndex;
            return;
          }
        }
      } catch { /* ignore corrupt data */ }
    }

    setAnswers(defaults);
    setCurrentPageIndex(form.showWelcomeScreen ? null : 0);

    // Request geolocation asynchronously (GPS → reverse geocode, or IP fallback)
    if (form.enableGeolocation !== false) {
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
  }, [answers, currentPageIndex, form?.id, finished]); // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [form?.id, finished]); // eslint-disable-line react-hooks/exhaustive-deps

  // Insert session record on form load
  useEffect(() => {
    if (!form?.id || isEditorPreview) return;
    const { responseId, userAgent, queryParams, referrer } = sessionMetaRef.current;
    const generatedSessionId = crypto.randomUUID();
    sessionDbIdRef.current = generatedSessionId;

    // Use edge function for session insert (bypasses RLS for public users)
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
  }, [form?.id]); // eslint-disable-line react-hooks/exhaustive-deps


  // Fire pixel load events once the form is ready
  // ── Load Events: disparo server-side com retry, nunca falha por AdBlock ──────
  useEffect(() => {
    if (!form?.id || isEditorPreview) return;
    const loadEvents = form.pixelLoadEvents || [];
    if (loadEvents.length === 0) return;

    const sourceUrl = typeof window !== 'undefined' ? window.location.href : '';
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const { responseId } = sessionMetaRef.current;

    for (const evt of loadEvents) {
      const eventName = evt.eventType === 'custom'
        ? (evt.customEventName || 'CustomEvent')
        : evt.eventType;
      const eventId = `${form.id}_load_${evt.id}_${Date.now()}`;

      firePixelDual({
        platform: evt.platform,
        eventName,
        eventId,
        formId: form.id,
        responseId,
        triggerType: 'load_event',
        answers: {},
        variables: {},
        userData: {},
        sourceUrl,
        userAgent,
        onFired: (rec) => pixelEventsRef.current.push(rec),
      });
    }
  }, [form?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
        ;(supabase as any).from('form_sessions').update({
          current_page_index: currentPageIndex,
          pages_visited: newMax + 1,
          last_seen_at: now,
        }).eq('id', sessionId).then(() => {});
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
  }, [currentPageIndex, finished, form?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Always-fresh ref to form — avoids stale closures in callbacks
  const formRef = useRef(form);
  useEffect(() => { formRef.current = form; }, [form]);

  // Scroll to top on page change
  useEffect(() => {
    scrollContainerRef.current?.scrollTo({ top: 0 });
  }, [currentPageIndex, finished]);


  const pages = form?.pages || [];
  const currentPage = currentPageIndex !== null ? pages[currentPageIndex] : null;


  // Auto-complete when user reaches a true terminal page (no inputs/buttons and no outgoing flow)
  useEffect(() => {
    if (!form || finished || currentPageIndex === null) return;

    const page = pages[currentPageIndex];
    if (!page) return;

    const hasInputFields = page.elements?.some(el => el.type.startsWith('input_'));
    const hasActionButtons = page.elements?.some(el => el.type === 'button');
    const hasOutgoingFlow = (form.flowEdges || []).some(edge => edge.source === `p-${page.id}`);
    const isLastPage = currentPageIndex === pages.length - 1;

    if (!hasInputFields && !hasActionButtons && !hasOutgoingFlow && isLastPage) {
      setFinished(true);
    }
  }, [form, finished, currentPageIndex, pages]);

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

  const isWelcome = currentPageIndex === null && !finished;
  const isThankYou = finished;
  const nonEmptyPages = useMemo(() => pages.filter(p => p.elements && p.elements.length > 0), [pages]);
  const totalSteps = nonEmptyPages.length;
  const currentStepIndex = currentPageIndex !== null ? nonEmptyPages.findIndex(p => p.id === pages[currentPageIndex]?.id) : -1;
  const progress = isWelcome ? 0 : isThankYou ? 100 : totalSteps > 0 ? ((currentStepIndex + 1) / totalSteps) * 100 : 0;

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
  ): Promise<{ nextNodeId: string | null; updatedAnswers: Record<string, any> }> => {
    const f = formRef.current;
    const edges = f?.flowEdges || [];

    if (!edges.length) return { nextNodeId: null, updatedAnswers: currentAnswers };

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

    for (let i = 0; i < 200; i++) {
      if (visited.has(currentNodeId)) break;
      visited.add(currentNodeId);

      const outEdges = edges.filter(e => e.source === currentNodeId);
      if (outEdges.length === 0) break; // dead end

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

      const target = nextEdge.target;

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

      // Intermediate: webhook integration node — fire server-side with retry
      if (target.startsWith('int-')) {
        const intgId = target.replace('int-', '');
        const intgNode = f?.integrationNodes?.find(n => n.id === intgId);
        if (intgNode && f) {
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
            landedAt: sessionMetaRef.current.landedAt,
            submittedAt: new Date().toISOString(),
            extraParams,
            queryParams: sessionMetaRef.current.queryParams,
            pixelEvents: pixelEventsRef.current,
          });

          // Fire webhook and capture response (for variable mapping)
          const responseBody = await fireWebhookWithResponse({
            platform: 'webhook',
            eventName: 'webhook_fired',
            eventId,
            formId: f.id,
            responseId: sessionMetaRef.current.responseId,
            triggerType: 'flow_node',
            sourceUrl,
            webhookUrl: intgNode.webhookUrl,
            webhookMethod: intgNode.webhookMethod,
            webhookPayload: wPayload,
            userData,
            queryParams: sessionMetaRef.current.queryParams,
            userAgent: sessionMetaRef.current.userAgent,
          });

          // Apply response mappings to variables
          if (responseBody && intgNode.responseMappings?.length) {
            const getNestedValue = (obj: any, path: string): any => {
              // Tokenize path supporting both dot notation and array indexing
              // e.g. "items[0].id" → ["items", "0", "id"]
              // e.g. "results[1].name" → ["results", "1", "name"]
              const tokens = path
                .replace(/\[(\d+)\]/g, '.$1') // convert [0] → .0
                .split('.')
                .filter(Boolean);
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
        }
        currentNodeId = target;
        continue;
      }

      // Intermediate: analytics node — fire server-side with retry (AdBlock-proof)
      if (target.startsWith('an-')) {
        const anId = target.replace('an-', '');
        const anNode = f?.analyticsNodes?.find(n => n.id === anId);
        if (anNode && f) {
          const emailVal = Object.entries(currentAns).find(([k]) => {
            for (const pg of f.pages || []) {
              if ((pg.elements || []).find(e => e.id === k && e.type === 'input_email')) return true;
            }
            return false;
          });
          const phoneVal = Object.entries(currentAns).find(([k]) => {
            for (const pg of f.pages || []) {
              if ((pg.elements || []).find(e => e.id === k && e.type === 'input_phone')) return true;
            }
            return false;
          });
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
              userData: {
                email: emailVal ? String(emailVal[1]) : undefined,
                phone: phoneVal ? String((phoneVal[1] as any)?.full_number ?? phoneVal[1]) : undefined,
              },
              sourceUrl,
              userAgent: sessionMetaRef.current.userAgent,
              onFired: (rec) => pixelEventsRef.current.push(rec),
            });
          }
        }
        currentNodeId = target;
        continue;
      }
      if (target.startsWith('c-')) {
        currentNodeId = target;
        continue;
      }

      // Any other node (start, unknown) — just advance
      currentNodeId = target;
    }

    return { nextNodeId: null, updatedAnswers: currentAns };
  }, []);



  const goNext = useCallback(async () => {
    if (isPageBlocked) return;
    if (!areRequiredFieldsFilled()) return;

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
    const { nextNodeId, updatedAnswers } = await walkWorkflow(fromNodeId, latestAnswers);

    if (nextNodeId === 'end') {
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
          const { nextNodeId: n2, updatedAnswers: a2 } = await walkWorkflow(`p-${pageId}`, updatedAnswers);
          if (n2 === 'end') { setFinished(true); return; }
          if (n2 && n2.startsWith('p-')) {
            const idx2 = pages.findIndex(p => p.id === n2.replace('p-', ''));
            if (idx2 !== -1) {
              setAnswers(applyPageVariableAssignments(pages[idx2], a2));
              setCurrentPageIndex(idx2);
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
          if (nextNonEmpty !== -1) {
            setAnswers(applyPageVariableAssignments(pages[nextNonEmpty], updatedAnswers));
            setCurrentPageIndex(nextNonEmpty);
            return;
          }
          setFinished(true);
          return;
        }
        const nextPage = pages[targetIndex];
        setAnswers(applyPageVariableAssignments(nextPage, updatedAnswers));
        setCurrentPageIndex(targetIndex);
        return;
      }
    }

    if (currentNodeHasOutEdges) {
      setFinished(true);
      return;
    }

    // Fallback: sequential navigation — skip empty pages
    const findNextNonEmpty = (startIdx: number): number => {
      for (let i = startIdx; i < pages.length; i++) {
        if (!isPageEmpty(pages[i])) return i;
      }
      return -1; // all remaining pages are empty
    };

    if (currentPageIndex === null) {
      const idx = findNextNonEmpty(0);
      if (idx !== -1) {
        setAnswers(applyPageVariableAssignments(pages[idx], updatedAnswers));
        setCurrentPageIndex(idx);
      } else {
        setFinished(true);
      }
    } else if (currentPageIndex < pages.length - 1) {
      const idx = findNextNonEmpty(currentPageIndex + 1);
      if (idx !== -1) {
        setAnswers(applyPageVariableAssignments(pages[idx], updatedAnswers));
        setCurrentPageIndex(idx);
      } else {
        setFinished(true);
      }
    } else {
      setFinished(true);
    }
  }, [currentPageIndex, pages, isPageBlocked, currentPage, areRequiredFieldsFilled, applyPageVariableAssignments, walkWorkflow, isPageEmpty]);


  const goBack = useCallback(() => {
    setDirection(-1);
    setFieldErrors({});
    if (finished) {
      setFinished(false);
      return;
    }
    if (currentPageIndex !== null && currentPageIndex > 0) {
      // Skip empty pages going backwards
      for (let i = currentPageIndex - 1; i >= 0; i--) {
        if (!isPageEmpty(pages[i])) {
          setCurrentPageIndex(i);
          return;
        }
      }
      // All previous pages are empty — go to welcome if available
      if (form?.showWelcomeScreen) {
        setCurrentPageIndex(null);
      }
    } else if (currentPageIndex === 0 && form?.showWelcomeScreen) {
      setCurrentPageIndex(null);
    }
  }, [currentPageIndex, finished, pages, isPageEmpty, form?.showWelcomeScreen]);

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

  const handleButtonNavigate = useCallback((action: 'next' | 'previous' | 'specific' | 'finish', targetPageId?: string) => {
    if (action === 'next') {
      goNext();
    } else if (action === 'previous') {
      goBack();
    } else if (action === 'finish') {
      setDirection(1);
      setFinished(true);
    } else if (action === 'specific' && targetPageId) {
      const targetIndex = pages.findIndex(p => p.id === targetPageId);
      if (targetIndex !== -1) {
        setDirection(targetIndex > (currentPageIndex ?? -1) ? 1 : -1);
        setCurrentPageIndex(targetIndex);
      }
    }
  }, [goNext, goBack, pages, currentPageIndex]);

  // Keyboard navigation: Enter/ArrowDown = next, ArrowUp = back
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isTextarea = tag === 'TEXTAREA';

      if (e.key === 'Enter' && !isTextarea) {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowDown' && tag !== 'SELECT') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowUp' && tag !== 'SELECT') {
        e.preventDefault();
        goBack();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goNext, goBack]);

  if (publicLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        {showPublicSkeleton && (
          <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin" />
        )}
      </div>
    );
  }

  if (!form) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <p className="text-muted-foreground text-sm">Formulário não encontrado.</p>
    </div>
  );

  const variants = {
    enter: (d: number) => ({ y: d > 0 ? 40 : -40, opacity: 0 }),
    center: { y: 0, opacity: 1 },
    exit: (d: number) => ({ y: d > 0 ? -40 : 40, opacity: 0 }),
  };

  const hasVariables = (form.variables?.length ?? 0) > 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="min-h-screen bg-background flex flex-col relative"
    >

      {/* Close — only visible when opened from the editor */}
      {isEditorPreview && (
        <div className="absolute top-4 right-4 z-20">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/editor/${id}`)}>
            <X className="h-5 w-5" />
          </Button>
        </div>
      )}

      {/* Progress */}
      {!isWelcome && !isThankYou && form?.showProgressBar !== false && (
        <div className="px-4 md:px-8 pt-6">
          <Progress value={progress} className="h-1" />
        </div>
      )}

      {/* Content */}
      {(() => {
        const pageStyle = form.globalPageStyle || {};
        const paddingX = pageStyle.paddingX ?? 24;
        const mobilePaddingX = Math.min(paddingX, 16);
        const paddingY = pageStyle.paddingY ?? 32;
        const gap = pageStyle.gap ?? 32;
        const bgColor = pageStyle.backgroundColor || undefined;
        const fontFamily = pageStyle.fontFamily || undefined;

        // Default screens (no custom elements): centered layout with own padding
        const showDefaultWelcome = isWelcome && (!form.showWelcomeScreen || !form.welcomePage?.elements?.length);
        const showDefaultThankYou = isThankYou && !form.thankYouPage?.elements?.length;
        const isDefaultScreen = showDefaultWelcome || showDefaultThankYou;

        return (
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-auto flex flex-col"
            style={{ backgroundColor: bgColor, fontFamily }}
          >
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={currentPageIndex ?? (finished ? 'end' : 'welcome')}
                custom={direction}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className="w-full mx-auto my-auto"
                style={isDefaultScreen ? { maxWidth: 672, padding: '32px 16px' } : {
                  maxWidth: 672 + paddingX * 2,
                  paddingLeft: `clamp(${mobilePaddingX}px, 4vw, ${paddingX}px)`,
                  paddingRight: `clamp(${mobilePaddingX}px, 4vw, ${paddingX}px)`,
                  paddingTop: paddingY,
                  paddingBottom: paddingY,
                }}
              >
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
                        />
                      );
                    })}
                  </div>
                )}

                {/* Page content (normal pages) */}
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
                                />
                              );
                            })}
                          </div>
                        );
                      })()
                    )}
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        );
      })()}

      {/* Navigation arrows — hide when page has its own action buttons */}
      {!isWelcome && !isThankYou && (() => {
        const hasActionButtons = currentPage?.elements?.some(el => el.type === 'button');
        if (hasActionButtons) return null;
        const canGoBack = currentPageIndex !== null && (currentPageIndex > 0 || !!form?.showWelcomeScreen);
        return (
          <div className="fixed bottom-4 right-4 md:bottom-6 md:right-6 flex flex-col gap-1 z-50">
            {canGoBack && (
              <Button
                variant="outline"
                size="icon"
                onClick={goBack}
                className="h-11 w-11 md:h-9 md:w-9 rounded-md shadow-md"
                aria-label="Voltar"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="default"
              size="icon"
              onClick={goNext}
              disabled={isPageBlocked}
              className="h-11 w-11 md:h-9 md:w-9 rounded-md shadow-md"
              aria-label="Avançar"
            >
              {isPageBlocked ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                currentPageIndex !== null && currentPageIndex === pages.length - 1
                  ? <Send className="h-4 w-4" />
                  : <ArrowDown className="h-4 w-4" />
              )}
            </Button>
          </div>
        );
      })()}
    </motion.div>
  );
}

/** Renders an interactive page element for the preview */
function InteractiveElement({
  element,
  value,
  onChange,
  stepNumber,
  letterOffset = 0,
  onBlockedChange,
  registerValidator,
  onNavigate,
  variables = [],
  answers = {},
  fieldError,
}: {
  element: PageElement;
  value: any;
  onChange: (v: any) => void;
  stepNumber: number;
  letterOffset?: number;
  onBlockedChange: (blocked: boolean) => void;
  registerValidator: (validator: (() => Promise<boolean>) | null) => void;
  onNavigate?: (action: 'next' | 'previous' | 'specific' | 'finish', targetPageId?: string) => void;
  variables?: FormVariable[];
  answers?: Record<string, any>;
  fieldError?: string;
}) {
  const { type, style } = element;
  const t = (text: string | undefined) => text ? interpolateText(text, variables, answers) : text;
  const alignClass = style?.textAlign === 'center' ? 'text-center' : style?.textAlign === 'right' ? 'text-right' : 'text-left';

  // Universal style wrappers matching ElementPreview
  const containerStyle: React.CSSProperties = {};
  if (style?.margin !== undefined) containerStyle.margin = style.margin;
  if (style?.marginTop !== undefined) containerStyle.marginTop = style.marginTop;
  if (style?.marginRight !== undefined) containerStyle.marginRight = style.marginRight;
  if (style?.marginBottom !== undefined) containerStyle.marginBottom = style.marginBottom;
  if (style?.marginLeft !== undefined) containerStyle.marginLeft = style.marginLeft;

  const boxStyle: React.CSSProperties = {};
  if (style?.backgroundColor) boxStyle.backgroundColor = style.backgroundColor;
  if (style?.borderRadius !== undefined) boxStyle.borderRadius = style.borderRadius;
  if (style?.borderWidth) {
    boxStyle.borderWidth = style.borderWidth;
    boxStyle.borderStyle = style.borderStyle || 'solid';
    boxStyle.borderColor = style.borderColor || 'currentColor';
  }
  if (style?.padding !== undefined) boxStyle.padding = style.padding;
  if (style?.paddingTop !== undefined) boxStyle.paddingTop = style.paddingTop;
  if (style?.paddingRight !== undefined) boxStyle.paddingRight = style.paddingRight;
  if (style?.paddingBottom !== undefined) boxStyle.paddingBottom = style.paddingBottom;
  if (style?.paddingLeft !== undefined) boxStyle.paddingLeft = style.paddingLeft;
  if (style?.width) boxStyle.width = style.width;
  if (style?.boxShadow) boxStyle.boxShadow = style.boxShadow;

  const hasWrapperStyle = Object.keys(containerStyle).length > 0 || Object.keys(boxStyle).length > 0;

  // Keyboard shortcut: press letter key to select option
  const SELECTION_TYPES = ['input_select', 'input_radio', 'input_multi_select', 'input_quiz_icon', 'input_quiz_image'];
  useEffect(() => {
    if (!SELECTION_TYPES.includes(type)) return;
    const opts = element.options || [];
    if (opts.length === 0) return;

    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const key = e.key.toUpperCase();
      const code = key.charCodeAt(0) - 65; // A=0, B=1, ...
      const localIndex = code - letterOffset;
      if (localIndex < 0 || localIndex >= opts.length) return;

      e.preventDefault();
      const opt = opts[localIndex];
      if (type === 'input_multi_select') {
        const selected: string[] = Array.isArray(value) ? value : [];
        if (selected.includes(opt.id)) {
          onChange(selected.filter(id => id !== opt.id));
        } else {
          onChange([...selected, opt.id]);
        }
      } else {
        onChange(opt.id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [type, element.options, letterOffset, value, onChange]);

  // Email validation state
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailChecking, setEmailChecking] = useState(false);
  const [emailValid, setEmailValid] = useState<boolean | null>(null);
  // Ref to always read latest value inside validator (avoids stale closure / race condition)
  const valueRef = useRef(value);
  useEffect(() => { valueRef.current = value; }, [value]);
  // Basic format validation runs on every email field
  const emailFormatResult = element.type === 'input_email' && value
    ? validateEmailFormat(value as string)
    : null;

  // Report blocked state to parent (only while checking)
  useEffect(() => {
    if (element.type === 'input_email') {
      onBlockedChange(emailChecking);
    } else {
      onBlockedChange(false);
    }
  }, [emailChecking, element.type, onBlockedChange]);

  // Register validator for email fields (format + optional smart validation)
  useEffect(() => {
    if (element.type === 'input_email') {
      registerValidator(async () => {
        const val = (valueRef.current || '') as string;
        setEmailError(null);
        setEmailValid(null);

        if (!val) {
          if (element.required) {
            setEmailError(element.requiredMessage || 'E-mail obrigatório');
            return false;
          }
          return true;
        }

        // Format + TLD validation (always runs)
        const formatCheck = validateEmailFormat(val);
        if (!formatCheck.valid) {
          setEmailError(formatCheck.error || 'E-mail inválido');
          return false;
        }

        // Smart validation via API (only if enabled)
        if (element.smartValidation) {
          setEmailChecking(true);
          try {
            const res = await supabase.functions.invoke('verify-email', { body: { email: val } });
            const data = res.data as any;
            if (data?.is_safe_to_send === false) {
              setEmailError(data?.is_disposable ? 'E-mail descartável' : 'Este e-mail não é válido para receber mensagens');
              setEmailValid(false);
              return false;
            } else if (data?.is_safe_to_send === true) {
              setEmailValid(true);
              setEmailError(null);
              return true;
            }
            return true;
          } catch {
            return true;
          } finally {
            setEmailChecking(false);
          }
        }

        // Format passed, no smart validation
        setEmailValid(true);
        return true;
      });
    } else {
      registerValidator(null);
    }
    return () => registerValidator(null);
  }, [element.type, element.smartValidation, element.required, element.requiredMessage, registerValidator]);

  const handleEmailChange = useCallback((val: string) => {
    onChange(val);
    // Reset validation state when user types
    setEmailValid(null);
    setEmailError(null);
  }, [onChange]);

  // Validate email format on blur (inline feedback before clicking "next")
  const handleEmailBlur = useCallback(() => {
    const val = (value || '') as string;
    if (!val) { setEmailError(null); setEmailValid(null); return; }
    const result = validateEmailFormat(val);
    if (!result.valid) {
      setEmailError(result.error || 'E-mail inválido');
      setEmailValid(false);
    } else {
      setEmailError(null);
      // Don't set emailValid=true here — wait for full validation on "next"
    }
  }, [value]);

  /** Wraps form fields with the "N → enunciado" Typeform header + description */
  const withFieldHeader = (content: React.ReactNode) => (
    <div className={`space-y-3 md:space-y-6 ${fieldError ? 'animate-shake' : ''}`}>
      <div className="flex items-start gap-1.5 md:gap-3">
        <span className={`text-base md:text-xl lg:text-2xl font-semibold mt-0.5 ${fieldError ? 'text-destructive' : 'text-primary'}`}>{stepNumber}</span>
        <span className={`text-base md:text-xl lg:text-2xl font-semibold mt-0.5 ${fieldError ? 'text-destructive' : 'text-primary'}`}>→</span>
        <div>
          <h2 className="text-base md:text-xl lg:text-2xl font-semibold text-foreground leading-snug">
            {t(element.label) || 'Sem título'}
            {element.required && <span className="text-destructive ml-1">*</span>}
          </h2>
          {element.description && (
            <p className="text-sm md:text-base text-muted-foreground mt-1 md:mt-2">{t(element.description)}</p>
          )}
        </div>
      </div>
      <div className="pl-7 md:pl-12 lg:pl-14">
        {content}
        {fieldError && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-sm text-destructive mt-2 flex items-center gap-1.5"
          >
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            {fieldError}
          </motion.p>
        )}
      </div>
    </div>
  );

  const wrapWithStyle = (content: React.ReactNode) => {
    if (!hasWrapperStyle) return content;
    return <div style={{ ...containerStyle, ...boxStyle, overflow: 'visible' }}>{content}</div>;
  };

  switch (type) {
    case 'heading': {
      const sizeMap: Record<number, string> = { 1: 'text-4xl', 2: 'text-2xl', 3: 'text-xl', 4: 'text-lg' };
      return wrapWithStyle(
        <div className={alignClass}>
          <div className={`${sizeMap[element.level || 2]} font-bold text-foreground`} style={{ color: style?.color, fontFamily: style?.fontFamily, fontWeight: style?.fontWeight }}>
            {t(element.content) || 'Título'}
          </div>
        </div>
      );
    }

    case 'text':
      return wrapWithStyle(
        <div className={alignClass}>
          <p className="text-base text-foreground/80 whitespace-pre-wrap leading-relaxed" style={{ color: style?.color, fontFamily: style?.fontFamily, fontWeight: style?.fontWeight }}>
            {t(element.content) || ''}
          </p>
        </div>
      );

    case 'image': {
      const maxH = element.imageMaxHeight || 400;
      const objectFit = element.imageObjectFit || 'cover';
      const focalX = element.imageFocalX ?? 50;
      const focalY = element.imageFocalY ?? 50;
      return element.src ? wrapWithStyle(
        <div className={alignClass}>
          <img
            src={element.src}
            alt={element.alt || ''}
            className="max-w-full rounded-lg mx-auto"
            style={{
              maxHeight: maxH,
              width: '100%',
              objectFit: objectFit as any,
              objectPosition: objectFit === 'cover' ? `${focalX}% ${focalY}%` : undefined,
            }}
          />
        </div>
      ) : null;
    }

    case 'button': {
      const handleButtonClick = () => {
        if (element.href) {
          window.open(element.href, '_blank');
          return;
        }
        if (element.buttonAction && element.buttonAction !== 'none' && onNavigate) {
          onNavigate(element.buttonAction, element.buttonTargetPageId);
        }
      };
      return (
        <div className={alignClass}>
          <Button
            onClick={handleButtonClick}
            style={{
              backgroundColor: style?.backgroundColor,
              borderRadius: style?.borderRadius,
              width: style?.width || 'auto',
              padding: style?.padding !== undefined ? `${style.padding}px ${style.padding * 1.5}px` : undefined,
              color: style?.color,
              fontFamily: style?.fontFamily,
              fontWeight: style?.fontWeight,
            }}
          >
            {t(element.content) || 'Botão'}
          </Button>
        </div>
      );
    }

    case 'divider':
      return <hr className="border-border" style={{ borderWidth: element.height || 1 }} />;

    case 'video':
      return element.src ? (
        <div className="aspect-video rounded-lg overflow-hidden bg-muted">
          <iframe src={element.src} className="w-full h-full" allowFullScreen title="Video" />
        </div>
      ) : null;

    case 'spacer':
      return <div style={{ height: element.height || 40 }} />;

    case 'alert': {
      const v = element.alertVariant || 'info';
      const alertConfig = {
        info:    { icon: Info,           bg: 'bg-blue-50',    border: 'border-blue-200',    iconColor: 'text-blue-500',    textColor: 'text-blue-800' },
        success: { icon: CheckCircle2,   bg: 'bg-emerald-50', border: 'border-emerald-200',  iconColor: 'text-emerald-500', textColor: 'text-emerald-800' },
        warning: { icon: AlertTriangle,  bg: 'bg-amber-50',   border: 'border-amber-200',   iconColor: 'text-amber-500',   textColor: 'text-amber-800' },
        error:   { icon: XCircle,        bg: 'bg-red-50',     border: 'border-red-200',     iconColor: 'text-red-500',     textColor: 'text-red-800' },
      }[v];
      const AlertIconComp = alertConfig.icon;
      return wrapWithStyle(
        <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${alertConfig.bg} ${alertConfig.border}`}>
          <AlertIconComp className={`h-5 w-5 mt-0.5 flex-shrink-0 ${alertConfig.iconColor}`} />
          <p className={`text-sm md:text-base leading-relaxed ${alertConfig.textColor}`}>
            {t(element.content) || 'Mensagem de atenção'}
          </p>
        </div>
      );
    }

    case 'notification':
      return (
        <IOSNotification
          items={element.notificationItems || []}
          mode={element.notificationMode || 'sequential'}
          duration={element.notificationDuration || 3}
          interval={element.notificationInterval || 2}
          position={element.notificationPosition || 'top'}
        />
      );

    case 'arguments':
      return wrapWithStyle(<ArgumentsPreview element={element} />);
    case 'testimonials':
      return wrapWithStyle(<TestimonialsPreview element={element} />);
    case 'faq':
      return wrapWithStyle(<FAQPreview element={element} />);
    case 'pricing':
      return wrapWithStyle(<PricingPreview element={element} />);
    case 'before_after':
      return wrapWithStyle(
        <BeforeAfterSlider
          beforeImage={element.beforeImage || ''}
          afterImage={element.afterImage || ''}
          mode={element.beforeAfterMode || 'slider'}
        />
      );
    case 'carousel':
      return wrapWithStyle(<CarouselPreview element={element} />);

    case 'columns': {
      const colCount = element.columnCount || 2;
      const cols = element.columnData || [];
      return (
        <div className="grid gap-4 mobile-stack-cols" style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)` }}>
          <style>{`@media (max-width: 640px) { .mobile-stack-cols { grid-template-columns: 1fr !important; } }`}</style>
          {cols.slice(0, colCount).map(col => (
            <div key={col.id} className="space-y-4">
              {col.elements.map((childEl) => (
                <InteractiveElement
                  key={childEl.id}
                  element={childEl}
                  value={undefined}
                  onChange={() => {}}
                  stepNumber={0}
                  onBlockedChange={() => {}}
                  registerValidator={() => {}}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          ))}
        </div>
      );
    }

    // ─── Interactive form fields (with "N → label" header) ──────────────────
    case 'input_email':
      return withFieldHeader(
        <div className="space-y-2">
          <div className="relative">
            <input
              type="text"
              inputMode="email"
              value={t(value) || ''}
              onChange={e => handleEmailChange(e.target.value)}
              placeholder={t(element.placeholder) || 'seu@email.com'}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              onBlur={handleEmailBlur}
              data-1p-ignore
              data-lpignore="true"
              data-bwignore
              data-form-type="other"
              className={`w-full bg-transparent border-0 border-b-2 outline-none text-base md:text-lg lg:text-xl py-2 text-foreground placeholder:text-muted-foreground/40 transition-colors ${
                emailError ? 'border-destructive' : emailValid ? 'border-green-500' : 'border-border focus:border-primary'
              }`}
              autoFocus
            />
            <AnimatePresence mode="wait">
              <div className="absolute right-0 top-1/2 -translate-y-1/2">
                {emailChecking && (
                  <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </motion.div>
                )}
                {!emailChecking && emailValid && (
                  <motion.div initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 300 }}>
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  </motion.div>
                )}
                {!emailChecking && emailError && (
                  <motion.div initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 300 }}>
                    <AlertCircle className="h-5 w-5 text-destructive" />
                  </motion.div>
                )}
              </div>
            </AnimatePresence>
          </div>
          <EmailDomainSuggestions value={value || ''} onSelect={handleEmailChange} />
          <div className="h-6 flex items-center">
            <AnimatePresence mode="wait">
              {emailError && (
                <motion.p
                  key="error"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="text-sm text-destructive"
                >
                  {emailError}
                </motion.p>
              )}
              {emailValid && element.smartValidation && (
                <motion.p
                  key="valid"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="text-sm text-green-600"
                >
                  E-mail verificado ✓
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>
      );

    case 'input_text':
      return withFieldHeader(
        <input
          type="text"
          value={t(value) || ''}
          onChange={e => onChange(e.target.value)}
          placeholder={t(element.placeholder) || 'Digite aqui...'}
          className="w-full bg-transparent border-0 border-b-2 border-border focus:border-primary outline-none text-base md:text-lg lg:text-xl py-2 text-foreground placeholder:text-muted-foreground/40 transition-colors"
          autoFocus
        />
      );

    case 'input_address':
      return withFieldHeader(
        <AddressFieldPreview
          value={value as any}
          onChange={onChange}
          geoSuggestion={{
            city: answers['__ctx_geoCity'] || '',
            state: answers['__ctx_geoState'] || '',
            country: answers['__ctx_geoCountry'] || '',
            countryCode: answers['__ctx_geoCountryCode'] || '',
            neighborhood: answers['__ctx_geoNeighborhood'] || '',
            street: answers['__ctx_geoStreet'] || '',
            cep: answers['__ctx_geoCep'] || '',
            source: answers['__ctx_geoSource'] || '',
          }}
        />
      );

    case 'input_document':
      return withFieldHeader(
        <DocumentFieldPreview
          value={value as any}
          onChange={onChange}
          allowedTypes={element.documentAllowedTypes as any}
        />
      );

    case 'input_company':
      return withFieldHeader(
        <CompanyFieldPreview
          value={value as any}
          onChange={onChange}
          visibleFields={element.companyVisibleFields}
          editableFields={element.companyEditableFields}
        />
      );

    case 'input_number':
      return withFieldHeader(
        <input
          type="number"
          value={t(value) || ''}
          onChange={e => onChange(e.target.value)}
          placeholder={t(element.placeholder) || '0'}
          min={element.min}
          max={element.max}
          className="w-full bg-transparent border-0 border-b-2 border-border focus:border-primary outline-none text-base md:text-lg lg:text-xl py-2 text-foreground placeholder:text-muted-foreground/40 transition-colors [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          autoFocus
        />
      );

    case 'input_textarea':
      return withFieldHeader(
        <textarea
          value={t(value) || ''}
          onChange={e => onChange(e.target.value)}
          placeholder={t(element.placeholder) || 'Digite sua mensagem...'}
          rows={3}
          className="w-full bg-transparent border-0 border-b-2 border-border focus:border-primary outline-none text-base md:text-lg lg:text-xl py-2 text-foreground placeholder:text-muted-foreground/40 transition-colors resize-none"
          autoFocus
        />
      );

    case 'input_date':
      return withFieldHeader(
        <DateFieldPreview
          value={value}
          onChange={onChange}
          dateMode={element.dateMode}
          dateFormat={element.dateFormat}
          placeholder={t(element.placeholder)}
        />
      );

    case 'input_height':
    case 'input_weight':
      return withFieldHeader(
        <HeightWeightField
          type={type === 'input_height' ? 'height' : 'weight'}
          value={value as any}
          onChange={onChange}
          defaultUnit={element.unit}
          allowUnitToggle={element.allowUnitToggle !== false}
          min={element.min}
          max={element.max}
          defaultValue={element.defaultValue}
        />
      );

    case 'input_phone':
      return withFieldHeader(
        <PhoneFieldPreview value={value} onChange={onChange} defaultCountryCode={element.defaultCountryCode} />
      );

    case 'input_checkbox':
      return withFieldHeader(
        <motion.button
          onClick={() => onChange(!value)}
          className="flex items-center gap-3 md:gap-4 text-left group"
          whileTap={{ scale: 0.97 }}
        >
          <motion.div
            className={`h-6 w-6 md:h-7 md:w-7 rounded-lg border-2 flex items-center justify-center transition-colors flex-shrink-0 ${
              value ? 'border-primary bg-primary' : 'border-border group-hover:border-primary/40'
            }`}
            animate={value ? { scale: [1, 1.2, 1] } : {}}
            transition={{ duration: 0.25 }}
          >
            {value && <Check className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary-foreground" />}
          </motion.div>
          <span className="text-base md:text-lg text-foreground">Aceitar</span>
        </motion.button>
      );

    case 'input_select':
      return withFieldHeader(
        <div className="space-y-2 md:space-y-3">
          {(element.options || []).map((opt, i) => (
            <motion.button
              key={opt.id}
              onClick={() => onChange(opt.id)}
              whileTap={{ scale: 0.98 }}
              animate={value === opt.id ? { scale: [1, 1.02, 1] } : {}}
              transition={{ duration: 0.2 }}
              className={`w-full text-left px-3 py-3 md:px-5 md:py-4 rounded-xl border-2 transition-all flex items-center gap-3 md:gap-4 ${
                value === opt.id
                  ? 'border-primary bg-primary/5 text-foreground shadow-sm'
                  : 'border-border hover:border-primary/40 text-foreground'
              }`}
            >
              <motion.span
                className={`h-6 w-6 md:h-7 md:w-7 rounded-lg border-2 text-xs font-bold flex items-center justify-center flex-shrink-0 transition-all ${
                  value === opt.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground'
                }`}
                animate={value === opt.id ? { scale: [1, 1.25, 1] } : {}}
                transition={{ duration: 0.25 }}
              >
                {String.fromCharCode(65 + letterOffset + i)}
              </motion.span>
              <span className="text-base md:text-lg">{t(opt.label)}</span>
            </motion.button>
          ))}
        </div>
      );

    case 'input_radio':
      return withFieldHeader(
        <div className="space-y-2 md:space-y-3">
          {(element.options || []).map((opt, i) => (
            <motion.button
              key={opt.id}
              onClick={() => onChange(opt.id)}
              whileTap={{ scale: 0.98 }}
              animate={value === opt.id ? { scale: [1, 1.02, 1] } : {}}
              transition={{ duration: 0.2 }}
              className={`w-full text-left px-3 py-3 md:px-5 md:py-4 rounded-xl border-2 transition-all flex items-center gap-3 md:gap-4 ${
                value === opt.id
                  ? 'border-primary bg-primary/5 text-foreground shadow-sm'
                  : 'border-border hover:border-primary/40 text-foreground'
              }`}
            >
              <motion.span
                className={`h-6 w-6 md:h-7 md:w-7 rounded-lg border-2 text-xs font-bold flex items-center justify-center flex-shrink-0 transition-all ${
                  value === opt.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground'
                }`}
                animate={value === opt.id ? { scale: [1, 1.25, 1] } : {}}
                transition={{ duration: 0.25 }}
              >
                {String.fromCharCode(65 + letterOffset + i)}
              </motion.span>
              <span className="text-base md:text-lg">{t(opt.label)}</span>
            </motion.button>
          ))}
        </div>
      );

    case 'input_rating': {
      const max = element.maxRating || 5;
      const current = value || 0;
      const style = element.ratingStyle || 'star';
      const activeColor = element.ratingActiveColor || '#facc15';
      const inactiveColor = element.ratingInactiveColor || '#d1d5db';

      if (style === 'numeric') {
        return withFieldHeader(
          <div className="flex gap-1.5 flex-wrap">
            {Array.from({ length: max }).map((_, i) => (
              <motion.button
                key={i}
                onClick={() => onChange(i + 1)}
                whileTap={{ scale: 0.9 }}
                whileHover={{ scale: 1.08 }}
                className="w-10 h-10 rounded-lg border-2 flex items-center justify-center text-sm font-bold transition-colors"
                style={{
                  borderColor: i < current ? activeColor : inactiveColor,
                  backgroundColor: i < current ? activeColor : 'transparent',
                  color: i < current ? '#fff' : inactiveColor,
                }}
              >
                {i + 1}
              </motion.button>
            ))}
          </div>
        );
      }

      const iconMap: Record<string, string> = { star: '⭐', heart: '❤️', thumbsUp: '👍', emoji: element.ratingEmoji || '⭐' };
      const emoji = iconMap[style] || '⭐';

      return withFieldHeader(
        <div className="flex gap-2">
          {Array.from({ length: max }).map((_, i) => (
            <motion.button
              key={i}
              onClick={() => onChange(i + 1)}
              whileTap={{ scale: 0.85 }}
              whileHover={{ scale: 1.15 }}
              animate={i < current ? { scale: [1, 1.3, 1] } : {}}
              transition={{ duration: 0.2, delay: i * 0.03 }}
              className="text-2xl md:text-3xl"
              style={{ opacity: i < current ? 1 : 0.3, filter: i < current ? 'none' : 'grayscale(1)' }}
            >
              {emoji}
            </motion.button>
          ))}
        </div>
      );
    }

    case 'input_nps': {
      const max = element.maxRating || 10;
      const current = value ?? -1;
      const scoreColors = element.npsScoreColors || [];
      const scoreLabels = element.npsScoreLabels || [];
      const dragHint = element.npsDragHint || 'Arraste para escolher sua nota';

      const defaultColor = (i: number) => { const r = i / max; return r <= 0.6 ? '#ef4444' : r <= 0.8 ? '#f59e0b' : '#22c55e'; };
      const defaultLabel = (i: number) => { const r = i / max; return r <= 0.6 ? '😟 Detrator' : r <= 0.8 ? '😐 Neutro' : '😍 Promotor'; };
      const getNpsColor = (i: number) => scoreColors[i] || defaultColor(i);
      const getNpsLabel = (i: number) => scoreLabels[i] || defaultLabel(i);
      const npsSliderColor = current >= 0 ? getNpsColor(current) : 'hsl(var(--border))';

      // Build gradient stops from per-score colors
      const gradientStops = Array.from({ length: max + 1 }, (_, i) => {
        const pct = (i / max) * 100;
        const nextPct = ((i + 1) / max) * 100;
        const c = getNpsColor(i);
        return `${c} ${pct}%, ${c} ${Math.min(nextPct, 100)}%`;
      }).join(', ');

      return withFieldHeader(
        <div className="space-y-2">
          {/* Desktop: blocos */}
          <div className="hidden sm:flex gap-1">
            {Array.from({ length: max + 1 }).map((_, i) => {
              const isSelected = current === i;
              const color = getNpsColor(i);
              return (
                <motion.button
                  key={i}
                  onClick={() => onChange(i)}
                  whileTap={{ scale: 0.9 }}
                  whileHover={{ scale: 1.08 }}
                  className="flex-1 h-11 rounded-lg border-2 flex items-center justify-center text-sm font-bold transition-all"
                  style={{
                    borderColor: isSelected ? color : 'hsl(var(--border))',
                    backgroundColor: isSelected ? color : 'transparent',
                    color: isSelected ? '#fff' : 'hsl(var(--muted-foreground))',
                  }}
                >
                  {i}
                </motion.button>
              );
            })}
          </div>
          {/* Mobile: slider com visual aprimorado */}
          <div className="flex sm:hidden flex-col gap-1">
            {/* Valor grande com label e animação */}
            <div className="flex flex-col items-center gap-1 py-3">
              <motion.div
                key={current}
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="relative"
              >
                <span
                  className="text-5xl font-extrabold tabular-nums transition-colors"
                  style={{ color: current >= 0 ? npsSliderColor : 'hsl(var(--muted-foreground))' }}
                >
                  {current >= 0 ? current : '–'}
                </span>
              </motion.div>
              {current >= 0 && (
                <motion.span
                  key={`label-${current}`}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-xs font-medium"
                  style={{ color: npsSliderColor }}
                >
                  {getNpsLabel(current)}
                </motion.span>
              )}
            </div>

            {/* Trilho colorido com marcadores */}
            <div className="relative px-1">
              {/* Gradient track background */}
              <div className="absolute inset-x-1 top-1/2 -translate-y-1/2 h-3 rounded-full overflow-hidden"
                style={{ background: `linear-gradient(to right, ${gradientStops})`, opacity: 0.2 }}
              />
              <input
                type="range"
                min={0}
                max={max}
                value={current >= 0 ? current : Math.round(max / 2)}
                onChange={e => onChange(Number(e.target.value))}
                className="nps-mobile-slider relative w-full h-8 appearance-none cursor-pointer bg-transparent z-10"
                style={{
                  WebkitAppearance: 'none',
                  color: npsSliderColor,
                }}
              />
              {/* Custom track overlay */}
              <div
                className="absolute inset-x-1 top-1/2 -translate-y-1/2 h-3 rounded-full pointer-events-none"
                style={{
                  background: current >= 0
                    ? `linear-gradient(to right, ${npsSliderColor} ${(current / max) * 100}%, transparent ${(current / max) * 100}%)`
                    : 'transparent',
                }}
              />
            </div>

            {/* Escala numérica */}
            <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums px-1">
              {Array.from({ length: max + 1 }).map((_, i) => (
                <span key={i} className={`${current === i ? 'font-bold' : 'opacity-50'}`}
                  style={current === i ? { color: npsSliderColor } : {}}
                >{i}</span>
              ))}
            </div>

            {/* Dica animada — some ao interagir */}
            {current < 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: [0, 1, 1, 0.7], y: [8, 0, 0, 0], x: [0, 0, 10, -10] }}
                transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 1 }}
                className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground mt-2"
              >
                <span>👆</span>
                <span>{dragHint}</span>
              </motion.div>
            )}
          </div>
          <div className="flex justify-between text-xs text-muted-foreground px-1">
            <span>{t(element.npsLowLabel) || 'Nada provável'}</span>
            <span>{t(element.npsHighLabel) || 'Muito provável'}</span>
          </div>
        </div>
      );
    }

    case 'input_yes_no':
      return withFieldHeader(
        <div className="flex gap-3">
          {[
            { key: 'yes', label: 'Sim', emoji: '👍' },
            { key: 'no', label: 'Não', emoji: '👎' },
          ].map(opt => (
            <motion.button
              key={opt.key}
              onClick={() => onChange(opt.key)}
              whileTap={{ scale: 0.95 }}
              animate={value === opt.key ? { scale: [1, 1.05, 1] } : {}}
              transition={{ duration: 0.2 }}
              className={`flex-1 px-5 py-4 rounded-xl border-2 transition-all flex items-center justify-center gap-2 text-lg font-medium ${
                value === opt.key
                  ? 'border-primary bg-primary/5 text-foreground shadow-sm'
                  : 'border-border hover:border-primary/40 text-foreground'
              }`}
            >
              <Twemoji className="text-xl">{opt.emoji}</Twemoji>
              <span>{opt.label}</span>
            </motion.button>
          ))}
        </div>
      );

    case 'input_multi_select': {
      const selected: string[] = Array.isArray(value) ? value : [];
      const toggleOption = (optId: string) => {
        if (selected.includes(optId)) {
          onChange(selected.filter(id => id !== optId));
        } else {
          onChange([...selected, optId]);
        }
      };
      return withFieldHeader(
        <div className="space-y-2 md:space-y-3">
          {(element.options || []).map((opt, i) => {
            const isSelected = selected.includes(opt.id);
            return (
              <motion.button
                key={opt.id}
                onClick={() => toggleOption(opt.id)}
                whileTap={{ scale: 0.98 }}
                animate={isSelected ? { scale: [1, 1.02, 1] } : {}}
                transition={{ duration: 0.2 }}
                className={`w-full text-left px-3 py-3 md:px-5 md:py-4 rounded-xl border-2 transition-all flex items-center gap-3 md:gap-4 ${
                  isSelected
                    ? 'border-primary bg-primary/5 text-foreground shadow-sm'
                    : 'border-border hover:border-primary/40 text-foreground'
                }`}
              >
                <motion.span
                  className={`h-6 w-6 md:h-7 md:w-7 rounded-md border-2 text-xs font-bold flex items-center justify-center flex-shrink-0 transition-all ${
                    isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground'
                  }`}
                  animate={isSelected ? { scale: [1, 1.25, 1] } : {}}
                  transition={{ duration: 0.25 }}
                >
                  {isSelected ? <Check className="h-3.5 w-3.5" /> : String.fromCharCode(65 + letterOffset + i)}
                </motion.span>
                <span className="text-base md:text-lg flex-1">{t(opt.label)}</span>
                <motion.div
                  className={`h-5 w-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                    isSelected ? 'border-primary bg-primary' : 'border-border'
                  }`}
                  animate={isSelected ? { scale: [1, 1.2, 1] } : {}}
                  transition={{ duration: 0.2 }}
                >
                  {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                </motion.div>
              </motion.button>
            );
          })}
        </div>
      );
    }

    case 'input_quiz_icon':
      return withFieldHeader(
        <div className="grid grid-cols-2 gap-3">
          {(element.options || []).map((opt) => {
            const selected = value === opt.id;
            return (
              <motion.button
                key={opt.id}
                onClick={() => onChange(opt.id)}
                whileTap={{ scale: 0.95 }}
                animate={selected ? { scale: [1, 1.05, 1] } : {}}
                transition={{ duration: 0.2 }}
                className={`relative px-4 py-5 rounded-xl border-2 transition-all flex flex-col items-center gap-2 text-center ${
                  selected
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-border hover:border-primary/40'
                }`}
              >
                {selected && (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <Check className="h-3 w-3 text-primary-foreground" />
                  </div>
                )}
                <Twemoji className="text-3xl">{opt.emoji || '⭐'}</Twemoji>
                <span className="text-sm font-medium">{t(opt.label)}</span>
              </motion.button>
            );
          })}
        </div>
      );

    case 'input_quiz_image':
      return withFieldHeader(
        <div className="grid grid-cols-2 gap-3">
          {(element.options || []).map((opt) => {
            const selected = value === opt.id;
            return (
              <motion.button
                key={opt.id}
                onClick={() => onChange(opt.id)}
                whileTap={{ scale: 0.95 }}
                animate={selected ? { scale: [1, 1.05, 1] } : {}}
                transition={{ duration: 0.2 }}
                className={`relative rounded-xl border-2 overflow-hidden transition-all ${
                  selected
                    ? 'border-primary shadow-sm'
                    : 'border-border hover:border-primary/40'
                }`}
              >
                {selected && (
                  <div className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full bg-primary flex items-center justify-center shadow-md">
                    <Check className="h-3.5 w-3.5 text-primary-foreground" />
                  </div>
                )}
                <div className="relative">
                  {opt.imageUrl ? (
                    <img src={opt.imageUrl} alt={opt.label} className={`w-full h-28 md:h-36 object-cover transition-opacity ${selected ? 'opacity-90' : ''}`} />
                  ) : (
                    <div className="w-full h-28 md:h-36 bg-muted flex items-center justify-center text-muted-foreground">
                      <span className="text-sm">Sem imagem</span>
                    </div>
                  )}
                  {selected && <div className="absolute inset-0 bg-primary/10" />}
                </div>
                <div className={`px-3 py-2 text-sm font-medium text-center ${selected ? 'bg-primary/5' : ''}`}>{t(opt.label)}</div>
              </motion.button>
            );
          })}
        </div>
      );

    case 'chart':
      return wrapWithStyle(
        <div className={alignClass}>
          <ChartLivePreview
            chartType={element.chartType || 'column'}
            items={element.chartItems || []}
            style={element.chartStyle || {}}
          />
        </div>
      );

    case 'comparative_chart':
      return wrapWithStyle(
        <div className={alignClass}>
          <ComparativeChartPreview
            datasets={element.comparativeDatasets || []}
            labels={element.comparativeLabels || []}
            mode={element.comparativeMode || 'cartesian'}
            style={element.chartStyle}
          />
        </div>
      );

    case 'circular_progress':
      return wrapWithStyle(
        <div className={alignClass}>
          <CircularProgressPreview
            value={element.circularProgressValue ?? 72}
            labelBefore={element.circularProgressLabelBefore}
            labelAfter={element.circularProgressLabelAfter}
            color={element.circularProgressColor}
            trackColor={element.circularProgressTrackColor}
            textColor={element.circularProgressTextColor}
            labelColor={element.circularProgressLabelColor}
            size={element.circularProgressSize}
            strokeWidth={element.circularProgressStroke}
          />
        </div>
      );

    case 'timer':
      return wrapWithStyle(
        <div className={alignClass}>
          <TimerPreview
            mode={element.timerMode || 'time'}
            durationMinutes={element.timerDurationMinutes}
            targetDate={element.timerTargetDate}
            label={element.timerLabel}
            finishedLabel={element.timerFinishedLabel}
            showDays={element.timerShowDays}
            showHours={element.timerShowHours}
            showMinutes={element.timerShowMinutes}
            showSeconds={element.timerShowSeconds}
            digitColor={element.timerDigitColor}
            labelColor={element.timerLabelColor}
            separatorColor={element.timerSeparatorColor}
            boxBackground={element.timerBoxBackground}
            boxBorderRadius={element.timerBoxBorderRadius}
          />
        </div>
      );

    case 'horizontal_bar': {
      const barVal = element.horizontalBarValue ?? 50;
      const barColor = element.horizontalBarColor || 'hsl(var(--primary))';
      const barBg = element.horizontalBarBackground || 'rgba(0,0,0,0.08)';
      const lblColor = element.horizontalBarLabelColor || 'hsl(var(--foreground))';
      const valColor = element.horizontalBarValueColor || '#818388';
      const trackH = element.horizontalBarHeight || 12;
      const dotSize = trackH + 10;
      const totalSegments = 5;
      const pct = Math.min(100, Math.max(0, barVal));
      const filledFull = Math.floor((pct / 100) * totalSegments);
      const partialFill = ((pct / 100) * totalSegments) - filledFull;
      return wrapWithStyle(
        <div className="space-y-1.5 w-full">
          <div className="flex justify-between items-baseline">
            <span className="text-sm font-semibold" style={{ color: lblColor }}>{element.horizontalBarLabel || 'Progresso'}</span>
            <span className="text-sm font-extrabold" style={{ color: valColor }}>{barVal}%</span>
          </div>
          <div className="relative w-full" style={{ height: dotSize }}>
            <div className="flex gap-1 w-full absolute left-0 right-0" style={{ top: (dotSize - trackH) / 2 }}>
              {Array.from({ length: totalSegments }).map((_, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-sm overflow-hidden"
                  style={{ height: trackH, backgroundColor: barBg }}
                >
                  {i < filledFull ? (
                    <div className="h-full w-full" style={{ backgroundColor: barColor }} />
                  ) : i === filledFull && partialFill > 0 ? (
                    <div className="h-full" style={{ width: `${partialFill * 100}%`, backgroundColor: barColor }} />
                  ) : null}
                </div>
              ))}
            </div>
            <div
              className="absolute rounded-full shadow-sm transition-all duration-500"
              style={{
                width: dotSize,
                height: dotSize,
                backgroundColor: '#ffffff',
                border: `3px solid ${barColor}`,
                left: `calc(${pct}% - ${dotSize / 2}px)`,
                top: 0,
                zIndex: 1,
              }}
            />
          </div>
        </div>
      );
    }

    case 'progress_bar': {
      const bars = element.progressBarItems || [];
      const cols = element.progressBarLayout || 1;
      const disposition = element.progressBarDisposition || 'chart_legend';
      return wrapWithStyle(
        <div className={`grid ${cols === 3 ? 'grid-cols-3' : cols === 2 ? 'grid-cols-2' : 'grid-cols-1'} gap-4 w-full`}>
          {bars.map(bar => (
            <ProgressBarColumn
              key={bar.id}
              bar={bar}
              disposition={disposition}
              colBorderWidth={element.progressBarColBorderWidth}
              colBorderStyle={element.progressBarColBorderStyle}
              colBorderColor={element.progressBarColBorderColor}
              colBorderRadius={element.progressBarColBorderRadius}
            />
          ))}
        </div>
      );
    }

    case 'loading':
      return wrapWithStyle(
        <div className={alignClass}>
          <LoadingPreview
            style={element.loadingStyle}
            duration={element.loadingDuration}
            targetPercent={element.loadingTargetPercent}
            label={element.loadingLabel}
            color={element.loadingColor}
            trackColor={element.loadingTrackColor}
            textColor={element.loadingTextColor}
            size={element.loadingSize}
            stroke={element.loadingStroke}
            interactive={true}
            onComplete={() => {
              const action = element.loadingAction || 'none';
              if (action !== 'none' && onNavigate) {
                onNavigate(action as any, element.loadingTargetPageId);
              }
            }}
          />
        </div>
      );

    case 'list':
      return wrapWithStyle(
        <ListPreview
          items={element.listItems || []}
          listStyle={element.listStyleType}
          iconColor={element.listIconColor}
          textColor={element.listTextColor}
          gap={element.listGap}
          fontSize={element.style?.fontSize}
        />
      );

    default:
      return null;
  }
}

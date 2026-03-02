import { useParams, useNavigate } from 'react-router-dom';
import { toast as sonnerToast } from 'sonner';
import { useFormStoreSafe } from '@/hooks/useFormStore';
import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Check, X, Star, CheckSquare, Loader2, AlertCircle, CheckCircle2, Info, AlertTriangle, XCircle, Send, CornerDownLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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
import { consumePrefetchedForm, hasPrefetchedForm } from '@/lib/formPrefetch';
import { validateEmailFormat } from '@/lib/emailValidation';
import { normalizeFontFamily } from '@/lib/fontUtils';

// Lazy-loaded heavy preview components — only loaded when the form actually uses them
const loadPhoneFieldPreview = () => import('@/components/preview/PhoneFieldPreview');
const PhoneFieldPreview = lazy(loadPhoneFieldPreview);
const loadEmailDomainSuggestions = () => import('@/components/preview/EmailDomainSuggestions');
const EmailDomainSuggestions = lazy(loadEmailDomainSuggestions);
const loadHeightWeightField = () => import('@/components/preview/HeightWeightField');
const HeightWeightField = lazy(loadHeightWeightField);
const loadChartLivePreview = () => import('@/components/editor/chart-designer/ChartLivePreview');
const ChartLivePreview = lazy(loadChartLivePreview);
const loadComparativeChartPreview = () => import('@/components/preview/charts/ComparativeChartPreview');
const ComparativeChartPreview = lazy(loadComparativeChartPreview);
const loadCircularProgressPreview = () => import('@/components/preview/CircularProgressPreview');
const CircularProgressPreview = lazy(loadCircularProgressPreview);
const loadIOSNotification = () => import('@/components/preview/IOSNotification');
const IOSNotification = lazy(loadIOSNotification);
const loadDateFieldPreview = () => import('@/components/preview/DateFieldPreview');
const DateFieldPreview = lazy(loadDateFieldPreview);
const loadTimerPreview = () => import('@/components/preview/TimerPreview');
const TimerPreview = lazy(loadTimerPreview);
const loadListPreview = () => import('@/components/preview/ListPreview');
const ListPreview = lazy(loadListPreview);
const loadLoadingPreview = () => import('@/components/preview/LoadingPreview');
const LoadingPreview = lazy(loadLoadingPreview);
const loadDocumentFieldPreview = () => import('@/components/preview/DocumentFieldPreview');
const DocumentFieldPreview = lazy(loadDocumentFieldPreview);
const loadCompanyFieldPreview = () => import('@/components/preview/CompanyFieldPreview');
const CompanyFieldPreview = lazy(loadCompanyFieldPreview);
const loadAddressFieldPreview = () => import('@/components/preview/AddressFieldPreview');
const AddressFieldPreview = lazy(loadAddressFieldPreview);
const loadProgressBarColumn = () => import('@/components/preview/ProgressBarColumn');
const ProgressBarColumn = lazy(loadProgressBarColumn);
const loadBeforeAfterSlider = () => import('@/components/preview/BeforeAfterSlider');
const BeforeAfterSlider = lazy(loadBeforeAfterSlider);

// Section previews — lazy loaded to reduce initial bundle
const loadSectionPreviews = () => import('@/components/editor/page-builder/SectionPreviews');
const ArgumentsPreview = lazy(() => loadSectionPreviews().then(m => ({ default: m.ArgumentsPreview })));
const TestimonialsPreview = lazy(() => loadSectionPreviews().then(m => ({ default: m.TestimonialsPreview })));
const FAQPreview = lazy(() => loadSectionPreviews().then(m => ({ default: m.FAQPreview })));
const PricingPreview = lazy(() => loadSectionPreviews().then(m => ({ default: m.PricingPreview })));
const CarouselPreview = lazy(() => loadSectionPreviews().then(m => ({ default: m.CarouselPreview })));
const loadWhatsAppInvite = () => import('@/components/preview/WhatsAppInvitePreview');
const WhatsAppInvitePreview = lazy(() => loadWhatsAppInvite().then(m => ({ default: m.default })));

// Wrapper to keep Suspense local and avoid route-level blank/loading screens
function LazyWrap({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div className="w-full min-h-24 rounded-xl bg-muted/30 animate-pulse" />}>{children}</Suspense>;
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

function prefetchLazyComponentsForElements(
  elements?: PageElement[],
  priority: 'immediate' | 'idle' = 'idle'
) {
  if (!elements || elements.length === 0) return;

  const loaders = new Set<() => Promise<unknown>>();

  const collect = (items: PageElement[]) => {
    for (const el of items) {
      switch (el.type) {
        case 'input_phone':
          loaders.add(loadPhoneFieldPreview);
          break;
        case 'input_email':
          loaders.add(loadEmailDomainSuggestions);
          break;
        case 'input_weight':
          loaders.add(loadHeightWeightField);
          break;
        case 'chart':
          loaders.add(loadChartLivePreview);
          break;
        case 'comparative_chart':
          loaders.add(loadComparativeChartPreview);
          break;
        case 'circular_progress':
          loaders.add(loadCircularProgressPreview);
          break;
        case 'notification':
          loaders.add(loadIOSNotification);
          break;
        case 'input_date':
          loaders.add(loadDateFieldPreview);
          break;
        case 'timer':
          loaders.add(loadTimerPreview);
          break;
        case 'list':
          loaders.add(loadListPreview);
          break;
        case 'loading':
          loaders.add(loadLoadingPreview);
          break;
        case 'input_document':
          loaders.add(loadDocumentFieldPreview);
          break;
        case 'input_company':
          loaders.add(loadCompanyFieldPreview);
          break;
        case 'input_address':
          loaders.add(loadAddressFieldPreview);
          break;
        case 'progress_bar':
          loaders.add(loadProgressBarColumn);
          break;
        case 'before_after':
          loaders.add(loadBeforeAfterSlider);
          break;
        case 'arguments':
        case 'testimonials':
        case 'faq':
        case 'pricing':
        case 'carousel':
          loaders.add(loadSectionPreviews);
          break;
        case 'whatsapp_invite':
          loaders.add(loadWhatsAppInvite);
          break;
        case 'columns': {
          const columns = (el as any).columnData || [];
          for (const col of columns) {
            collect((col?.elements || []) as PageElement[]);
          }
          break;
        }
      }
    }
  };

  collect(elements);
  if (loaders.size === 0) return;

  const run = () => {
    Promise.allSettled([...loaders].map((loader) => loader())).catch(() => {});
  };

  if (priority === 'immediate') {
    run();
    return;
  }

  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run);
  } else {
    setTimeout(run, 0);
  }
}

/** Resolve userData (email, phone, name) from a UserDataMapping and current answers */
function resolveUserData(
  mapping: UserDataMapping | undefined,
  answers: Record<string, any>,
  form: AppFormData,
): { email?: string; phone?: string; name?: string } {
  const result: { email?: string; phone?: string; name?: string } = {};

  // Helper: find first element of given type across all pages
  const findFirstElement = (type: string): string | undefined => {
    for (const page of form.pages || []) {
      for (const el of page.elements || []) {
        if (el.type === type) return el.id;
      }
    }
    return undefined;
  };

  // Email
  const emailId = mapping?.emailElementId === '__none__' ? undefined
    : (mapping?.emailElementId || findFirstElement('input_email'));
  if (emailId && answers[emailId]) {
    result.email = String(answers[emailId]);
  }

  // Phone
  const phoneId = mapping?.phoneElementId === '__none__' ? undefined
    : (mapping?.phoneElementId || findFirstElement('input_phone'));
  if (phoneId && answers[phoneId]) {
    const val = answers[phoneId];
    result.phone = typeof val === 'object' && val?.full_number ? val.full_number : String(val);
  }

  // Name
  const nameId = mapping?.nameElementId === '__none__' ? undefined
    : (mapping?.nameElementId || findFirstElement('input_short_text') || findFirstElement('input_text'));
  if (nameId && answers[nameId]) {
    result.name = String(answers[nameId]);
  }

  return result;
}

export default function FormPreview() { // perf-v2
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const store = useFormStoreSafe();

  // Try to get form from store first (when editor is open), otherwise fetch publicly
  const storeForm = store?.getForm(id!) ?? null;
  const [publicForm, setPublicForm] = useState<AppFormData | null>(null);
  const [publicLoading, setPublicLoading] = useState(!storeForm);
  const [showPublicSkeleton, setShowPublicSkeleton] = useState(true);
  const [isInitialStateReady, setIsInitialStateReady] = useState(false);

  useEffect(() => {
    if (storeForm || !id) return;
    setPublicLoading(true);

    let cancelled = false;

    const parseFormData = (data: any) => {
      if (cancelled) return;
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

    const withTimeout = <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error(`${label}_timeout`)), ms);
        promise
          .then((value) => {
            window.clearTimeout(timer);
            resolve(value);
          })
          .catch((err) => {
            window.clearTimeout(timer);
            reject(err);
          });
      });

    // Source 1: prefetch (started in main.tsx before React mounted)
    const fromPrefetch = withTimeout(
      consumePrefetchedForm(id).then((result) => {
        if (result?.data && !result.error) return result.data;
        throw new Error('prefetch_miss');
      }),
      2500,
      'prefetch'
    );

    // Source 2: lightweight edge function via raw fetch (avoids Supabase SDK overhead)
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
    const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
    const fromEdge = withTimeout(
      fetch(`${SUPABASE_URL}/functions/v1/form-public-get?id=${id}`, {
        headers: {
          'apikey': ANON_KEY,
          'Authorization': `Bearer ${ANON_KEY}`,
          'Accept': 'application/json',
        },
        cache: 'no-store',
      }).then(async (res) => {
        if (!res.ok) throw new Error('edge_fetch_failed');
        const data = await res.json();
        if (data.error) throw new Error('edge_data_error');
        return data;
      }),
      6000,
      'edge'
    );

    // Source 3: direct backend query (slowest, but most reliable)
    // Only start this after a short delay to avoid unnecessary load if edge resolves fast
    const fromDirectQuery = withTimeout(new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => {
        supabase
          .from('forms')
          .select('id, title, status, data')
          .eq('id', id)
          .single()
          .then(({ data, error }) => {
            if (error || !data) reject(new Error('direct_query_failed'));
            else resolve(data);
          });
      }, 300); // 300ms head start for prefetch/edge
      // Clean up timer if we resolve early
      fromPrefetch.then(() => clearTimeout(timer)).catch(() => {});
      fromEdge.then(() => clearTimeout(timer)).catch(() => {});
    }), 7000, 'direct');

    let resolved = false;
    let failures = 0;
    const totalSources = 3;
    const loadingFailSafeTimer = window.setTimeout(() => {
      if (!cancelled && !resolved) setPublicLoading(false);
    }, 10000);

    const resolveOnce = (data: any) => {
      if (cancelled || resolved) return;
      resolved = true;
      window.clearTimeout(loadingFailSafeTimer);
      parseFormData(data);
    };

    const handleFailure = () => {
      failures += 1;
      if (!cancelled && !resolved && failures >= totalSources) {
        window.clearTimeout(loadingFailSafeTimer);
        setPublicLoading(false);
      }
    };

    Promise.resolve(fromPrefetch).then(resolveOnce).catch(handleFailure);
    Promise.resolve(fromEdge).then(resolveOnce).catch(handleFailure);
    Promise.resolve(fromDirectQuery).then(resolveOnce).catch(handleFailure);

    return () => {
      cancelled = true;
      window.clearTimeout(loadingFailSafeTimer);
    };
  }, [id, storeForm]);

  const form = storeForm || publicForm;

  // ── Preview mode detection — IMMUTABLE after first detection ─────────────
  // Once true, it NEVER becomes false. Prevents stale-closure side-effect leaks.
  const isEditorPreviewRef = useRef(false);
  const computedPreview = !!storeForm || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('editorPreview') === '1');
  if (computedPreview && !isEditorPreviewRef.current) {
    isEditorPreviewRef.current = true;
  }
  const isEditorPreview = isEditorPreviewRef.current;

  // Debug: log preview mode once on mount (no-op in prod — tree-shaken)
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log('[FormPreview] isEditorPreview =', isEditorPreviewRef.current, '| storeForm =', !!storeForm);
    }
  }, []);

  useEffect(() => {
    if (!publicLoading) setShowPublicSkeleton(false);
  }, [publicLoading]);

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
          if (parsed.answers && typeof parsed.pageIndex === 'number') {
            setAnswers({ ...defaults, ...parsed.answers });
            setCurrentPageIndex(parsed.pageIndex);
            maxPageVisitedRef.current = parsed.maxPage ?? parsed.pageIndex;

            prefetchLazyComponentsForElements(form.pages?.[parsed.pageIndex]?.elements || [], 'immediate');
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

    // Request geolocation asynchronously ONLY after user interacts (saves 3-5s GPS timeout)
    // Uses a one-shot interaction listener to defer the heavy geo call
    if (form.enableGeolocation !== false) {
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
      // Start geo after first click/touch OR after 3s idle — whichever comes first
      const triggerGeo = () => {
        geoHandler();
        window.removeEventListener('pointerdown', triggerGeo);
        clearTimeout(geoTimer);
      };
      window.addEventListener('pointerdown', triggerGeo, { once: true, passive: true });
      const geoTimer = setTimeout(triggerGeo, 3000);
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


  // Auto-complete when user reaches a true terminal page (no inputs/buttons and no outgoing flow)
  useEffect(() => {
    if (!form || finished || currentPageIndex === null) return;

    const page = pages[currentPageIndex];
    if (!page) return;

    const hasInputFields = page.elements?.some(el => el.type.startsWith('input_'));
    const hasActionButtons = page.elements?.some(el => el.type === 'button');
    const hasOutgoingFlow = (form.flowEdges || []).some(edge => edge.source === `p-${page.id}`);
    const isLastPage = isFlowLastPage;

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
    const disabledNodes = new Set(f?.disabledNodes || []);

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

      // Intermediate: A/B Test node — pick random variant based on weights
      if (target.startsWith('ab-')) {
        const abId = target.replace('ab-', '');
        const abNode = f?.abTestNodes?.find(n => n.id === abId);
        if (abNode && abNode.variants?.length) {
          const totalWeight = abNode.variants.reduce((s, v) => s + v.weight, 0);
          let random = Math.random() * totalWeight;
          let chosenVariant = abNode.variants[0];
          for (const variant of abNode.variants) {
            random -= variant.weight;
            if (random <= 0) { chosenVariant = variant; break; }
          }
          // Handle ID matches ABTestNode component: `ab-${variant.id}`
          const variantEdge = edges.find(e => e.source === target && e.sourceHandle === `ab-${chosenVariant.id}`);
          if (variantEdge) {
            // Keep traversing from the variant's target (don't strip p- prefix)
            currentNodeId = variantEdge.target;
            continue;
          }
        }
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

      if (target.startsWith('c-')) {
        currentNodeId = target;
        continue;
      }

      // Any other node (start, unknown) — just advance
      currentNodeId = target;
    }

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

    // Override --primary inside form preview for field focus/selected borders
    (s as any)['--primary'] = '48 24% 62%'; /* #B3AB86 */

    return s;
  }, [form?.globalPageStyle, form?.style]);

  const isBootstrapping = !!form && !isInitialStateReady;

  if (publicLoading || isBootstrapping) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        {(publicLoading ? showPublicSkeleton : true) && (
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

  // ── Closed form: redirect or show message ─────────────────
  if (form.status === 'closed' && !isEditorPreview) {
    if (form.closedRedirectUrl) {
      window.location.href = form.closedRedirectUrl;
      return null;
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <div className="text-center max-w-md space-y-4">
          <div className="mx-auto w-14 h-14 rounded-full bg-muted flex items-center justify-center">
            <XCircle className="h-7 w-7 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">Formulário encerrado</h1>
          <p className="text-sm text-muted-foreground">
            {form.closedMessage || 'Este formulário não está mais aceitando respostas.'}
          </p>
        </div>
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
              <Suspense fallback={
                <div className="w-full mx-auto my-auto" style={contentContainerStyle}>
                  <div className="w-full min-h-[160px] rounded-xl bg-muted/30 animate-pulse" />
                </div>
              }>
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
              </motion.div>
              </Suspense>
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
  formStyle,
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
  formStyle?: FormStyle;
}) {
  const { type, style } = element;
  const t = (text: string | undefined) => text ? interpolateText(text, variables, answers) : text;
  /** Interpolate returning React nodes with styled variable highlights */
  const tNodes = (text: string | undefined) => text ? interpolateTextToNodes(text, variables, answers) : text;
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
  const onBlockedChangeRef = useRef(onBlockedChange);
  onBlockedChangeRef.current = onBlockedChange;

  useEffect(() => {
    if (element.type === 'input_email') {
      onBlockedChangeRef.current(emailChecking);
    } else {
      onBlockedChangeRef.current(false);
    }
  }, [emailChecking, element.type]);

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

  const numStyle = formStyle?.questionNumberStyle || 'decimal';
  const numHidden = numStyle === 'none';
  const formatNum = (n: number) => {
    if (numStyle === 'circle') {
      // Circled numbers ①–⑳
      const circled = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
      return n >= 1 && n <= 20 ? circled[n - 1] : `${n}`;
    }
    return `${n}`;
  };

  const numInline: React.CSSProperties = !fieldError ? {
    color: formStyle?.questionNumberColor || 'inherit',
    fontSize: formStyle?.questionNumberSize || undefined,
    fontWeight: (formStyle?.questionNumberWeight as any) || undefined,
  } : {};

  const titleInline: React.CSSProperties = {
    color: formStyle?.questionTitleColor || 'inherit',
    fontSize: formStyle?.questionTitleSize || undefined,
    fontWeight: (formStyle?.questionTitleWeight as any) || undefined,
  };

  const descInline: React.CSSProperties = {
    color: formStyle?.questionDescColor || undefined,
    fontSize: formStyle?.questionDescSize || undefined,
    fontWeight: (formStyle?.questionDescWeight as any) || undefined,
  };

  /** Wraps form fields with the "N → enunciado" Typeform header + description */
  const withFieldHeader = (content: React.ReactNode) => (
    <div className={`space-y-3 md:space-y-6 ${fieldError ? 'animate-shake' : ''}`}>
      <div className="flex items-start gap-1.5 md:gap-3">
        {!numHidden && (
          <>
            <span className={`text-base md:text-xl lg:text-2xl font-semibold mt-0.5 ${fieldError ? 'text-destructive' : ''}`} style={numInline}>{formatNum(stepNumber)}</span>
            <span className={`text-base md:text-xl lg:text-2xl font-semibold mt-0.5 ${fieldError ? 'text-destructive' : ''}`} style={numInline}>→</span>
          </>
        )}
        <div>
          <h2 className="text-base md:text-xl lg:text-2xl font-semibold leading-snug" style={titleInline}>
            {tNodes(element.label) || 'Sem título'}
            {element.required && <span className="text-destructive ml-1">*</span>}
          </h2>
          {element.description && (
            <p className="text-sm md:text-base text-muted-foreground mt-1 md:mt-2" style={descInline}>{tNodes(element.description)}</p>
          )}
        </div>
      </div>
      <div className={numHidden ? '' : 'pl-7 md:pl-12 lg:pl-14'}>
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
          <div className={`${sizeMap[element.level || 2]} font-bold text-foreground`} style={{ color: style?.color, fontFamily: normalizeFontFamily(style?.fontFamily), fontWeight: style?.fontWeight }}>
            {tNodes(element.content) || 'Título'}
          </div>
        </div>
      );
    }

    case 'text':
      return wrapWithStyle(
        <div className={alignClass}>
          <p className="text-base text-foreground/80 whitespace-pre-wrap leading-relaxed" style={{ color: style?.color, fontFamily: normalizeFontFamily(style?.fontFamily), fontWeight: style?.fontWeight }}>
            {tNodes(element.content) || ''}
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
              backgroundColor: style?.backgroundColor || formStyle?.buttonBgColor || formStyle?.primaryColor,
              borderRadius: style?.borderRadius ?? formStyle?.buttonBorderRadius,
              width: style?.width || 'auto',
              padding: style?.padding !== undefined
                ? `${style.padding}px ${style.padding * 1.5}px`
                : (formStyle?.buttonSize === 'sm' ? '6px 16px' : formStyle?.buttonSize === 'lg' ? '14px 32px' : '10px 24px'),
              color: style?.color || formStyle?.buttonTextColor,
              fontFamily: normalizeFontFamily(style?.fontFamily || formStyle?.bodyFontFamily || formStyle?.fontFamily),
              fontWeight: style?.fontWeight,
              fontSize: formStyle?.buttonSize === 'sm' ? 13 : formStyle?.buttonSize === 'lg' ? 16 : undefined,
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
          items={(element.notificationItems || []).map(ni => ({
            ...ni,
            title: t(ni.title) || '',
            text: t(ni.text) || '',
          }))}
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
    case 'whatsapp_invite':
      return wrapWithStyle(
        <WhatsAppInvitePreview element={element} />
      );

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
          {(element.options || []).map((opt, i) => {
            const isSelected = value === opt.id;
            return (
              <motion.button
                key={opt.id}
                onClick={() => onChange(opt.id)}
                whileTap={{ scale: 0.97 }}
                animate={isSelected ? {
                  scale: [1, 1.02, 1],
                  boxShadow: ['0 0 0 0px rgba(44,40,23,0)', '0 0 0 4px rgba(44,40,23,0.15)', '0 0 0 0px rgba(44,40,23,0)'],
                } : {}}
                transition={{ duration: 0.35 }}
                className={`w-full text-left px-3 py-3 md:px-5 md:py-4 rounded-xl border-2 transition-all flex items-center gap-3 md:gap-4 ${
                  isSelected
                    ? 'border-[#2C2817] bg-[#2C2817]/5 text-foreground shadow-sm'
                    : 'border-border hover:bg-[#2C2817]/5 hover:border-[#2C2817]/30 text-foreground'
                }`}
              >
                <motion.span
                  className={`h-6 w-6 md:h-7 md:w-7 rounded-lg border-2 text-xs font-bold flex items-center justify-center flex-shrink-0 transition-all ${
                    isSelected ? 'border-[#2C2817] bg-[#2C2817] text-white' : 'border-border text-muted-foreground'
                  }`}
                  animate={isSelected ? { scale: [1, 1.3, 1], rotate: [0, -8, 8, 0] } : {}}
                  transition={{ duration: 0.3 }}
                >
                  {isSelected ? <Check className="h-3.5 w-3.5" /> : String.fromCharCode(65 + letterOffset + i)}
                </motion.span>
                <span className="text-base md:text-lg">{t(opt.label)}</span>
              </motion.button>
            );
          })}
        </div>
      );

    case 'input_radio':
      return withFieldHeader(
        <div className="space-y-2 md:space-y-3">
          {(element.options || []).map((opt, i) => {
            const isSelected = value === opt.id;
            return (
              <motion.button
                key={opt.id}
                onClick={() => onChange(opt.id)}
                whileTap={{ scale: 0.97 }}
                animate={isSelected ? {
                  scale: [1, 1.02, 1],
                  boxShadow: ['0 0 0 0px rgba(44,40,23,0)', '0 0 0 4px rgba(44,40,23,0.15)', '0 0 0 0px rgba(44,40,23,0)'],
                } : {}}
                transition={{ duration: 0.35 }}
                className={`w-full text-left px-3 py-3 md:px-5 md:py-4 rounded-xl border-2 transition-all flex items-center gap-3 md:gap-4 ${
                  isSelected
                    ? 'border-[#2C2817] bg-[#2C2817]/5 text-foreground shadow-sm'
                    : 'border-border hover:bg-[#2C2817]/5 hover:border-[#2C2817]/30 text-foreground'
                }`}
              >
                <motion.span
                  className={`h-6 w-6 md:h-7 md:w-7 rounded-lg border-2 text-xs font-bold flex items-center justify-center flex-shrink-0 transition-all ${
                    isSelected ? 'border-[#2C2817] bg-[#2C2817] text-white' : 'border-border text-muted-foreground'
                  }`}
                  animate={isSelected ? { scale: [1, 1.3, 1], rotate: [0, -8, 8, 0] } : {}}
                  transition={{ duration: 0.3 }}
                >
                  {String.fromCharCode(65 + letterOffset + i)}
                </motion.span>
                <span className="text-base md:text-lg">{t(opt.label)}</span>
              </motion.button>
            );
          })}
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
                  ? 'border-primary bg-transparent text-foreground shadow-sm'
                  : 'border-border hover:bg-primary/5 hover:border-primary/40 text-foreground'
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
                whileTap={{ scale: 0.97 }}
                animate={isSelected ? {
                  scale: [1, 1.02, 1],
                  boxShadow: ['0 0 0 0px rgba(44,40,23,0)', '0 0 0 4px rgba(44,40,23,0.15)', '0 0 0 0px rgba(44,40,23,0)'],
                } : {}}
                transition={{ duration: 0.35 }}
                className={`w-full text-left px-3 py-3 md:px-5 md:py-4 rounded-xl border-2 transition-all flex items-center gap-3 md:gap-4 ${
                  isSelected
                    ? 'border-[#2C2817] bg-[#2C2817]/5 text-foreground shadow-sm'
                    : 'border-border hover:bg-[#2C2817]/5 hover:border-[#2C2817]/30 text-foreground'
                }`}
              >
                <motion.span
                  className={`h-6 w-6 md:h-7 md:w-7 rounded-md border-2 text-xs font-bold flex items-center justify-center flex-shrink-0 transition-all ${
                    isSelected ? 'border-[#2C2817] bg-[#2C2817] text-white' : 'border-border text-muted-foreground'
                  }`}
                  animate={isSelected ? { scale: [1, 1.3, 1], rotate: [0, -8, 8, 0] } : {}}
                  transition={{ duration: 0.3 }}
                >
                  {isSelected ? <Check className="h-3.5 w-3.5" /> : String.fromCharCode(65 + letterOffset + i)}
                </motion.span>
                <span className="text-base md:text-lg flex-1">{t(opt.label)}</span>
                <motion.div
                  className={`h-5 w-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                    isSelected ? 'border-[#2C2817] bg-[#2C2817]' : 'border-border'
                  }`}
                  animate={isSelected ? { scale: [1, 1.2, 1] } : {}}
                  transition={{ duration: 0.2 }}
                >
                  {isSelected && <Check className="h-3 w-3 text-white" />}
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
                    ? 'border-primary bg-transparent shadow-sm'
                    : 'border-border hover:bg-primary/5 hover:border-primary/40'
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
                  {selected && <div className="absolute inset-0 bg-transparent" />}
                </div>
                <div className={`px-3 py-2 text-sm font-medium text-center`}>{t(opt.label)}</div>
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

import { useParams } from 'react-router-dom';
import { useFormStoreSafe } from '@/hooks/useFormStore';
import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { FormData as AppFormData } from '@/types/form';
import { supabase } from '@/integrations/supabase/client';
import { consumePrefetchedForm } from '@/lib/formPrefetch';

// Start loading Core chunk IMMEDIATELY — runs in parallel with data fetch
const coreModule = import('./FormPreviewCore');
const FormPreviewCore = lazy(() => coreModule);

function LoadingSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="h-5 w-5 rounded-full border-2 border-foreground/20 border-t-foreground animate-spin" />
    </div>
  );
}

export default function FormPreview() {
  const { id } = useParams<{ id: string }>();
  const store = useFormStoreSafe();
  const storeForm = store?.getForm(id!) ?? null;
  const [publicForm, setPublicForm] = useState<AppFormData | null>(null);
  const [publicLoading, setPublicLoading] = useState(!storeForm);
  const [showPublicSkeleton, setShowPublicSkeleton] = useState(true);

  useEffect(() => {
    if (storeForm || !id) return;
    setPublicLoading(true);

    let cancelled = false;

    const normalizeFormPayload = (payload: any): AppFormData | null => {
      if (!payload) return null;

      // Handles: row, edge response row, prefetch { data: row, error }, and future { form: row }
      const unwrapped = payload.form ?? payload.data ?? payload;
      const row = unwrapped?.id && unwrapped?.data ? unwrapped : payload;
      const blob = row?.data && typeof row.data === 'object' ? row.data : row;

      if (!blob || typeof blob !== 'object') return null;

      return {
        ...(blob as AppFormData),
        id: row?.id ?? (blob as any).id,
        title: row?.title ?? (blob as any).title,
        status: (row?.status ?? (blob as any).status) as AppFormData['status'],
        createdAt: row?.created_at ?? row?.createdAt ?? (blob as any).createdAt,
        updatedAt: row?.updated_at ?? row?.updatedAt ?? (blob as any).updatedAt,
      };
    };

    const parseFormData = (payload: any): AppFormData | null => {
      const form = normalizeFormPayload(payload);
      return form;
    };

    const formTimestamp = (candidate: AppFormData | null): number => {
      if (!candidate) return 0;
      const raw = candidate.updatedAt || candidate.createdAt;
      if (!raw) return 0;
      const ts = Date.parse(raw);
      return Number.isFinite(ts) ? ts : 0;
    };

    const withTimeout = <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error(`${label}_timeout`)), ms);
        promise
          .then((value) => { window.clearTimeout(timer); resolve(value); })
          .catch((err) => { window.clearTimeout(timer); reject(err); });
      });

    // Source 1: prefetch cache (started in main.tsx)
    // Always consume so we can reuse in-flight prefetch promise instead of dropping it.
    const fromPrefetch = withTimeout(
      consumePrefetchedForm(id).then((result: any) => {
        const payload = result?.data ?? result;
        if (!payload || payload?.error) throw new Error('prefetch_failed');
        return payload;
      }),
      5000,
      'prefetch'
    );

    // Source 2: edge function
    const fromEdge = withTimeout(
      supabase.functions.invoke('form-public-get', { body: { id } }).then(({ data, error }) => {
        if (error || !data) throw new Error('edge_failed');
        return data;
      }),
      5000, 'edge'
    );

    // Source 3: direct query (delayed 300ms to give edge/prefetch a head start)
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
      }, 300);
      fromPrefetch.then(() => clearTimeout(timer)).catch(() => {});
      fromEdge.then(() => clearTimeout(timer)).catch(() => {});
    }), 7000, 'direct');

    let bestTimestamp = -1;
    let succeeded = false;
    let failures = 0;
    const totalSources = 3;
    const loadingFailSafeTimer = window.setTimeout(() => {
      if (!cancelled && !succeeded) setPublicLoading(false);
    }, 10000);

    const handleSourceSuccess = (data: any) => {
      if (cancelled) return;
      const candidate = parseFormData(data);
      const candidateTs = formTimestamp(candidate);

      if (candidate && (!succeeded || candidateTs >= bestTimestamp)) {
        bestTimestamp = candidateTs;
        setPublicForm(candidate);
      }

      succeeded = true;
      window.clearTimeout(loadingFailSafeTimer);
      setPublicLoading(false);
    };

    const handleFailure = () => {
      failures += 1;
      if (!cancelled && !succeeded && failures >= totalSources) {
        window.clearTimeout(loadingFailSafeTimer);
        setPublicLoading(false);
      }
    };

    Promise.resolve(fromPrefetch).then(handleSourceSuccess).catch(handleFailure);
    Promise.resolve(fromEdge).then(handleSourceSuccess).catch(handleFailure);
    Promise.resolve(fromDirectQuery).then(handleSourceSuccess).catch(handleFailure);

    return () => {
      cancelled = true;
      window.clearTimeout(loadingFailSafeTimer);
    };
  }, [id, storeForm]);

  const form = storeForm || publicForm;

  // ── Preview mode detection ─────────────────
  const isEditorPreviewRef = useRef(false);
  const computedPreview = !!storeForm || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('editorPreview') === '1');
  if (computedPreview && !isEditorPreviewRef.current) {
    isEditorPreviewRef.current = true;
  }
  const isEditorPreview = isEditorPreviewRef.current;

  useEffect(() => {
    if (!publicLoading) setShowPublicSkeleton(false);
  }, [publicLoading]);

  // Loading state
  if (publicLoading) {
    return showPublicSkeleton ? <LoadingSpinner /> : <div className="min-h-screen bg-background" />;
  }

  // Not found
  if (!form) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6">
      <div className="text-center max-w-md space-y-4">
        <div className="mx-auto w-14 h-14 rounded-full bg-muted flex items-center justify-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <h1 className="text-xl font-semibold text-foreground">Formulário não encontrado</h1>
        <p className="text-sm text-muted-foreground">Este formulário não existe ou não está disponível no momento.</p>
      </div>
    </div>
  );

  // Closed
  if (form.status === 'closed' && !isEditorPreview) {
    if (form.closedRedirectUrl) {
      window.location.href = form.closedRedirectUrl;
      return null;
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <div className="text-center max-w-md space-y-4">
          <div className="mx-auto w-14 h-14 rounded-full bg-muted flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><circle cx="12" cy="12" r="10"/><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </div>
          <h1 className="text-xl font-semibold text-foreground">Formulário encerrado</h1>
          <p className="text-sm text-muted-foreground">{form.closedMessage || 'Este formulário não está mais aceitando respostas.'}</p>
        </div>
      </div>
    );
  }

  // Form ready → lazy-load the heavy Core (framer-motion, lucide, workflow engine)
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <FormPreviewCore form={form} isEditorPreview={isEditorPreview} />
    </Suspense>
  );
}

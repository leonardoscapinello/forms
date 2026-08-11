import { useParams } from 'react-router-dom';
import { useFormStoreSafe } from '@/hooks/formStoreContext';
import { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { FormData as AppFormData } from '@/types/form';
import { consumePrefetchedForm } from '@/lib/formPrefetch';
import { invokeEdge } from '@/lib/edgeClient';
import { prepareRedirectDestination, resolveRedirectDestination } from '@/lib/redirectDestination';
import { captureSessionContext, contextToAnswers } from '@/lib/sessionContext';
import {
  clearStoredFormResume,
  isRejectedResumePayload,
  readStoredFormResumeIdentity,
} from '@/lib/formResume';
import { clearDurablePublicSavesForForm } from '@/lib/publicSaveQueue';

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

function dismissServerRenderedShell() {
  const shell = document.getElementById('form-ssr-shell');
  if (!shell || shell.dataset.dismissing === 'true') return;
  shell.dataset.dismissing = 'true';
  shell.style.opacity = '0';
  window.setTimeout(() => shell.remove(), 220);
}

function SafeRedirect({ template, variables = [] }: Pick<AppFormData, 'variables'> & { template: string }) {
  const contextAnswers = useMemo(() => contextToAnswers(captureSessionContext()), []);
  const destination = useMemo(
    () => resolveRedirectDestination(template, variables, contextAnswers),
    [contextAnswers, template, variables],
  );

  useEffect(() => {
    if (!destination) return;
    prepareRedirectDestination({ template, variables, answers: contextAnswers, phase: 'final' });
    const timeout = window.setTimeout(() => window.location.assign(destination.url), 0);
    return () => window.clearTimeout(timeout);
  }, [contextAnswers, destination, template, variables]);

  return destination ? <LoadingSpinner /> : null;
}

export default function FormPreview() {
  const { id } = useParams<{ id: string }>();
  const store = useFormStoreSafe();
  const storeForm = store?.getForm(id!) ?? null;
  const [publicForm, setPublicForm] = useState<AppFormData | null>(null);
  const [publicLoading, setPublicLoading] = useState(!storeForm);
  const [showPublicSkeleton, setShowPublicSkeleton] = useState(true);
  const [unavailableRedirectUrl, setUnavailableRedirectUrl] = useState<string | null>(null);
  const previewParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const previewSession = previewParams?.get('previewSession') || '';
  const isSandboxedEditorPreview = typeof window !== 'undefined'
    && window.parent !== window
    && previewParams?.get('editorPreview') === '1'
    && previewSession.length > 0;

  useEffect(() => {
    if (storeForm || !id) return;
    setPublicLoading(true);

    let cancelled = false;

    if (isSandboxedEditorPreview) {
      const previewTimeout = window.setTimeout(() => {
        if (!cancelled) setPublicLoading(false);
      }, 10_000);
      const handlePreviewData = (event: MessageEvent) => {
        if (event.source !== window.parent) return;
        const payload = event.data;
        if (payload?.type !== 'forms-editor-preview-data' || payload?.formId !== id) return;
        if (payload?.previewSession !== previewSession) return;
        if (!payload.form || typeof payload.form !== 'object' || payload.form.id !== id) return;
        window.clearTimeout(previewTimeout);
        setPublicForm(payload.form as AppFormData);
        setPublicLoading(false);
      };
      window.addEventListener('message', handlePreviewData);
      window.parent.postMessage({
        type: 'forms-editor-preview-ready',
        formId: id,
        previewSession,
      }, '*');
      return () => {
        cancelled = true;
        window.clearTimeout(previewTimeout);
        window.removeEventListener('message', handlePreviewData);
      };
    }

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

    const withTimeout = <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error(`${label}_timeout`)), ms);
        promise
          .then((value) => { window.clearTimeout(timer); resolve(value); })
          .catch((err) => { window.clearTimeout(timer); reject(err); });
      });

    const loadingFailSafeTimer = window.setTimeout(() => {
      if (!cancelled) setPublicLoading(false);
    }, 10000);

    // A submission token is bound to one response/session pair. Reusing the
    // early prefetch and only calling the Edge fallback on failure prevents two
    // concurrent fetches from issuing different identities for the same render.
    void (async () => {
      let payload: any = null;
      let redirectUrl: string | null = null;
      try {
        const prefetched = await withTimeout(consumePrefetchedForm(id), 5000, 'prefetch');
        payload = prefetched?.data ?? prefetched;
        redirectUrl = typeof prefetched?.error?.redirectUrl === 'string' ? prefetched.error.redirectUrl : null;
        if (payload?.error) {
          if (typeof payload.redirectUrl === 'string') redirectUrl = payload.redirectUrl;
          payload = null;
        }
      } catch {
        payload = null;
      }

      if (!payload) {
        try {
          const resumeIdentity = readStoredFormResumeIdentity(id);
          let edge = await withTimeout(invokeEdge('form-public-get', {
            id,
            resumeToken: resumeIdentity?.submissionToken,
          }), 5000, 'edge');
          if (edge.error && resumeIdentity && isRejectedResumePayload(edge.data)) {
            clearStoredFormResume(id);
            clearDurablePublicSavesForForm(id);
            edge = await withTimeout(invokeEdge('form-public-get', { id }), 5000, 'edge_fresh');
          }
          if (!edge.error) payload = edge.data;
          else if (typeof (edge.data as any)?.redirectUrl === 'string') redirectUrl = (edge.data as any).redirectUrl;
        } catch {
          payload = null;
        }
      }

      if (cancelled) return;
      const candidate = normalizeFormPayload(payload);
      if (candidate && candidate.allowResume !== true) {
        clearStoredFormResume(id);
        clearDurablePublicSavesForForm(id);
      }
      if (candidate) setPublicForm(candidate);
      if (!candidate && redirectUrl) setUnavailableRedirectUrl(redirectUrl);
      window.clearTimeout(loadingFailSafeTimer);
      setPublicLoading(false);
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(loadingFailSafeTimer);
    };
  }, [id, isSandboxedEditorPreview, previewSession, storeForm]);

  const form = storeForm || publicForm;

  useEffect(() => {
    if (publicLoading) return;
    // The full renderer dismisses the shell only when its real first screen is
    // ready. Error/closed states do not mount it, so dismiss here instead.
    if (!form || (form.status === 'closed' && !isEditorPreviewRef.current)) {
      dismissServerRenderedShell();
    }
  }, [form, publicLoading]);

  // ── Preview mode detection ─────────────────
  const isEditorPreviewRef = useRef(false);
  const computedPreview = !!storeForm || isSandboxedEditorPreview;
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
  if (!form && unavailableRedirectUrl) {
    const destination = resolveRedirectDestination(unavailableRedirectUrl);
    if (destination) return <SafeRedirect template={unavailableRedirectUrl} />;
  }

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
    const safeRedirectUrl = resolveRedirectDestination(form.closedRedirectUrl, form.variables || []);
    if (safeRedirectUrl && form.closedRedirectUrl) {
      return <SafeRedirect template={form.closedRedirectUrl} variables={form.variables} />;
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

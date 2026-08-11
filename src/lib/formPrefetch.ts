/**
 * Early form data prefetch — starts the fetch BEFORE React even mounts.
 * This runs in parallel with JS chunk loading, saving 200-400ms on /f/:id routes.
 *
 * Uses the lightweight edge function that strips admin-only metadata,
 * reducing payload size by ~40% compared to the full Supabase query.
 */

import {
  clearStoredFormResume,
  isRejectedResumePayload,
  readStoredFormResumeIdentity,
} from './formResume';
import { clearDurablePublicSavesForForm } from './publicSaveQueue';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

const cache = new Map<string, { promise: Promise<any>; data?: any; error?: any; startedAt: number }>();

/** Call this as early as possible (in main.tsx) */
export function prefetchFormData(formId: string) {
  if (cache.has(formId)) return;

  const startedAt = performance.now();

  const promise = (async () => {
    try {
      const fetchPublicForm = async (resumeToken?: string): Promise<Response> => fetch(
        `${SUPABASE_URL}/functions/v1/form-public-get?id=${formId}`,
        {
          headers: {
            apikey: ANON_KEY,
            Authorization: `Bearer ${ANON_KEY}`,
            Accept: 'application/json',
            'Accept-Encoding': 'br, gzip',
            ...(resumeToken ? { 'x-form-resume-token': resumeToken } : {}),
          },
          // 'cors' + 'no-store' avoids double caching with SW
          cache: 'no-store',
        },
      );

      // A signed opaque credential lets the server rebind this reload to the
      // same response/session. Raw IDs are never trusted from browser storage.
      const resumeIdentity = readStoredFormResumeIdentity(formId);
      let res = await fetchPublicForm(resumeIdentity?.submissionToken);
      if (!res.ok && resumeIdentity) {
        const rejected = await res.clone().json().catch(() => null);
        if (isRejectedResumePayload(rejected)) {
          clearStoredFormResume(formId);
          clearDurablePublicSavesForForm(formId);
          res = await fetchPublicForm();
        }
      }

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        const error = {
          message: payload?.error || 'Edge function error',
          redirectUrl: typeof payload?.redirectUrl === 'string' ? payload.redirectUrl : undefined,
        };
        const entry = cache.get(formId);
        if (entry) { entry.error = error; }
        return { data: null, error };
      }

      const data = await res.json();
      const entry = cache.get(formId);
      if (entry) {
        if (data.error) {
          entry.error = data.error;
        } else {
          entry.data = data;
        }
      }
      return { data: data.error ? null : data, error: data.error || null };
    } catch (e) {
      // Fallback will be used by FormPreview
      const entry = cache.get(formId);
      if (entry) { entry.error = e; }
      return { data: null, error: e };
    }
  })();

  cache.set(formId, { promise, startedAt });
}

/** Check if prefetch already resolved (non-blocking peek) */
export function hasPrefetchedForm(formId: string): boolean {
  const entry = cache.get(formId);
  return !!(entry && (entry.data !== undefined || entry.error !== undefined));
}

/** Consume the prefetched data (called from FormPreview) */
export async function consumePrefetchedForm(formId: string) {
  const entry = cache.get(formId);
  if (!entry) return null;

  // If already resolved, return immediately
  if (entry.data !== undefined || entry.error !== undefined) {
    cache.delete(formId);
    return { data: entry.data, error: entry.error };
  }

  // Otherwise await the in-flight promise
  const result = await entry.promise;
  cache.delete(formId);
  return result;
}

/** Auto-detect /f/:id on page load */
export function autoDetectAndPrefetch() {
  const isSandboxedEditorPreview = window.parent !== window
    && new URLSearchParams(window.location.search).get('editorPreview') === '1';
  if (isSandboxedEditorPreview) return;
  const match = window.location.pathname.match(/^\/f\/([a-zA-Z0-9-]+)/);
  if (match?.[1]) {
    prefetchFormData(match[1]);
  }
}

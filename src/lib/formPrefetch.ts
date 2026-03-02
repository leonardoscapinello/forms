/**
 * Early form data prefetch — starts the fetch BEFORE React even mounts.
 * This runs in parallel with JS chunk loading, saving 200-400ms on /f/:id routes.
 *
 * Uses the lightweight edge function that strips admin-only metadata,
 * reducing payload size by ~40% compared to the full Supabase query.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

const cache = new Map<string, { promise: Promise<any>; data?: any; error?: any }>();

/** Call this as early as possible (in main.tsx) */
export function prefetchFormData(formId: string) {
  if (cache.has(formId)) return;

  const promise = (async () => {
    try {
      // Use the lightweight edge function — faster cold start, smaller payload
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/form-public-get?id=${formId}`,
        {
          headers: {
            'apikey': ANON_KEY,
            'Authorization': `Bearer ${ANON_KEY}`,
          },
        }
      );

      if (!res.ok) {
        const entry = cache.get(formId);
        if (entry) { entry.error = { message: 'Edge function error' }; }
        return { data: null, error: { message: 'Edge function error' } };
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

  cache.set(formId, { promise });
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
  const match = window.location.pathname.match(/^\/f\/([a-zA-Z0-9-]+)/);
  if (match?.[1]) {
    prefetchFormData(match[1]);
  }
}

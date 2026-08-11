const LEGACY_CACHE_PATTERN = /^forms-v\d+$/;

export function isPublishedFormLocation(location: Pick<Location, 'pathname' | 'search'>): boolean {
  return /^\/f\/[^/]+\/?$/.test(location.pathname)
    && new URLSearchParams(location.search).get('editorPreview') !== '1';
}

export function isEditorPreviewLocation(location: Pick<Location, 'pathname' | 'search'>): boolean {
  return /^\/f\/[^/]+\/?$/.test(location.pathname)
    && new URLSearchParams(location.search).get('editorPreview') === '1';
}

/** Sandboxed iframes without allow-same-origin have an opaque `null` origin. */
export function isOpaqueDocumentOrigin(origin: string | undefined): boolean {
  return origin === 'null';
}

function workerScriptPath(registration: ServiceWorkerRegistration): string {
  const scriptUrl = registration.active?.scriptURL
    ?? registration.waiting?.scriptURL
    ?? registration.installing?.scriptURL
    ?? '';

  try {
    return new URL(scriptUrl).pathname;
  } catch {
    return '';
  }
}

export function isLegacyFormsWorker(registration: ServiceWorkerRegistration): boolean {
  if (workerScriptPath(registration) !== '/sw.js') return false;
  try {
    return new URL(registration.scope).pathname !== '/f/';
  } catch {
    return true;
  }
}

/** Keeps the worker scoped to published forms; it can never control admin/preview routes. */
export async function configurePublicServiceWorker(): Promise<void> {
  // The responsive editor deliberately renders an opaque, isolated iframe.
  // Service Worker APIs are unavailable there and would throw SecurityError.
  if (isEditorPreviewLocation(window.location) || isOpaqueDocumentOrigin(window.origin)) return;
  if (!('serviceWorker' in navigator)) return;

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.filter(isLegacyFormsWorker).map((registration) => registration.unregister()));

    if (isPublishedFormLocation(window.location) && import.meta.env.PROD) {
      await navigator.serviceWorker.register('/sw.js', {
        scope: '/f/',
        updateViaCache: 'none',
      });
    }

    if ('caches' in window) {
      const cacheKeys = await window.caches.keys();
      await Promise.all(cacheKeys.filter((key) => LEGACY_CACHE_PATTERN.test(key)).map((key) => window.caches.delete(key)));
    }
  } catch (error) {
    // Forms remain fully functional without the optional runtime cache.
    console.warn('[service-worker]', error);
  }
}

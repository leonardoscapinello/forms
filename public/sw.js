const CACHE_NAME = 'forms-public-runtime-v1';
const CACHE_PREFIX = 'forms-public-';
const NAVIGATION_TIMEOUT_MS = 3500;

// ONLY cache assets for public form routes (/f/:id)
// Admin/dashboard routes must NEVER be cached

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => (key.startsWith(CACHE_PREFIX) || /^forms-v\d+$/.test(key)) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Editor previews share the /f/:id path but must never be cached/intercepted.
function isPublishedFormRoute(url) {
  return /^\/f\/[^/]+\/?$/.test(url.pathname) && url.searchParams.get('editorPreview') !== '1';
}

function isCacheable(response) {
  return response && response.ok && response.type !== 'opaque';
}

// The HTML shell never embeds GET parameters. Keeping them in the Cache API
// key would retain campaign ids — and potentially pre-populated PII — on the
// device while also creating an unbounded entry for every query variation.
function navigationCacheKey(request) {
  const url = new URL(request.url);
  url.search = '';
  url.hash = '';
  return url.toString();
}

async function requestComesFromPublicForm(event) {
  const clientId = event.clientId || event.resultingClientId;
  if (!clientId) return false;
  const client = await self.clients.get(clientId);
  if (!client) return false;
  return isPublishedFormRoute(new URL(client.url));
}

async function networkFirstNavigation(event) {
  const cache = await caches.open(CACHE_NAME);
  const cacheKey = navigationCacheKey(event.request);
  const controller = new AbortController();
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error('navigation_timeout'));
    }, NAVIGATION_TIMEOUT_MS);
  });

  try {
    const response = await Promise.race([fetch(event.request, { signal: controller.signal }), timeout]);
    clearTimeout(timeoutId);
    if (isCacheable(response)) {
      event.waitUntil(cache.put(cacheKey, response.clone()));
    }
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET
  if (event.request.method !== 'GET') return;
  // Skip backend API calls — these must always hit the network
  if (url.hostname.includes('supabase.co')) return;
  if (url.pathname.startsWith('/rest/') || url.pathname.startsWith('/auth/') || url.pathname.startsWith('/functions/')) return;

  // Never intercept Vite dev/HMR module requests (prevents stale dynamic-import failures)
  if (
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/node_modules/') ||
    url.pathname.startsWith('/@vite') ||
    url.pathname.startsWith('/@react-refresh')
  ) {
    return;
  }

  // For navigation requests: ONLY cache public form routes, never admin
  if (event.request.mode === 'navigate') {
    if (!isPublishedFormRoute(url)) return;
    event.respondWith(networkFirstNavigation(event));
    return;
  }

  // The worker is scoped to /f/, but the client check also protects users who
  // still have the old root-scoped worker during the one-time migration.
  if (url.origin !== self.location.origin) return;

  // Static assets: cache-first for immutable hashed assets, stale-while-revalidate for others.
  if (
    url.pathname.match(/\.(js|css|woff2?|ttf|png|svg|ico|webp|avif|jpg|jpeg)$/)
  ) {
    const responsePromise = requestComesFromPublicForm(event).then(async (isPublicClient) => {
      if (!isPublicClient) return fetch(event.request);

      // Vite/Rolldown hashes are URL-safe alphanumeric strings, not only hex.
      const isHashed = /[-.][A-Za-z0-9_-]{8,}\.(js|css)$/.test(url.pathname);
      const isScriptOrStyle = /\.(js|css)$/.test(url.pathname);

      // Non-hashed code must never be persisted; this avoids cache/version skew.
      if (isScriptOrStyle && !isHashed) return fetch(event.request);

      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(event.request);

      if (isHashed && cached) return cached;

      const network = fetch(event.request).then((response) => {
        if (isCacheable(response)) {
          event.waitUntil(cache.put(event.request, response.clone()));
        }
        return response;
      }).catch(() => cached);

      return cached || network;
    });

    event.respondWith(responsePromise);
    return;
  }
});

// Listen for messages to force-clear cache
self.addEventListener('message', (event) => {
  if (event.data === 'CLEAR_CACHE' || event.data?.type === 'CLEAR_PUBLIC_CACHES') {
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) || /^forms-v\d+$/.test(key))
          .map((key) => caches.delete(key))
      )
    ).then(() => {
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => client.postMessage('CACHE_CLEARED'));
      });
    });
  }
});

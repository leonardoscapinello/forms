const CACHE_NAME = 'formflow-v3';

// ONLY cache assets for public form routes (/f/:id)
// Admin/dashboard routes must NEVER be cached

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Check if a URL is a public form route
function isPublicFormRoute(url) {
  return url.pathname.startsWith('/f/');
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET
  if (event.request.method !== 'GET') return;
  // Skip Supabase API calls — these must always hit the network
  if (url.hostname.includes('supabase.co')) return;
  if (url.pathname.startsWith('/rest/') || url.pathname.startsWith('/auth/') || url.pathname.startsWith('/functions/')) return;

  // For navigation requests: ONLY cache public form routes, never admin
  if (event.request.mode === 'navigate') {
    if (!isPublicFormRoute(url)) return;
    // Public form: network-first with cache fallback
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Static assets: cache-first for immutable hashed assets, stale-while-revalidate for others
  if (
    url.pathname.match(/\.(js|css|woff2?|ttf|png|svg|ico|webp|avif|jpg|jpeg)$/) ||
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  ) {
    // Hashed assets (contain content hash in filename) → cache-first (immutable)
    const isHashed = url.pathname.match(/[-.][\da-f]{8,}\.(js|css)$/);
    
    if (isHashed) {
      event.respondWith(
        caches.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return response;
          });
        })
      );
    } else {
      // Non-hashed: stale-while-revalidate
      event.respondWith(
        caches.match(event.request).then((cached) => {
          const fetchPromise = fetch(event.request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return response;
          }).catch(() => cached);
          return cached || fetchPromise;
        })
      );
    }
    return;
  }
});

// Listen for messages to force-clear cache
self.addEventListener('message', (event) => {
  if (event.data === 'CLEAR_CACHE') {
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => caches.delete(k)))
    ).then(() => {
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => client.postMessage('CACHE_CLEARED'));
      });
    });
  }
});

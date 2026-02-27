const CACHE_NAME = 'formflow-v2';

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
  // Skip Supabase API calls
  if (url.hostname.includes('supabase.co')) return;
  if (url.pathname.startsWith('/rest/') || url.pathname.startsWith('/auth/')) return;

  // For navigation requests: ONLY cache public form routes, never admin
  if (event.request.mode === 'navigate') {
    if (!isPublicFormRoute(url)) {
      // Admin/dashboard: always network, no cache
      return;
    }
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

  // For static assets (JS/CSS/fonts/images): only cache if referrer is a public form
  // Since we can't easily check referrer for all assets, we cache shared assets
  // but with stale-while-revalidate so admin always gets fresh versions
  if (
    url.pathname.match(/\.(js|css|woff2?|ttf|png|svg|ico|webp|avif|jpg|jpeg)$/) ||
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  ) {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match(event.request))
    );
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

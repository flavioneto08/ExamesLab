// Cache version — injected at build time by the deploy workflow
// CACHE_VERSION_PLACEHOLDER
const CACHE_NAME = 'exameslab-%%BUILD_TIME%%';
const BASE_PATH = self.location.pathname.replace(/sw\.js$/, '');

const PRECACHE_ASSETS = [
  BASE_PATH,
  BASE_PATH + 'index.html',
  BASE_PATH + 'manifest.json',
  BASE_PATH + 'icon.svg',
];

// Install: pre-cache only shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

// Activate: delete ALL old caches so stale JS/CSS is never served
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Always go to network for Supabase API calls
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Network-first for HTML and JS/CSS (hashed filenames change each build)
  const isNavigate = event.request.mode === 'navigate';
  const isAsset = /\.(js|css|mjs)(\?.*)?$/.test(url.pathname);

  if (isNavigate || isAsset) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache a copy of fresh responses
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request)) // offline fallback
    );
    return;
  }

  // Cache-first for images/fonts/icons
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});

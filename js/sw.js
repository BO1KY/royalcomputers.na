/**
 * Royal Computers — Service Worker
 * Strategy: Cache-first for assets, network-first for HTML pages.
 * Provides an offline fallback page when the network is unavailable.
 */

const CACHE_NAME    = 'Royal Computers';
const OFFLINE_PAGE  = '/offline.html';

/* Assets to pre-cache on install */
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/products.html',
  '/About-us.html',
  '/Contact-us.html',
  '/offline.html',
  '/js/main.js',
  '/js/cart.js',
  '/js/quote.js',
  '/js/cart-ui.js',
  '/js/branches.js',
  '/js/products-data.js',
  '/js/pages-data.js',
  '/js/search-engine.js',
  '/js/search-dropdown.js',
  '/js/animations.js',
  '/css/search-dropdown.css',
  '/css/print-quote.css',
  '/css/animations.css',
  '/js/enhanced-ui.js',
  '/js/product-filters.js',
  '/js/product-comparison.js',
  '/js/live-chat.js',
  '/js/virtual-tryon.js',
  '/js/ecommerce-features.js',
  '/js/mobile-app.js',
];

/* ── Install: pre-cache shell ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(
        PRECACHE_ASSETS.map(url => new Request(url, { credentials: 'same-origin' }))
      ).catch(err => {
        console.warn('[SW] Pre-cache partially failed (some assets may be missing):', err);
      });
    }).then(() => self.skipWaiting())
  );
});

/* ── Activate: remove old caches ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ── Fetch: cache-first for images/js/css, network-first for HTML ── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  /* Skip non-GET, cross-origin non-asset requests, and browser-extension URLs */
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  /* HTML pages → network-first, fall back to offline page */
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone));
          return response;
        })
        .catch(() =>
          caches.match(request).then(cached => cached || caches.match(OFFLINE_PAGE))
        )
    );
    return;
  }

  /* Static assets (JS, CSS, images, fonts) → cache-first */
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request).then(response => {
        /* Only cache successful same-origin or CORS responses */
        if (!response || response.status !== 200 ||
            (response.type !== 'basic' && response.type !== 'cors')) {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then(c => c.put(request, clone));
        return response;
      }).catch(() => {
        /* For images, return a transparent placeholder instead of an error */
        if (request.destination === 'image') {
          return new Response(
            '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>',
            { headers: { 'Content-Type': 'image/svg+xml' } }
          );
        }
      });
    })
  );
});

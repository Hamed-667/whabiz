const CACHE_NAME = 'whabiz-v16';
const CORE_ASSETS = [
  '/',
  '/offline.html',
  '/landing.css',
  '/landing.js',
  '/boutique.css',
  '/boutique-cart.js',
  '/chat-widget.js',
  '/manifest.json',
  '/pwa-install.css',
  '/pwa-install.js',
  '/pwa-launch.css',
  '/pwa-launch.js',
  '/pwa-network.css',
  '/pwa-network.js',
  '/pwa-update.css',
  '/pwa-update.js',
  '/admin',
  '/admin/login',
  '/vendeur',
  '/vendeur/signup',
  '/vendeur/dashboard',
  '/vendeur/orders',
  '/vendeur/stats',
  '/vendeur/themes',
  '/vendeur/email',
  '/vendeur/recovery',
  '/vendeur/vendeur-ui.css',
  '/vendeur/pwa-vendeur-nav.css',
  '/vendeur/pwa-vendeur-nav.js',
  '/vendeur/auth-client.js',
  '/vendeur/dashboard-gallery.js',
  '/icons/icon-72.png',
  '/icons/icon-96.png',
  '/icons/icon-128.png',
  '/icons/icon-144.png',
  '/icons/icon-152.png',
  '/icons/icon-192.png',
  '/icons/icon-384.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
});

self.addEventListener('message', (event) => {
  if (event && event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => Promise.all(
      cacheNames.map((cacheName) => {
        if (cacheName !== CACHE_NAME) {
          return caches.delete(cacheName);
        }
        return null;
      })
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request, { ignoreSearch: true });

    try {
      const response = await fetch(event.request);
      if (response && response.ok) {
        cache.put(event.request, response.clone());
      }
      return response;
    } catch (error) {
      if (cached) return cached;
      if (event.request.mode === 'navigate') {
        const fallback = await cache.match('/offline.html');
        if (fallback) return fallback;
      }
      throw error;
    }
  })());
});

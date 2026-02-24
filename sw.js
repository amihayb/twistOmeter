const CACHE_NAME = 'twistometer-v1';

const PRECACHE_ASSETS = [
  './index.html',
  './StyleSheet.css',
  './app.js',
  './manifest.json',
  './assets/knob.css',
  './assets/knob.js',
  './assets/knob.svg',
  './assets/littleKnob.svg',
  './vendor/regression.min.js',
  './vendor/sweetalert2@11.js',
  './vendor/plotly-latest.min.js',
  './vendor/font-awesome.min.css',
  './fonts/fontawesome-webfont.svg',
  './images/RafLogo.svg',
  './images/logo-title.svg',
  './images/logo-icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Let external requests (analytics, CDNs) go straight to the network.
  if (url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const toCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, toCache));
        return response;
      });
    })
  );
});

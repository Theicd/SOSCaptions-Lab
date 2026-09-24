/* Lab shell SW — network-first for app code so ASR fixes are not stuck stale. */
const CACHE = 'sos-captions-lab-shell-v7';
const PRECACHE = [
  './',
  './index.html',
  './styles.css',
  './hf-env.js',
  './app.js',
  './asr-main.js',
  './translate-main.js',
  './captions-policy.js',
  './captions-timing.js',
  './audio-extract.js',
  './mock-captions.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE && k.startsWith('sos-captions-lab-shell'))
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.protocol === 'blob:' || url.protocol === 'data:') return;
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;
  const isAppShell =
    path.endsWith('.js') ||
    path.endsWith('.css') ||
    path.endsWith('.html') ||
    path.endsWith('/sw.js') ||
    path === '/' ||
    path.endsWith('/');

  // App code: always prefer network so warm-up/env fixes ship immediately.
  if (isAppShell) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
  }
});

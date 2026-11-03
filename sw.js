/* 离线缓存：网络优先，失败时回退缓存 */
const CACHE = 'supertable-v3.2.3';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './manifest.webmanifest',
  './icons/icon.svg',
  './js/app.js',
  './js/util.js',
  './js/schedule.js',
  './js/importers.js',
  './js/store.js',
  './js/ui.js',
  './js/install.js',
  './js/zf-html.js',
  './js/views/timetable.js',
  './js/views/detail.js',
  './js/views/editor.js',
  './js/views/agenda.js',
  './js/views/tools.js',
  './js/views/me.js',
  './js/views/import.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('./index.html'))),
  );
});

const CACHE_NAME = 'run-tracker-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  'https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css',
  'https://unpkg.com/leaflet@1.7.1/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.7.1/dist/leaflet.js',
  'https://cdn.jsdelivr.net/npm/chart.js@3.7.1/dist/chart.min.css',
  'https://cdn.jsdelivr.net/npm/chart.js@3.7.1/dist/chart.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
});
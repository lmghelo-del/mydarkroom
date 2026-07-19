const CACHE = 'aperture-v1';
const ASSETS = ['./','./index.html','./style.css','./app.js','./engine.js',
  './state.js','./raw.js','./widgets.js','./manifest.json','./icon-180.png','./icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return; // don't cache CDN (LibRaw)
  e.respondWith(caches.match(e.request).then(c => c || fetch(e.request)));
});

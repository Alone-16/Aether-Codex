const CACHE = 'ac-v7-static-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './offline.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Outfit:wght@300;400;500;600;700&family=Orbitron:wght@400;600;700;900&family=Rajdhani:wght@400;500;600;700&family=Bangers&family=Comic+Neue:wght@400;700&display=swap',
];

// Install — cache core assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
      .catch(err => console.error('[SW] Cache addAll failed:', err))
  );
});

// Activate — clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch — cache-first for static assets, network-first for Drive API / Worker API
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = e.request.url;

  // Network-first for APIs (Drive API, Workers, Gemini, MAL etc.)
  if (url.includes('googleapis.com') || url.includes('accounts.google.com') || url.includes('workers.dev') || url.includes('generativelanguage')) {
    e.respondWith(
      fetch(e.request).catch(() => {
        // If offline and accessing API, just return a fake offline response or let it fail
        return new Response(JSON.stringify({ error: 'offline' }), { headers: { 'Content-Type': 'application/json' } });
      })
    );
    return;
  }

  // Cache-first for static assets (local files and fonts)
  if (url.includes(self.location.origin) || url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
    e.respondWith(
      caches.match(e.request).then(cachedRes => {
        if (cachedRes) return cachedRes;
        return fetch(e.request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        }).catch(() => {
          // Offline fallback
          if (e.request.mode === 'navigate' || e.request.destination === 'document') {
            return caches.match('./offline.html');
          }
          return new Response('', { status: 404, statusText: 'Offline' });
        });
      })
    );
  }
});

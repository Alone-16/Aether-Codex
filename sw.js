const CACHE = 'ac-v5-cache';
const ASSETS = [
  './',
  './index.html',
  'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Outfit:wght@300;400;500;600;700&family=Orbitron:wght@400;600;700;900&family=Rajdhani:wght@400;500;600;700&family=Bangers&family=Comic+Neue:wght@400;700&display=swap',
  'https://accounts.google.com/gsi/client',
];

// Install — cache core assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS.filter(u => !u.includes('googleapis'))))
      .then(() => self.skipWaiting())
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

// Fetch — network first, fallback to cache
self.addEventListener('fetch', e => {
  // Skip non-GET, Drive API, and Gemini API calls (always need network)
  if (e.request.method !== 'GET') return;
  const url = e.request.url;
  if (url.includes('googleapis.com') || url.includes('workers.dev') || url.includes('generativelanguage')) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Cache successful responses for app shell
        if (res.ok && (url.includes(self.location.origin) || url.includes('fonts.g'))) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});

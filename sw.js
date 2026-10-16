// Service Worker Deprecated — Auto Self-Unregister (Cache v1.0.2)
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll())
      .then(clients => clients.forEach(client => client.navigate(client.url)))
  );
});

// Guard: Ensure loopback/local requests to 127.0.0.1 or localhost are never intercepted or cached
self.addEventListener('fetch', e => {
  try {
    const url = new URL(e.request.url);
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
      return; // Direct network passthrough
    }
  } catch (err) {}
});

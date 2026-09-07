// Migration from the previous shared NetworkFirst API cache. Asset caches stay.
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.delete('api-cache'));
});

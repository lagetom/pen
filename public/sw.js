// Cache the complete static app on first online install for offline navigation.
const CACHE = 'mini-paint-__BUILD_ID__';
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const response = await fetch('./', { cache: 'reload' });
    if (!response.ok) throw new Error('App shell unavailable');
    const html = await response.text();
    const assets = [...html.matchAll(/(?:src|href)="([^" ]+\.(?:js|css|svg))"/g)].map(match => new URL(match[1], self.registration.scope).href);
    await cache.addAll(assets);
    await cache.put(new URL('./', self.registration.scope), new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith('mini-paint-') && key !== CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (event.request.mode === 'navigate') {
      try { return await fetch(event.request); }
      catch { return (await cache.match(new URL('./', self.registration.scope))) || Response.error(); }
    }
    // Only same-origin static files are cached; ignore the dev preview server’s Vary: Origin.
    return (await cache.match(event.request, { ignoreVary: true })) || fetch(event.request);
  })());
});

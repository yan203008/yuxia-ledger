const CACHE = "yuxia-v18";
const ASSETS = ["./", "index.html", "styles.css?v=18", "app.js?v=18", "manifest.webmanifest?v=18", "icon.svg", "icons/apple-touch-icon.png?v=18", "icons/icon-192.png?v=18", "icons/icon-512.png?v=18", "icons/icon-maskable-512.png?v=18"];
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request, { cache: "no-store" }).then(response => {
    const copy = response.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request).then(cached => cached || caches.match("./"))));
});

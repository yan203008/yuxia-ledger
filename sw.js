const CACHE = "yuxia-v15";
const ASSETS = ["./", "index.html", "styles.css?v=15", "app.js?v=15", "manifest.webmanifest?v=15", "icon.svg", "icons/apple-touch-icon.png?v=15", "icons/icon-192.png?v=15", "icons/icon-512.png?v=15", "icons/icon-maskable-512.png?v=15"];
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

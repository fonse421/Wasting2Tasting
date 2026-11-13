/* ============================================================
   SERVICE WORKER — Wasting2Tasting
   Mantém o app principal e seus módulos disponíveis offline.
   Dados pessoais continuam armazenados localmente no navegador.
============================================================ */

const CACHE_VERSION = "wasting2tasting-v10";
const APP_SHELL = [
  "./",
  "./index.html",
  "./app.js",
  "./scanner.js",
  "./recipes.js",
  "./recipes-ui.js",
  "./boot.js",
  "./manifest.json"
];
const OPTIONAL_ASSETS = ["./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await cache.addAll(APP_SHELL);
    await Promise.all(OPTIONAL_ASSETS.map(async asset => {
      try { await cache.add(asset); } catch (error) { console.warn("Recurso opcional não encontrado:", asset); }
    }));
  })());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith("wasting2tasting-") && key !== CACHE_VERSION).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req).then(response => {
      if (response.ok) {
        const clone = response.clone();
        caches.open(CACHE_VERSION).then(cache => cache.put(req, clone));
      }
      return response;
    }).catch(() => caches.match(req).then(cached => cached || caches.match("./index.html")))
  );
});

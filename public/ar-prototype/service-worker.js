const CACHE_NAME = "localquester-webxr-v14";
const APP_FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./background-worker.js",
  "./manifest.webmanifest",
  "./assets/character.png",
  "./assets/ui/icon-close-left.svg",
  "./assets/ui/icon-close-right.svg",
  "./assets/ui/btn-gallery-thin.svg",
  "./assets/ui/btn-shutter-plain.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
  )));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  // 개발 중 수정한 파일이 바로 반영되도록 HTTP 캐시를 건너뛰고 서버에 다시 확인합니다.
  event.respondWith(fetch(event.request, { cache: "no-cache" }).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
    }
    return response;
  }).catch(() => caches.match(event.request)));
});

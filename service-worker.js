self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // API 요청은 캐싱하지 않음
  if (url.pathname.startsWith("/api/") || url.origin !== self.location.origin) {
    return;
  }

  // 정적 리소스만 캐싱 처리
  // event.respondWith(caches.open("v1").then(cache => cache.match(event.request).then(resp => resp || fetch(event.request))));
});

// 최소 서비스워커 — 설치형 PWA 조건 충족용(오프라인 캐싱은 하지 않고 통과).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  // 네트워크 통과 (설치 기준을 위해 fetch 핸들러만 둔다).
});

/*
 * Static app-shell cache only. IndexedDB is never cleared or modified here.
 * Increment CACHE_VERSION when shipping a new application build.
 */
const CACHE_VERSION = 'exam-life-shell-v2.1.1';
const APP_SHELL = [
  './', './index.html', './styles.css', './v190.css', './app.js', './db.js', './features.js', './memorial.js', './owls.js', './owls.css', './apple-touch-icon.png',
  './manifest.webmanifest', './icon-192.png', './icon-512.png',
  './modules/logic.js', './modules/focus-mode.js', './modules/grass.js', './modules/level.js', './modules/owl-growth.js',
  './modules/auto-backup.js', './modules/analytics.js', './modules/exam-countdown.js', './modules/daily-review.js',
  './assets/growth/stage-1.webp', './assets/growth/stage-2.webp', './assets/growth/stage-3.webp', './assets/growth/stage-4.webp', './assets/growth/stage-5.webp',
  ...Array.from({length:32},(_,i)=>`./assets/owls/owl-${String(i+1).padStart(2,'0')}.webp`)
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    // 파일 하나(예: 아이콘)가 없어도 설치 전체가 실패하지 않도록 개별 저장
    await Promise.all(APP_SHELL.map(async path => {
      try { await cache.add(new Request(new URL(path, self.registration.scope), { cache: 'reload' })); } catch (e) { /* skip missing file */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('exam-life-shell-') && key !== CACHE_VERSION).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        const cache = await caches.open(CACHE_VERSION);
        cache.put('./index.html', response.clone());
        return response;
      } catch {
        return (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const isCode = /\.(js|css|webmanifest)$/.test(url.pathname);
    if (isCode) {
      // 앱 코드는 네트워크 우선: 수정본이 항상 먼저 반영되고, 오프라인이면 캐시 사용
      try {
        const fresh = await fetch(request, { cache: 'no-cache' });
        if (fresh.ok) { (await caches.open(CACHE_VERSION)).put(request, fresh.clone()); }
        return fresh;
      } catch { return (await caches.match(request)) || Response.error(); }
    }
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        const cache = await caches.open(CACHE_VERSION);
        cache.put(request, response.clone());
      }
      return response;
    } catch {
      return Response.error();
    }
  })());
});

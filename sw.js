// Service Worker：讓 App 可以加到主畫面，網路不穩時也打得開。
//
// - 自己網站的檔案（HTML、JS、CSS、JSON、圖片）一律「網路優先」：有網路就拿最新版，
//   現場一直在改，隊友才不會看到舊畫面。網路太慢（超過 NETWORK_TIMEOUT_MS）或斷線才用快取。
// - CDN 套件和字型「快取優先」：網址有鎖版本號，內容不會變。
// - 地圖圖磚不快取，避免塞爆手機空間。
//
// 改了下面的 PRECACHE 清單就把 VERSION 加一號，舊快取會在新版啟用時清掉。

const VERSION = 'dsh-v15';
const NETWORK_TIMEOUT_MS = 4000;
const CDN_HOSTS = ['cdnjs.cloudflare.com', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

// 第一次打開就先存好的 App 外殼，之後斷線也能打開地圖首頁和三隻神獸的頁面
const PRECACHE = [
  './',
  'index.html',
  'manifest.json',
  'css/app.css',
  'css/report.css',
  'css/notices.css',
  'css/scan.css',
  'css/about.css',
  'css/board.css',
  'css/collection.css',
  'css/share.css',
  'css/me.css',
  'css/myevents.css',
  'css/regions.css',
  'css/goals.css',
  'css/feedback.css',
  'about.html',
  'js/map.js',
  'js/categories.js',
  'js/marker.js',
  'js/shared.js',
  'js/store.js',
  'js/tree.js',
  'js/report.js',
  'js/notices.js',
  'js/scan.js',
  'js/board.js',
  'js/collection.js',
  'js/share.js',
  'js/me.js',
  'js/myevents.js',
  'js/lookup.js',
  'js/regions.js',
  'js/goals.js',
  'js/feedback.js',
  'design-system/tokens.css',
  'design-system/components.css',
  'design-system/desktop.css',
  'design-system/assets/logos/logo-horizontal.svg',
  'data/trees.json',
  'data/mock/mock_beasts.json',
  'data/mock/mock_guardians.json',
  'data/mock/mock_notices.json',
  'data/mock/mock_reports.json',
  'data/mock/mock_events.json',
  'data/mock/mock_community.json',
  'data/regions/index.json',
  // 11/24 分享會會場：現場網路不穩也開得起來
  'data/regions/roosevelt.json',
  'data/mock/mock_beasts_regions.json',
  'data/mock/mock_guardians_regions.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(VERSION);
  // no-cache：每次都跟伺服器確認有沒有新版（GitHub Pages 預設會讓瀏覽器快取 10 分鐘）
  const fromNetwork = fetch(request, { cache: 'no-cache' }).then((res) => {
    if (res.ok) cache.put(request, res.clone());
    return res;
  });
  const cached = await cache.match(request, { ignoreSearch: true });
  if (!cached) return fromNetwork;
  // 有快取時，網路太慢或失敗就先用快取（網路那邊回來後仍會更新快取）
  const timeout = new Promise((resolve) => setTimeout(() => resolve(cached), NETWORK_TIMEOUT_MS));
  return Promise.race([fromNetwork.catch(() => cached), timeout]);
}

async function cacheFirst(request) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  // opaque（跨網域、沒有 CORS）的回應也存，字型檔常常是這種
  if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request));
  } else if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(request));
  }
  // 其他（地圖圖磚等）交給瀏覽器自己處理
});

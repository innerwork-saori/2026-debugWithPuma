// 替每隻神獸產生 t/樹號.html：只放 OG 標籤和跳轉，給 LINE、Threads、FB、Discord 抓連結預覽。
// 它們讀不到 #/tree/樹號 這種 hash 網址的內容，所以分享出去的網址要用這些頁面。
// 公示中的神獸另外產生 t/樹號-help.html（求援籤的預覽）。
// Cloudflare 會把 .html 網址轉址到沒有副檔名的網址，所以對外的網址（og:url、分享連結）都不帶 .html。
// 改了神獸或公告資料就重跑：node scripts/make_og_pages.cjs

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://2026-debugwithpuma.tree-god.workers.dev/';
// 有從設計稿截 OG 圖的神獸（scripts/capture_share_cards.cjs）；其他用 App 圖示。
// 圖上印著鬚鬚公的名字，所以用樹號對應：其他區域沿用同一張插圖的神獸不會拿到這張圖。
const OG_IMAGES = {
  JS0155103034: { guard: 'assets/share/og-xuxugong-guard.png', help: 'assets/share/og-xuxugong-help.png' },
};
const FALLBACK_IMAGE = 'design-system/assets/logos/app-icons/icon-512.png';

const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
// 預設地點的神獸，加上其他區域的神獸（例如 11/24 分享會會場）
const regionBeasts = read('data/mock/mock_beasts_regions.json').beasts;
const beasts = [...read('data/mock/mock_beasts.json').beasts, ...regionBeasts];
const { notices } = read('data/mock/mock_notices.json');
const trees = new Map(read('data/trees.json').trees.map((t) => [t.id, t]));
for (const id of new Set(regionBeasts.map((b) => b.region))) {
  const { fields, rows } = read(`data/regions/${id}.json`);
  for (const row of rows) {
    const t = Object.fromEntries(fields.map((f, i) => [f, row[i]]));
    trees.set(t.id, t);
  }
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const shortDate = (date) => date.slice(5).split('-').map(Number).join('/');

function page({ file, title, description, image, target }) {
  const big = image !== FALLBACK_IMAGE;
  const [w, h] = big ? [1200, 630] : [512, 512];
  return `<!doctype html>
<html lang="zh-Hant-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<!-- 由 scripts/make_og_pages.cjs 產生，不要手改 -->
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="大樹神獸">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${SITE}t/${file.replace(/\.html$/, '')}">
<meta property="og:image" content="${SITE}${image}">
<meta property="og:image:width" content="${w}">
<meta property="og:image:height" content="${h}">
<meta name="twitter:card" content="${big ? 'summary_large_image' : 'summary'}">
<meta http-equiv="refresh" content="0; url=${esc(target)}">
<link rel="icon" href="../${FALLBACK_IMAGE}">
</head>
<body>
<p><a href="${esc(target)}">打開大樹神獸，看看祂</a></p>
<script>location.replace(${JSON.stringify(target)});</script>
</body>
</html>
`;
}

fs.mkdirSync(path.join(ROOT, 't'), { recursive: true });
for (const b of beasts) {
  const tree = trees.get(b.treeId);
  const target = `../#/tree/${encodeURIComponent(b.treeId)}`;
  const where = `${tree.location}的${b.species}`;
  const total = b.guardians.local + b.guardians.remote;
  const og = OG_IMAGES[b.treeId];
  const out = [{
    file: `${b.treeId}.html`,
    title: `我在守護${b.name}｜大樹神獸`,
    description: `${where}「${b.name}」，已經有 ${total} 位鄰居守護祂。一起來當祂的鄰居！（守護人數為模擬資料）`,
    image: og?.guard ?? FALLBACK_IMAGE,
    target,
  }];
  const notice = notices.find((n) => n.treeId === b.treeId);
  if (notice) {
    out.push({
      file: `${b.treeId}-help.html`,
      title: `這棵樹需要你：${b.name}｜大樹神獸`,
      description: `${where}「${b.name}」被公告預計${notice.action}（${notice.reason}，模擬公告），${shortDate(notice.plannedDate)} 前可以表達意見。`,
      image: og?.help ?? FALLBACK_IMAGE,
      target,
    });
  }
  for (const p of out) {
    fs.writeFileSync(path.join(ROOT, 't', p.file), page(p));
    console.log('✓ t/' + p.file);
  }
}

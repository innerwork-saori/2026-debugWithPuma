// 把設計稿「大樹神獸關鍵畫面.html」第 13～16 頁的分享卡與 OG 圖截成圖檔，放到 assets/share/。
// 截圖前把設計稿的佔位文字換成 App 的資料（見下面 FIXES），求援籤的 QR code 換成真的。
//
// 用法（puppeteer-core、qrcode 不進 repo，裝在別的資料夾）：
//   mkdir -p ~/pptr && cd ~/pptr && npm i puppeteer-core qrcode
//   NODE_PATH=~/pptr/node_modules node scripts/capture_share_cards.cjs
// 用本機的 Chrome，不另外下載 Chromium；路徑不同時設 CHROME_PATH。

const path = require('path');
const puppeteer = require('puppeteer-core');
const QRCode = require('qrcode');

const ROOT = path.join(__dirname, '..');
const DESIGN = path.join(ROOT, 'docs/design/大樹神獸關鍵畫面.html');
const OUT = path.join(ROOT, 'assets/share');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const HELP_URL = 'https://2026-debugwithpuma.tree-god.workers.dev/t/JS0155103034-help';

// 設計稿的文字 → 換成的文字（整段文字完全相同才換）。
// 資料來源：data/trees.json（華山公園、依胸徑推估約 85 年）、data/mock/mock_notices.json（公共工程、11/3 預計移除）。
// 圖是固定的，倒數天數會過期，所以改寫成日期；「模擬公示」標明公告是模擬的。
const AGE = [['・榕樹・約 120 年', '・榕樹・約 85 年']];
const NOTICE = [['公示中・剩 12 天', '模擬公示・11/3 前']];
const CARDS = [
  {
    title: '分享卡 1080×1350｜我在守護祂',
    file: 'xuxugong-guard.png',
    fixes: [['Amy 在守護祂', '我在守護祂'], ['・榕樹・樹齡約 120 年・［所在街道］', '・榕樹・樹齡約 85 年・華山公園']],
  },
  {
    title: '分享卡 1080×1350｜這棵樹需要你',
    file: 'xuxugong-help.png',
    fixes: [...AGE, ...NOTICE, ['工程施工・預計移除', '公共工程・預計移除']],
    qr: true,
  },
  {
    title: 'OG 1200×630｜我在守護祂',
    file: 'og-xuxugong-guard.png',
    fixes: [...AGE, ['Ａmy', '我在'], ['在守護祂', '守護祂']],
  },
  {
    title: 'OG 1200×630｜這棵樹需要你',
    file: 'og-xuxugong-help.png',
    fixes: [...AGE, ...NOTICE, ['工程施工・預計移除・臺北市公園路燈工程管理處', '公共工程・預計移除・臺北市公園路燈工程管理處']],
  },
];

/** 在 iframe 裡執行：換文字、把「QR code」佔位框換成 QR code 圖。回傳沒找到的文字。 */
function patchCard(fixes, qrSvg) {
  const missing = new Set(fixes.map(([from]) => from));
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const text = node.textContent.trim();
    const fix = fixes.find(([from]) => from === text);
    if (fix) {
      node.textContent = node.textContent.replace(text, fix[1]);
      missing.delete(fix[0]);
    }
    if (qrSvg && text === 'QR code') {
      const box = node.parentElement;
      box.innerHTML = qrSvg;
      box.style.border = 'none';
      box.style.padding = '0';
      box.querySelector('svg').setAttribute('style', 'width:100%;height:100%;display:block');
    }
  }
  return [...missing];
}

(async () => {
  const qrSvg = await QRCode.toString(HELP_URL, { type: 'svg', margin: 0, color: { dark: '#26231f', light: '#0000' } });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1400, deviceScaleFactor: 1 });
  await page.goto(`file:///${DESIGN.replace(/\\/g, '/')}`, { waitUntil: 'networkidle0', timeout: 120000 });

  for (const card of CARDS) {
    const frameEl = await page.waitForSelector(`iframe[title="${card.title}"]`, { timeout: 60000 });
    await frameEl.scrollIntoView();
    // 等 iframe 裡的 bundle 解開、字型和圖片載入完
    const frame = await frameEl.contentFrame();
    await frame.waitForFunction(() => !document.getElementById('__bundler_placeholder') && document.fonts.status === 'loaded', { timeout: 60000 });
    await frame.evaluate(() => Promise.all([...document.images].map((img) => img.decode().catch(() => {}))));
    const missing = await frame.evaluate(patchCard, card.fixes, card.qr ? qrSvg : null);
    if (missing.length) throw new Error(`${card.file}：設計稿裡找不到這些文字，可能改版了：${missing.join('、')}`);
    await frame.evaluate(() => document.fonts.ready);
    await new Promise((r) => setTimeout(r, 500));
    await frameEl.screenshot({ path: path.join(OUT, card.file) });
    console.log('✓', card.file);
  }
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

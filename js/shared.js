// 地圖首頁和樹木頁共用的小工具：讀資料、跳脫文字、樹況標籤。

// 模擬資料的狀態值 → 標記與標籤用的狀態
export const STATUS = { normal: 'ok', watch: 'watch', notice: 'notice', keep: 'keep', transplant: 'move' };
const STATUS_ICON = {
  ok: '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2 7 L6 11 L12 3" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  watch: '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M7 2 V8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="7" cy="11.5" r="1.4" fill="currentColor"/></svg>',
  notice: '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2 5 H5 L10 2 V12 L5 9 H2 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  keep: '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M7 2 L11 7 L7 12 L3 7 Z" fill="currentColor"/></svg>',
  move: '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2 7 H11 M8 4 L11 7 L8 10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

// 電腦版的條件，和 design-system/desktop.css 一樣：寬度 1024px 以上、滑鼠操作
export const DESKTOP = matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine)');

// Demo 用的「你的位置」：總部（中正區北平東路 30-1 號）附近。地圖和共同目標頁的「附近」都從這裡算。
export const HOME = [25.0459, 121.5243];

export const esc = (s) => dshEscape(s ?? '');

export const statusTag = (status) =>
  `<span class="dsh-tag dsh-tag--${status}">${STATUS_ICON[status]}${DSH_MARKER.labels[status]}</span>`;

const ICON_BACK = '<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><path d="M14 4 L7 11 L14 18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** 每個畫面頂端的標題列。路由打開畫面後會把焦點放在返回鈕（.tp-back） */
export const pageBarHtml = (title, back = '#/') => `
  <header class="tp-bar">
    <a class="tp-back" href="${back}" aria-label="返回">${ICON_BACK}</a>
    <h1 class="tp-bar__title">${esc(title)}</h1>
  </header>`;

// 加到主畫面的 PWA 每次重新打開，手機都會再問一次相機權限。在開相機的畫面放一行小提示，按「知道了」就不再出現
const CAM_TIP_KEY = 'camTipDismissed';
const STANDALONE = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

export function camTipHtml() {
  if (!STANDALONE) return '';
  try {
    if (localStorage.getItem(CAM_TIP_KEY)) return '';
  } catch { /* 讀不到就照樣顯示 */ }
  return `
    <p class="tp-camtip">
      <span>每次重新打開 App，手機都會再問一次能不能用相機，按「允許」就可以了。</span>
      <button type="button" class="tp-camtip__ok" data-camtip-ok>知道了</button>
    </p>`;
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-camtip-ok]');
  if (!btn) return;
  try { localStorage.setItem(CAM_TIP_KEY, '1'); } catch { /* 存不了就只關這一次 */ }
  btn.closest('.tp-camtip').remove();
});

export async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`讀不到 ${path}`);
  return res.json();
}

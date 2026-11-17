// 切換區域（P1 設計稿「切換區域」，US-12）。
// 除了預設的總部周邊，再收錄市民留言最常點名的三個地點（scripts/build_regions.py 產生 data/regions/），
// 以及 11/24 分享會的會場周邊（羅斯福路三段，這一區有自己的神獸：data/mock/mock_beasts_regions.json）。
// 區域的樹第一次切過去才下載，地圖一次只畫一區。
import { esc, loadJson, STATUS } from './shared.js';
import { categoryOf } from './categories.js';

// 預設地點：data/trees.json 的範圍（總部周邊）
export const HOME_REGION = {
  id: 'home',
  name: '北平東路周邊',
  short: '北平東路',
  district: '中正區',
  note: '預設地點',
};

let regionsPromise;
/** 預設地點排第一，再接 data/regions/index.json 的三個區域 */
export function loadRegions() {
  regionsPromise ??= loadJson('data/regions/index.json')
    .then(({ regions }) => [HOME_REGION, ...regions.map((r) => ({ ...r, short: r.name.replace(/[一二三四五]段$/, '') }))]);
  return regionsPromise;
}

let beastsPromise;
/** 區域裡的神獸（模擬資料）：樹號 → 神獸。讀不到就當作沒有神獸，樹照樣畫得出來 */
export function loadRegionBeasts() {
  if (!beastsPromise) {
    const p = loadJson('data/mock/mock_beasts_regions.json')
      .then(({ beasts }) => new Map(beasts.map((b) => [b.treeId, b])));
    p.catch(() => { beastsPromise = undefined; });
    beastsPromise = p.catch(() => new Map());
  }
  return beastsPromise;
}

/** 幫區域裡的樹掛上神獸、狀態、守護人數（lookup.js 用樹號直接打開樹木頁時也用） */
export function withBeast(tree, beast) {
  if (!beast) return tree;
  // outside 拿掉：神獸有守護人數和公告，樹木頁不用顯示「還沒有鄰居守護祂」
  return { ...tree, beast, status: STATUS[beast.status] ?? 'ok', guardians: beast.guardians, outside: false };
}

let guardiansPromise;
const treesById = new Map();

/** 區域的樹，轉成跟 map.js loadTrees() 一樣的樹物件 */
export function loadRegionTrees(id) {
  if (!treesById.has(id)) {
    guardiansPromise ??= loadJson('data/mock/mock_guardians_regions.json');
    const p = Promise.all([loadJson(`data/regions/${id}.json`), guardiansPromise, loadRegionBeasts()]).then(([{ fields, rows }, { guardians }, beasts]) =>
      rows.map((row) => {
        const t = Object.fromEntries(fields.map((f, i) => [f, row[i]]));
        return withBeast({
          ...t,
          managerEstimated: '臺北市公園路燈工程管理處',
          beast: undefined,
          status: 'ok',
          category: categoryOf(t.species),
          guardians: guardians[t.id] ?? { local: 0, remote: 0 },
          region: id,
        }, beasts.get(t.id));
      }));
    // 讀失敗（例如斷線）不要記住，下次再試
    p.catch(() => {
      treesById.delete(id);
      guardiansPromise = undefined;
    });
    treesById.set(id, p);
  }
  return treesById.get(id);
}

/**
 * 切換區域的底部選單。button 按了打開，選了某一區呼叫 onPick(region)；
 * onPick 回傳 Promise，讀取中那一列顯示「讀取中」。Esc、點背景或「先不要」關閉，焦點回到按鈕。
 * 回傳 { choose(id), regions }，choose 不打開選單直接切換（例如按定位鈕、網址帶 ?region=）。
 */
export async function setupRegionSheet(button, sheet, onPick, homeCount) {
  // 預設地點的棵數由地圖傳進來（data/trees.json 有幾棵），其他區域在 index.json 裡
  const regions = (await loadRegions()).map((r) => (r.id === HOME_REGION.id ? { ...r, count: homeCount } : r));
  let current = HOME_REGION.id;

  // 左邊的說明：行政區、留言數（有才寫）、一句介紹。右邊統一寫這一區有幾棵樹
  const meta = (r) => [r.district, r.comments ? `${r.comments} 則留言` : null, r.note].filter(Boolean).join('・');
  const count = (r) => (r.count ? `${r.count.toLocaleString('zh-TW')} 棵樹` : '');

  function render() {
    sheet.innerHTML = `
      <div class="rg-sheet__panel" role="dialog" aria-modal="true" aria-labelledby="rg-title">
        <span class="rg-grab" aria-hidden="true"></span>
        <h2 class="rg-title" id="rg-title">看看大家關心的地方</h2>
        <p class="rg-sub">「市長，你給我聽好了」種樹相關留言裡，最常被提到的地點</p>
        <ul class="rg-list">
          ${regions.map((r) => `
            <li><button type="button" class="rg-area" data-id="${esc(r.id)}"${r.id === current ? ' aria-current="true"' : ''}>
              <span class="rg-area__name">${esc(r.name)}</span>
              <span class="rg-area__meta">${esc(meta(r))}</span>
              <span class="rg-area__count">${esc(count(r))}</span>
            </button></li>`).join('')}
        </ul>
        <p class="rg-note">留言數來自種樹痛點儀表板；樹木位置是臺北市行道樹開放資料，守護人數是模擬的。</p>
        <button type="button" class="dsh-btn dsh-btn--text dsh-btn--block" data-close>先不要</button>
      </div>`;
  }

  function label() {
    const r = regions.find((x) => x.id === current);
    button.querySelector('.rg-btn__name').textContent = r.short;
    button.setAttribute('aria-label', `切換區域，現在是${r.name}`);
  }

  function open() {
    render();
    sheet.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    (sheet.querySelector('[aria-current]') ?? sheet.querySelector('.rg-area')).focus();
  }

  function close() {
    if (sheet.hidden) return;
    sheet.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    button.focus({ preventScroll: true });
  }

  async function choose(id) {
    const r = regions.find((x) => x.id === id);
    // 網址帶了不認得的區域（?region=）就不動
    if (!r) return;
    await onPick(r);
    current = id;
    label();
  }

  button.addEventListener('click', open);
  sheet.addEventListener('click', async (e) => {
    if (e.target === sheet || e.target.closest('[data-close]')) return close();
    const row = e.target.closest('.rg-area');
    if (!row || row.disabled) return;
    row.disabled = true;
    row.querySelector('.rg-area__count').textContent = '讀取中…';
    try {
      await choose(row.dataset.id);
      close();
    } catch (err) {
      console.error(err);
      row.disabled = false;
      row.querySelector('.rg-area__count').textContent = '讀不到，再試一次';
    }
  });
  sheet.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  label();
  return { choose, regions };
}

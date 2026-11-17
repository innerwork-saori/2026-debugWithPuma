// 樹木頁／神獸頁（關鍵畫面 ②）：#/tree/樹號
// 樹號、樹種、位置是真實開放資料；神獸、故事、樹況、公示、回報、守護人數是模擬資料。
import { esc, statusTag, loadJson, pageBarHtml } from './shared.js';
import { getGuard, setGuard, guardiansOf, totalOf, getMyReports, vitalityOf, markSeen } from './store.js';
import { boardTeaserHtml } from './board.js';

const LANTERN_MAX = 30;
const REPORTS_SHOWN = 3;
// 推估樹齡到這裡就用稀有款神獸卡、蓋「老樹」印章（依真實身分，不是隨機）
export const OLD_TREE_AGE = 50;

const STATUS_NOTE = {
  ok: '狀況穩定，有鄰居看著祂。',
  watch: '有鄰居回報病徵，需要多關心。',
  notice: '市府公告要處理這棵樹，公示期間可以表達意見。',
  keep: '審議後決定原地保留。',
  move: '已移植到新地點，持續追蹤存活。',
};

// 地圖範圍外的樹（見 lookup.js）：查得到開放資料，或只有樹號
const OUTSIDE_NOTE = {
  found: '還沒有鄰居守護祂。成為第一位守護祂的人。',
  unknown: '開放資料裡還查不到這個樹號，樹種和位置先空著。你一樣可以守護祂、回報祂的樣子。',
};

// 公示與回報紀錄第一次打開樹木頁時才載入
let extras;
function loadExtras() {
  extras ??= Promise.all([
    loadJson('data/mock/mock_notices.json'),
    loadJson('data/mock/mock_reports.json'),
  ]).then(([n, r]) => ({ notices: n.notices, reports: r.reports, checkItems: r.meta.checkItems }));
  return extras;
}

export function daysUntil(date) {
  const ms = new Date(`${date}T00:00:00+08:00`) - Date.now();
  return Math.max(0, Math.ceil(ms / 86400000));
}

export const shortDate = (date) => date.slice(5).replace('-', '/');
const orPending = (v, unit = '') => (v == null ? '［待補］' : `${v}${unit}`);

export function heroHtml(tree) {
  const b = tree.beast;
  const age = tree.ageEstimated ? `約 ${tree.ageEstimated} 年（推估）` : null;
  if (!b) {
    return `
      <article class="dsh-beast tp-hero tp-hero--tree">
        <div class="dsh-beast__art dsh-pattern--leaves"><img src="design-system/assets/icons/tree.svg" alt=""></div>
        <div class="dsh-beast__body">
          <h2 class="dsh-plaque dsh-beast__name">${esc(tree.species)}</h2>
          <p class="dsh-beast__meta">${esc([age, tree.location].filter(Boolean).join('・'))}</p>
        </div>
      </article>`;
  }
  const old = tree.ageEstimated >= OLD_TREE_AGE;
  const mood = tree.status === 'watch' || b.vitality < 40 ? 'sad' : 'healthy';
  return `
    <article class="dsh-beast tp-hero${old ? ' dsh-beast--rare' : ''}">
      <div class="dsh-beast__art ${old ? 'dsh-pattern--cloud' : 'dsh-pattern--leaves'}">
        <img src="design-system/assets/character/beasts/${esc(b.slug)}/${mood}-cutout.webp" alt="${esc(b.name)}的插圖">
        ${old ? '<span class="dsh-beast__seal">老樹</span>' : ''}
      </div>
      <div class="dsh-beast__body">
        <h2 class="dsh-plaque dsh-beast__name">${esc(b.name)}</h2>
        <p class="dsh-beast__meta">${esc([tree.species, age, tree.location].filter(Boolean).join('・'))}</p>
        <p class="tp-quote">「${esc(b.catchphrase)}」</p>
      </div>
    </article>`;
}

function noticeBannerHtml(notice) {
  const days = daysUntil(notice.plannedDate);
  return `
    <a class="dsh-notice tp-notice" href="#tp-official" data-scroll="tp-official" role="status">
      <img src="design-system/assets/icons/notice.svg" alt="" width="32" height="32">
      <div>
        <p class="dsh-notice__title">公示中：預計${esc(notice.action)}</p>
        <p class="dsh-notice__body">${shortDate(notice.plannedDate)} 前，你可以看公告、表達意見。</p>
      </div>
      <div class="dsh-notice__days">${days}<small>天</small></div>
    </a>`;
}

function officialHtml(notice) {
  const h = notice.hearing;
  return `
    <article class="dsh-official" id="tp-official">
      <div class="dsh-official__band"></div>
      <div class="dsh-official__head">
        <h3 class="dsh-official__title">異動公告</h3>
        ${statusTag('notice')}
      </div>
      <p class="dsh-official__no">市府公告・${esc(notice.id)}（模擬）</p>
      <dl class="dsh-official__list">
        <dt>工程</dt><dd>${esc(notice.title)}</dd>
        <dt>處理方式</dt><dd>${esc(notice.action)}</dd>
        <dt>理由</dt><dd>${esc(notice.reason)}：${esc(notice.detail)}</dd>
        <dt>管理單位</dt><dd>${esc(notice.manager)}</dd>
        <dt>公告日期</dt><dd>${esc(notice.postedDate)}</dd>
        <dt>預定日期</dt><dd>${esc(notice.plannedDate)}</dd>
        <dt>說明會</dt><dd>${h ? esc(`${h.date} ${h.time}・${h.place}`) : '［待補］'}</dd>
      </dl>
      <div class="dsh-official__foot">
        <a class="dsh-btn dsh-btn--secondary dsh-btn--block sh-entry" href="#/share/${encodeURIComponent(notice.treeId)}/help">分享求援籤，請朋友一起關心</a>
        <p class="tp-small">這是模擬公告，沒有原始公告連結。</p>
      </div>
    </article>`;
}

export function vitalHtml(tree, reportCount) {
  const v = vitalityOf(tree);
  if (v == null) {
    return `
      <section class="dsh-vital tp-box">
        <div class="dsh-vital__head"><span class="dsh-vital__label">元氣</span><span class="dsh-vital__value"><small>［資料不足］</small></span></div>
        <p class="dsh-vital__hint">還沒有鄰居回報過這棵樹。在地守護後，你的回報會讓元氣值出現。</p>
      </section>`;
  }
  const word = v >= 70 ? '茂盛' : v >= 40 ? '普通' : '虛弱';
  const on = Math.round(v / 10);
  const segs = Array.from({ length: 10 }, (_, i) => `<span class="dsh-vital__seg${i < on ? ' is-on' : ''}"></span>`).join('');
  return `
    <section class="dsh-vital tp-box${v < 40 ? ' dsh-vital--weak' : ''}">
      <div class="dsh-vital__head"><span class="dsh-vital__label">元氣</span><span class="dsh-vital__value">${v}<small>${word}</small></span></div>
      <div class="dsh-vital__track" role="meter" aria-label="元氣" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${v}" aria-valuetext="${v}，${word}">${segs}</div>
      ${reportCount == null ? '' : `<p class="dsh-vital__hint">依最近 ${reportCount} 筆鄰居回報計算（模擬）。</p>`}
    </section>`;
}

// 燈籠造型：圓燈身、上下燈帽、燈骨、垂穗。顏色由 CSS 變數決定（點亮／未點亮）
export const LANTERN_SHAPE = `
  <svg width="0" height="0" class="tp-defs" aria-hidden="true"><symbol id="tp-lantern-shape" viewBox="0 0 24 36">
    <rect x="8" y="3" width="8" height="4" rx="1" style="fill: var(--outline)"/>
    <ellipse cx="12" cy="17" rx="10" ry="10" style="fill: var(--lantern-body); stroke: var(--outline)" stroke-width="2"/>
    <path d="M12 7 V27 M7 8.5 Q4 17 7 25.5 M17 8.5 Q20 17 17 25.5" fill="none" style="stroke: var(--outline)" stroke-width="1.4"/>
    <rect x="8" y="26" width="8" height="4" rx="1" style="fill: var(--outline)"/>
    <path d="M12 30 V35" style="stroke: var(--lantern-tassel)" stroke-width="2.4" stroke-linecap="round"/>
  </symbol></svg>`;

function lanternsHtml(g, justGuarded) {
  const total = totalOf(g);
  const lit = Math.min(total, LANTERN_MAX);
  const lamps = Array.from({ length: LANTERN_MAX }, (_, i) => {
    const cls = i < lit ? 'tp-lantern' : 'tp-lantern tp-lantern--off';
    // 剛按下守護時，新點亮的那盞（人數超過 30 時是最後一盞）亮起來
    const isNew = justGuarded && i === lit - 1;
    return `<svg class="${cls}${isNew ? ' is-new' : ''}" viewBox="0 0 24 36"><use href="#tp-lantern-shape"/></svg>`;
  }).join('');
  const who = `在地守護 ${g.local} 人・遠端關注 ${g.remote} 人`;
  const lead = justGuarded
    ? `你點亮了第 ${total} 盞燈。`
    : total > LANTERN_MAX
      ? `畫面點亮 ${LANTERN_MAX} 盞，實際有 ${total} 位鄰居守護。`
      : '一盞燈是一位鄰居。';
  const note = lead + who;
  return `
    <section class="dsh-lanterns tp-lanterns">
      ${LANTERN_SHAPE}
      <div class="dsh-lanterns__head">
        <span class="dsh-lanterns__label">燈海・守護祂的鄰居</span>
        <span class="dsh-lanterns__num${justGuarded ? ' is-bump' : ''}">${total}<small>盞</small></span>
      </div>
      <div class="dsh-lanterns__grid" aria-hidden="true">${lamps}</div>
      <p class="dsh-lanterns__note">${note}</p>
      <a class="tp-lanterns__goals" href="#/goals">看我們這區的共同目標 →</a>
    </section>`;
}

function storyHtml(b) {
  if (!b) return '';
  return `
    <section class="tp-box">
      <h3 class="tp-h">祂的故事</h3>
      <p class="tp-p">${esc(b.story)}</p>
      <p class="tp-p">${esc(b.personality)}</p>
      <p class="tp-fact"><b>你知道嗎？</b>${esc(b.funFact)}</p>
    </section>`;
}

function reportsHtml(reports, checkItems) {
  // 預設只顯示最新幾筆，其餘按「看全部」才展開，樹木頁才不會被回報洗版
  const items = reports.map((r, i) => {
    const seen = Object.entries(r.checks).filter(([, v]) => v).map(([k]) => checkItems[k]);
    return `
      <li class="tp-report"${i >= REPORTS_SHOWN ? ' hidden' : ''}>
        <div class="tp-report__head"><b>${esc(r.nickname)}</b><time datetime="${esc(r.date)}">${shortDate(r.date)}</time></div>
        ${r.photo ? `<img class="tp-report__photo" src="${esc(r.photo)}" alt="回報照片">` : ''}
        ${r.note ? `<p class="tp-p">${esc(r.note)}</p>` : ''}
        ${seen.length ? `<p class="tp-report__seen">看到：${esc(seen.join('、'))}</p>` : ''}
      </li>`;
  }).join('');
  const more = reports.length > REPORTS_SHOWN
    ? `<button type="button" class="dsh-btn dsh-btn--text dsh-btn--block" data-more-reports aria-expanded="false">看全部 ${reports.length} 筆回報</button>`
    : '';
  return `
    <section class="tp-box">
      <h3 class="tp-h">最近的回報${reports.length ? `<small class="tp-h__count">・${reports.length} 筆</small>` : ''}</h3>
      ${items ? `<ul class="tp-reports">${items}</ul>${more}` : '<p class="tp-p tp-muted">還沒有人回報。成為在地守護者，第一個記錄祂的樣子。</p>'}
    </section>`;
}

function factsHtml(tree) {
  return `
    <section class="tp-box">
      <h3 class="tp-h">樹的資料</h3>
      <dl class="tp-facts">
        <dt>樹號</dt><dd>${esc(tree.id)}</dd>
        <dt>樹種</dt><dd>${esc(tree.species)}</dd>
        <dt>地點</dt><dd>${esc(`${tree.district} ${tree.location}`)}</dd>
        <dt>胸徑</dt><dd>${esc(orPending(tree.dbh, ' 公分'))}</dd>
        <dt>樹高</dt><dd>${esc(orPending(tree.height, ' 公尺'))}</dd>
        <dt>樹齡</dt><dd>${esc(tree.ageEstimated ? `約 ${tree.ageEstimated} 年（依胸徑推估）` : '［待補］')}</dd>
        <dt>管理單位</dt><dd>${esc(tree.managerEstimated ? `${tree.managerEstimated}（推定）` : '［待補］')}</dd>
        <dt>調查日期</dt><dd>${esc(orPending(tree.surveyDate))}</dd>
      </dl>
      <p class="tp-small">樹號、樹種、位置、胸徑、樹高：臺北市行道樹及公園樹木分布圖（真實開放資料）。神獸、故事、樹況、公告、回報與守護人數：模擬資料。</p>
    </section>`;
}

function actionsHtml(tree) {
  const mine = getGuard(tree.id);
  const report = `<a class="dsh-btn dsh-btn--secondary dsh-btn--block" href="#/report/${encodeURIComponent(tree.id)}"><img src="design-system/assets/icons/report.svg" alt="" width="28" height="28">回報樹況</a>`;
  // 守護之後才出現分享：神獸有分享卡，一般樹分享網址
  const share = `<a class="dsh-btn dsh-btn--text dsh-btn--block sh-entry" href="#/share/${encodeURIComponent(tree.id)}"><img src="design-system/assets/icons/share.svg" alt="" width="24" height="24">分享祂，找更多鄰居</a>`;
  if (mine === 'local') {
    return `${report}${share}<p class="tp-actions__hint">你是在地守護者。經過時拍張照、看看祂的狀況。</p>`;
  }
  if (mine === 'remote') {
    return `
      <button type="button" class="dsh-btn dsh-btn--secondary dsh-btn--block" disabled>已關注</button>
      ${share}
      <p class="tp-actions__hint">有異動時會通知你。人在樹旁邊時，可以<button type="button" class="tp-link" data-guard="local">改成在地守護</button>來回報樹況。</p>`;
  }
  return `
    <button type="button" class="dsh-btn dsh-btn--primary dsh-btn--block" data-open-sheet>守護祂</button>
    <p class="tp-actions__hint">守護後，這棵樹有異動時你會第一個知道。</p>`;
}

const sheetHtml = (name) => `
  <div class="tp-sheet" hidden>
    <div class="tp-sheet__panel" role="dialog" aria-modal="true" aria-labelledby="tp-sheet-title">
      <h3 class="tp-h" id="tp-sheet-title">你想怎麼守護${esc(name)}？</h3>
      <button type="button" class="tp-choice" data-guard="local">
        <b>在地守護</b>
        <span>我住附近或常經過，可以到現場拍照、回報樹況。</span>
      </button>
      <button type="button" class="tp-choice" data-guard="remote">
        <b>遠端關注</b>
        <span>我不在附近，想收到異動通知、幫忙分享。</span>
      </button>
      <button type="button" class="dsh-btn dsh-btn--text dsh-btn--block" data-close-sheet>先不要</button>
      <p class="tp-small">守護人數只顯示數字，不會公開你是誰、住在哪裡。</p>
    </div>
  </div>`;

/** 把一棵樹畫進樹木頁。justGuarded：剛按下守護，播一次點燈動畫 */
export async function renderTreePage(el, tree, { justGuarded = false } = {}) {
  // 打開樹的檔案就收進樹種圖鑑（collection.js）
  markSeen(tree);
  const [{ notices, reports, checkItems }, boardTeaser] = await Promise.all([loadExtras(), boardTeaserHtml(tree)]);
  const notice = tree.status === 'notice' ? notices.find((n) => n.treeId === tree.id) : null;
  // 自己的回報排在同一天的模擬回報前面（sort 是穩定排序）
  const treeReports = [...getMyReports(tree.id), ...reports.filter((r) => r.treeId === tree.id)]
    .sort((a, b) => b.date.localeCompare(a.date));
  const name = tree.beast?.name ?? tree.species;
  const sameTree = el.dataset.treeId === tree.id;
  const scrollTop = sameTree ? el.querySelector('.tp-scroll')?.scrollTop ?? 0 : 0;

  el.dataset.treeId = tree.id;
  el.innerHTML = `
    ${pageBarHtml('樹的檔案')}
    <div class="tp-scroll">
      <!-- 電腦版左右兩欄；手機版兩欄攤平成一欄，公示通知條排最上面（見 app.css） -->
      <div class="tp-cols dsh-cols">
        <div class="tp-aside dsh-cols__aside">
          ${heroHtml(tree)}
          ${tree.outside
            ? `<div class="tp-status"><span>${tree.lat == null ? OUTSIDE_NOTE.unknown : OUTSIDE_NOTE.found}</span></div>`
            : `<div class="tp-status">${statusTag(tree.status)}<span>${STATUS_NOTE[tree.status]}</span></div>`}
          ${vitalHtml(tree, treeReports.length)}
          ${lanternsHtml(guardiansOf(tree), justGuarded)}
        </div>
        <div class="tp-main dsh-cols__main">
          ${notice ? noticeBannerHtml(notice) : ''}
          ${notice ? officialHtml(notice) : ''}
          ${storyHtml(tree.beast)}
          ${boardTeaser}
          ${reportsHtml(treeReports, checkItems)}
          ${factsHtml(tree)}
        </div>
      </div>
    </div>
    <div class="tp-actions">${actionsHtml(tree)}</div>
    ${sheetHtml(name)}`;
  el.querySelector('.tp-scroll').scrollTop = scrollTop;
  // 剛守護時捲到燈海，才看得到新點亮的那盞燈
  if (justGuarded) el.querySelector('.tp-lanterns').scrollIntoView({ block: 'center' });

  const sheet = el.querySelector('.tp-sheet');
  const opener = el.querySelector('[data-open-sheet]');
  opener?.addEventListener('click', () => {
    sheet.hidden = false;
    sheet.querySelector('.tp-choice').focus();
  });
  const closeSheet = () => {
    sheet.hidden = true;
    opener?.focus();
  };
  el.querySelector('[data-close-sheet]').addEventListener('click', closeSheet);
  sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });
  sheet.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

  el.querySelectorAll('[data-guard]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const wasGuarded = Boolean(getGuard(tree.id));
      setGuard(tree.id, btn.dataset.guard);
      // 從遠端改成在地不算新的一盞燈，只有第一次守護才點燈
      renderTreePage(el, tree, { justGuarded: !wasGuarded });
    });
  });

  el.querySelector('[data-more-reports]')?.addEventListener('click', (e) => {
    const btn = e.currentTarget;
    const open = btn.getAttribute('aria-expanded') !== 'true';
    el.querySelectorAll('.tp-report').forEach((li, i) => { li.hidden = !open && i >= REPORTS_SHOWN; });
    btn.setAttribute('aria-expanded', String(open));
    btn.textContent = open ? '收起' : `看全部 ${treeReports.length} 筆回報`;
  });

  // 公示通知條：捲到下方的異動公告卡（不改網址，避免觸發路由）
  el.querySelector('[data-scroll]')?.addEventListener('click', (e) => {
    e.preventDefault();
    el.querySelector(`#${e.currentTarget.dataset.scroll}`).scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

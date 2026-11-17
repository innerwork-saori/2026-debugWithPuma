// 社區佈告欄（關鍵畫面 ⑧⑨⑩，PRD F6）：#/board/樹號
// 樹下的市民活動卡＋在樹下發起活動。預設活動是模擬資料；自己發起的活動和「我想參加」存在這台裝置（store.js）。
// 活動卡是綠色系的「市民活動」，和官方異動公告（白底、橘黑斜紋）一眼分得出來。
import { esc, loadJson, pageBarHtml } from './shared.js';
import { getGuard, setGuard, getMyEvents, getAllMyEvents, addEvent, isJoined, setJoined } from './store.js';

const WEEK = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
const TITLE_MAX = 30;
const DESC_MAX = 100;
const NICK_MAX = 12;

// 模擬活動第一次用到時才載入
let mock;
function loadEvents() {
  mock ??= loadJson('data/mock/mock_events.json').then((d) => d.events);
  return mock;
}

export const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
const thisMonth = () => today().slice(0, 7);

/** 這棵樹的活動：模擬＋自己發起的，依日期、開始時間由近到遠 */
async function eventsOf(tree) {
  const all = [...(await loadEvents()).filter((e) => e.treeId === tree.id), ...getMyEvents(tree.id)];
  return all.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
}

/** 這棵樹接下來的活動（今天以後），圖鑑卡上的「新活動」用 */
export async function upcomingEventsOf(tree) {
  return (await eventsOf(tree)).filter((e) => e.date >= today());
}

/** 按過「我想參加」的活動（含自己發起的），依日期、開始時間由近到遠。「我參加的活動」頁用 */
export async function joinedEvents() {
  const all = [...(await loadEvents()), ...getAllMyEvents()].filter((e) => isJoined(e.id));
  return all.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
}

/** 「我的」頁：參加的活動數，和其中已經過了日期的數量 */
export async function joinedEventCounts() {
  const joined = await joinedEvents();
  return { joined: joined.length, ended: joined.filter((e) => e.date < today()).length };
}

/** 想參加人數＝模擬的人數＋自己按的那一下 */
const interestedOf = (e) => e.interested + (isJoined(e.id) ? 1 : 0);

function summaryOf(events) {
  const month = events.filter((e) => e.date.startsWith(thisMonth()));
  const people = month.reduce((n, e) => n + interestedOf(e), 0);
  return `本月 ${month.length} 場活動・${people} 人想參加`;
}

/** 樹木頁上的入口：最近一場活動＋看佈告欄 */
export async function boardTeaserHtml(tree) {
  const events = await eventsOf(tree);
  const next = events.find((e) => e.date >= today());
  const href = `#/board/${encodeURIComponent(tree.id)}`;
  const preview = next
    ? `<p class="tp-p"><b>下一場：</b>${esc(`${next.date.slice(5).replace('-', '/')}（${weekOf(next.date).slice(1)}）${next.title}`)}</p>`
    : '<p class="tp-p tp-muted">樹下還沒有活動。在地守護者可以發起第一場。</p>';
  return `
    <section class="tp-box board-teaser">
      <h3 class="tp-h">社區佈告欄<small class="tp-h__count">・${esc(summaryOf(events))}</small></h3>
      ${preview}
      <a class="dsh-btn dsh-btn--secondary dsh-btn--block" href="${href}">看社區佈告欄</a>
    </section>`;
}

export function weekOf(date) {
  const [y, m, d] = date.split('-').map(Number);
  return WEEK[new Date(y, m - 1, d).getDay()];
}

function dotsOf(n) {
  const count = n === 0 ? 0 : n < 3 ? 1 : n < 10 ? 2 : 3;
  return '<span></span>'.repeat(count);
}

function joinButtonHtml(e) {
  const on = isJoined(e.id);
  return `<button type="button" class="dsh-btn dsh-btn--secondary" data-join="${esc(e.id)}" aria-pressed="${on}">${on ? '✓ 已想參加' : '我想參加'}</button>`;
}

function eventHtml(e, isNew) {
  const [, m, d] = e.date.split('-');
  const mine = e.id.startsWith('E-MINE-');
  // 模擬資料的暱稱本身已標「（模擬）」，自己發起的才補「（暱稱）」
  const host = !e.organizer ? '在地守護者' : mine ? `${e.organizer}（暱稱）` : e.organizer;
  return `
    <article class="dsh-event${isNew ? ' board-new' : ''}" data-event="${esc(e.id)}">
      <div class="dsh-event__date"><span class="dsh-event__month">${Number(m)} 月</span><span class="dsh-event__day">${d}</span><span class="dsh-event__week">${weekOf(e.date)}</span></div>
      <div class="dsh-event__body">
        <span class="dsh-event__label">市民活動</span>
        <h3 class="dsh-event__title">${esc(e.title)}</h3>
        <p class="dsh-event__meta"><b>時間</b>${esc(`${e.startTime}–${e.endTime}`)}</p>
        <p class="dsh-event__meta"><b>地點</b>${esc(e.place)}</p>
        ${e.description ? `<p class="dsh-event__desc">${esc(e.description)}</p>` : ''}
        <p class="dsh-event__host">發起人：${esc(host)}${mine ? '・你發起的（只有你看得到）' : ''}</p>
      </div>
      <div class="dsh-event__foot">
        <span class="dsh-event__count"><span class="dsh-event__dots" aria-hidden="true">${dotsOf(interestedOf(e))}</span><span data-count>${interestedOf(e)} 人想參加</span></span>
        ${joinButtonHtml(e)}
      </div>
    </article>`;
}

function listHtml(events, newId) {
  const upcoming = events.filter((e) => e.date >= today());
  const past = events.filter((e) => e.date < today()).reverse();
  const cards = upcoming.length
    ? `<div class="dsh-event-list">${upcoming.map((e) => eventHtml(e, e.id === newId)).join('')}</div>`
    : '<p class="tp-p tp-muted">接下來還沒有活動。</p>';
  const pastHtml = past.length
    ? `<details class="board-past"><summary>過去的活動（${past.length}）</summary><div class="dsh-event-list">${past.map((e) => eventHtml(e, false)).join('')}</div></details>`
    : '';
  return `${cards}${pastHtml}`;
}

const ICON_PLUS = '<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><path d="M11 4 V18 M4 11 H18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';

/** 在地守護者：發起按鈕；其他人：說明怎麼樣才能發起 */
function gateHtml(tree, name) {
  const mine = getGuard(tree.id);
  if (mine === 'local') {
    return `<button type="button" class="dsh-btn dsh-btn--secondary board-open" data-open-form>${ICON_PLUS}在樹下發起活動</button>`;
  }
  const body = mine === 'remote'
    ? `你目前是遠端關注者，可以看活動，也可以按「我想參加」。這是你家附近的樹的話，<button type="button" class="tp-link" data-guard-local>改成在地守護</button>就能發起活動。`
    : `你可以看活動、按「我想參加」。住附近或常經過${esc(name)}的話，回樹的檔案按「守護祂」、選在地守護，就能發起活動。`;
  return `
    <div class="dsh-gate">
      <img src="design-system/assets/icons/guard.svg" alt="" width="32" height="32">
      <div><b>在地守護者才能發起活動</b>${body}</div>
    </div>`;
}

function formHtml(name) {
  return `
    <form class="board-form" novalidate>
      <div class="board-form__head">
        <h2 class="tp-h">在樹下發起活動</h2>
        <p class="tp-small">貼在${esc(name)}的社區佈告欄・在地守護者才能發起</p>
      </div>
      <div class="board-field">
        <label for="bf-title">活動名稱</label>
        <input id="bf-title" name="title" class="board-input" type="text" maxlength="${TITLE_MAX}" required placeholder="例如：週日下午在樹下野餐">
      </div>
      <div class="board-field">
        <label for="bf-date">日期</label>
        <input id="bf-date" name="date" class="board-input" type="date" min="${today()}" value="${today()}" required>
      </div>
      <div class="board-row">
        <div class="board-field">
          <label for="bf-start">開始</label>
          <input id="bf-start" name="startTime" class="board-input" type="time" value="14:00" required>
        </div>
        <div class="board-field">
          <label for="bf-end">結束</label>
          <input id="bf-end" name="endTime" class="board-input" type="time" value="16:00" required>
        </div>
      </div>
      <div class="board-field">
        <span class="board-label">地點</span>
        <span class="board-place"><img src="design-system/assets/icons/tree.svg" alt="" width="22" height="22">${esc(name)}樹下（固定為這棵樹）</span>
      </div>
      <div class="board-field">
        <label for="bf-desc">說明</label>
        <textarea id="bf-desc" name="description" class="board-input" rows="3" maxlength="${DESC_MAX}" placeholder="要帶什麼、適合誰來，一兩句就好"></textarea>
      </div>
      <fieldset class="board-host">
        <legend class="board-label">發起人顯示</legend>
        <label><input type="radio" name="host" value="anon" checked>在地守護者（匿名）</label>
        <label><input type="radio" name="host" value="nick">顯示我的暱稱</label>
        <input name="nickname" class="board-input" type="text" maxlength="${NICK_MAX}" placeholder="暱稱，不要用真實姓名" aria-label="暱稱" hidden>
      </fieldset>
      <div class="dsh-reminder"><span>發起前提醒一下：請不要寫進別人的姓名、電話等個資，活動請選在公開場所。</span></div>
      <p class="board-error" role="alert" hidden></p>
      <button type="submit" class="dsh-btn dsh-btn--secondary dsh-btn--block">貼上佈告欄</button>
      <button type="button" class="dsh-btn dsh-btn--text dsh-btn--block board-cancel" data-close-form>取消</button>
      <p class="tp-small">Demo：活動只存在這台裝置，別人看不到，也不會送到任何地方。</p>
    </form>`;
}

/** 檢查表單，有問題回傳要顯示的訊息 */
function checkForm(f) {
  if (!f.title.trim()) return '請填活動名稱。';
  if (!f.date || f.date < today()) return '請選今天或之後的日期。';
  if (!f.startTime || !f.endTime || f.endTime <= f.startTime) return '結束時間要比開始時間晚。';
  if (f.host === 'nick' && !f.nickname.trim()) return '選了顯示暱稱，請填一個暱稱。';
  return null;
}

/** 把一棵樹的社區佈告欄畫進 el。newId：剛發起的活動，捲到那張卡並亮一下 */
export async function renderBoardPage(el, { tree }, { newId = null } = {}) {
  const events = await eventsOf(tree);
  const name = tree.beast?.name ?? tree.species;
  const treeHref = `#/tree/${encodeURIComponent(tree.id)}`;
  const local = getGuard(tree.id) === 'local';

  el.innerHTML = `
    ${pageBarHtml(`${name}的社區佈告欄`, treeHref)}
    <div class="tp-scroll board-scroll" data-mode="list">
      <!-- 電腦版左邊活動、右邊發起表單；手機版按「在樹下發起活動」才換成表單 -->
      <div class="board-cols dsh-cols">
        <div class="board-main dsh-cols__main">
          <div class="board-head">
            <p class="board-summary">${esc(summaryOf(events))}</p>
            <span class="tp-muted board-order">依活動日期由近到遠</span>
          </div>
          <div class="board-gate">${gateHtml(tree, name)}</div>
          <div class="board-list dsh-pattern--lattice">${listHtml(events, newId)}</div>
          <p class="tp-small">預設的活動與想參加人數是模擬資料；暱稱都是假的。</p>
        </div>
        ${local ? `<aside class="board-aside dsh-cols__aside">${formHtml(name)}</aside>` : ''}
      </div>
    </div>`;

  const scroll = el.querySelector('.board-scroll');
  const back = el.querySelector('.tp-back');
  const setMode = (mode) => {
    scroll.dataset.mode = mode;
    scroll.scrollTop = 0;
    if (mode === 'form') el.querySelector('#bf-title').focus();
    else el.querySelector('[data-open-form]')?.focus();
  };

  el.querySelector('[data-open-form]')?.addEventListener('click', () => setMode('form'));
  el.querySelector('[data-close-form]')?.addEventListener('click', () => setMode('list'));
  // 手機版填表單時，左上角返回先回到活動列表，不離開佈告欄
  back.addEventListener('click', (e) => {
    if (scroll.dataset.mode !== 'form') return;
    e.preventDefault();
    setMode('list');
  });

  el.querySelector('[data-guard-local]')?.addEventListener('click', () => {
    setGuard(tree.id, 'local');
    renderBoardPage(el, { tree });
  });

  el.querySelectorAll('[data-join]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const e = events.find((x) => x.id === btn.dataset.join);
      setJoined(e.id, !isJoined(e.id));
      const card = btn.closest('.dsh-event');
      card.querySelector('[data-count]').textContent = `${interestedOf(e)} 人想參加`;
      card.querySelector('.dsh-event__dots').innerHTML = dotsOf(interestedOf(e));
      btn.setAttribute('aria-pressed', String(isJoined(e.id)));
      btn.textContent = isJoined(e.id) ? '✓ 已想參加' : '我想參加';
      el.querySelector('.board-summary').textContent = summaryOf(events);
    });
  });

  const form = el.querySelector('.board-form');
  if (form) {
    const nick = form.elements.nickname;
    form.querySelectorAll('[name="host"]').forEach((r) => {
      r.addEventListener('change', () => {
        nick.hidden = form.elements.host.value !== 'nick';
        if (!nick.hidden) nick.focus();
      });
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(form));
      const error = form.querySelector('.board-error');
      const problem = checkForm(f);
      error.hidden = !problem;
      error.textContent = problem ?? '';
      if (problem) return;
      const event = {
        id: `E-MINE-${Date.now()}`,
        treeId: tree.id,
        date: f.date,
        startTime: f.startTime,
        endTime: f.endTime,
        title: f.title.trim(),
        place: `${name}樹下`,
        description: f.description.trim(),
        organizer: f.host === 'nick' ? f.nickname.trim() : null,
        interested: 0,
      };
      addEvent(event);
      // 發起人自己也算一個想參加的人
      setJoined(event.id, true);
      renderBoardPage(el, { tree }, { newId: event.id });
    });
  }

  if (newId) {
    const card = el.querySelector('.board-new');
    card?.scrollIntoView({ block: 'center' });
    card?.querySelector('[data-join]')?.focus({ preventScroll: true });
  }
}

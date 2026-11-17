// 我參加的活動：#/myevents
// 從「我的」頁點進來，列出按過「我想參加」的社區活動（含自己發起的），點一列回那棵樹的佈告欄。
// 要取消參加就到佈告欄按，這裡只看不改。
import { esc, pageBarHtml } from './shared.js';
import { joinedEvents, today, weekOf } from './board.js';

function rowHtml(e) {
  const [, m, d] = e.date.split('-');
  const mine = e.id.startsWith('E-MINE-');
  return `
    <li>
      <a class="mev-row" href="#/board/${encodeURIComponent(e.treeId)}">
        <span class="dsh-event__date"><span class="dsh-event__month">${Number(m)} 月</span><span class="dsh-event__day">${d}</span><span class="dsh-event__week">${weekOf(e.date)}</span></span>
        <span class="mev-row__body">
          <span class="mev-row__title">${esc(e.title)}</span>
          <span class="mev-row__meta"><b>時間</b>${esc(`${e.startTime}–${e.endTime}`)}</span>
          <span class="mev-row__meta"><b>地點</b>${esc(e.place)}</span>
          ${mine ? '<span class="mev-row__mine">你發起的</span>' : ''}
        </span>
      </a>
    </li>`;
}

function listHtml(events) {
  const upcoming = events.filter((e) => e.date >= today());
  const past = events.filter((e) => e.date < today()).reverse();
  if (!events.length) {
    return `
      <div class="tp-box mev-empty">
        <p class="tp-p">還沒有參加活動。到樹的社區佈告欄按「我想參加」，活動就會出現在這裡。</p>
        <a class="dsh-btn dsh-btn--secondary dsh-btn--block" href="#/">回地圖找樹</a>
      </div>`;
  }
  const upcomingHtml = upcoming.length
    ? `<ul class="mev-list">${upcoming.map(rowHtml).join('')}</ul>`
    : '<p class="tp-p tp-muted">接下來沒有要參加的活動。</p>';
  const pastHtml = past.length
    ? `<details class="mev-past"><summary>已結束（${past.length}）</summary><ul class="mev-list">${past.map(rowHtml).join('')}</ul></details>`
    : '';
  return `
    <h2 class="tp-h mev-h">接下來（${upcoming.length}）</h2>
    ${upcomingHtml}
    ${pastHtml}`;
}

export async function renderMyEventsPage(el) {
  const events = await joinedEvents();
  el.innerHTML = `
    ${pageBarHtml('我參加的活動', '#/me')}
    <div class="tp-scroll mev-scroll">
      ${listHtml(events)}
      <p class="tp-small">預設的活動是模擬資料；參加紀錄只存在這台裝置。</p>
    </div>`;
}

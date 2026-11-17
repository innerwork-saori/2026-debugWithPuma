// 通知頁（關鍵畫面 ⑤ 異動警報）：#/notices。負責人：Qmoa
// 守護的樹被公示要移除或移植時，在這裡看到通知（Demo 用畫面模擬，不真的發推播）。
// 上方是公示中的樹（自己守護的排前面），下方是守護的樹下接下來的活動。
// 樣式寫在 css/notices.css，class 用 nt- 開頭，才不會跟別的畫面撞名
import { esc, statusTag, loadJson, pageBarHtml } from './shared.js';
import { getGuard } from './store.js';
import { upcomingEventsOf } from './board.js';
import { daysUntil, shortDate } from './tree.js';
import { findOutsideTree } from './lookup.js';

const treeHref = (id) => `#/tree/${encodeURIComponent(id)}`;
const nameOf = (tree, fallback) => tree?.beast?.name ?? tree?.species ?? fallback;

function avatarHtml(tree) {
  return tree?.beast
    ? `<span class="nt-avatar"><img src="${esc(tree.beast.images.icon)}" alt="" width="48" height="48"></span>`
    : '<span class="nt-avatar nt-avatar--tree"><img src="design-system/assets/icons/tree.svg" alt="" width="32" height="32"></span>';
}

/** 最上面的通知條：自己守護的樹被公示時才出現 */
function alertHtml(mine) {
  const first = mine[0];
  const name = nameOf(first.tree, first.n.treeId);
  const more = mine.length > 1 ? `等 ${mine.length} 棵` : '';
  return `
    <a class="dsh-notice tp-notice" href="#nt-${esc(first.n.id)}" data-scroll="nt-${esc(first.n.id)}" role="status">
      <img src="design-system/assets/icons/notice.svg" alt="" width="32" height="32">
      <div>
        <p class="dsh-notice__title">你守護的${esc(name)}${more}需要你</p>
        <p class="dsh-notice__body">${shortDate(first.n.plannedDate)} 前，可以看公告、表達意見。</p>
      </div>
      <div class="dsh-notice__days">${daysUntil(first.n.plannedDate)}<small>天</small></div>
    </a>`;
}

function noticeCardHtml({ n, tree, guard }) {
  const name = nameOf(tree, n.treeId);
  const h = n.hearing;
  const meta = tree?.beast ? `${tree.species}・#${n.treeId}` : `#${n.treeId}`;
  return `
    <article class="dsh-official nt-card" id="nt-${esc(n.id)}">
      <div class="dsh-official__band"></div>
      <div class="nt-card__head">
        ${avatarHtml(tree)}
        <div class="nt-card__who">
          <h3 class="nt-card__name">${esc(name)}${guard ? `<span class="nt-pin">${guard === 'local' ? '在地守護' : '遠端關注'}</span>` : ''}</h3>
          <p class="nt-card__meta">${esc([meta, tree?.location].filter(Boolean).join('・'))}</p>
        </div>
        <div class="nt-card__days">${daysUntil(n.plannedDate)}<small>天後</small></div>
      </div>
      <p class="nt-card__what">${statusTag('notice')}<b>預計${esc(n.action)}</b>・${esc(n.reason)}</p>
      <dl class="dsh-official__list">
        <dt>工程</dt><dd>${esc(n.title)}</dd>
        <dt>預定日期</dt><dd>${esc(n.plannedDate)}</dd>
        <dt>說明會</dt><dd>${h ? esc(`${shortDate(h.date)} ${h.time}・${h.place}`) : '［待補］'}</dd>
      </dl>
      <div class="dsh-official__foot nt-card__foot">
        <a class="dsh-btn dsh-btn--primary dsh-btn--block" href="${treeHref(n.treeId)}">看公告、表達意見</a>
        <a class="dsh-btn dsh-btn--secondary dsh-btn--block" href="#/share/${encodeURIComponent(n.treeId)}/help">分享求援籤</a>
      </div>
    </article>`;
}

function eventRowHtml({ tree, e }) {
  return `
    <li><a class="dsh-notif" href="#/board/${encodeURIComponent(tree.id)}">
      ${avatarHtml(tree)}
      <div>
        <p class="dsh-notif__title">${esc(nameOf(tree))}樹下有活動</p>
        <p class="dsh-notif__body">${esc(e.title)}</p>
      </div>
      <span class="dsh-notif__time">${shortDate(e.date)}</span>
    </a></li>`;
}

export async function renderNoticesPage(el, { trees }) {
  const { notices } = await loadJson('data/mock/mock_notices.json');
  const byId = new Map(trees.map((t) => [t.id, t]));
  // 公示的樹在還沒切過去的區域（例如分享會會場）：用樹號補上，卡片才有名字和地點
  await Promise.all(notices.filter((n) => !byId.has(n.treeId))
    .map(async (n) => byId.set(n.treeId, await findOutsideTree(n.treeId))));
  const items = notices
    .map((n) => ({ n, tree: byId.get(n.treeId), guard: getGuard(n.treeId) }))
    .sort((a, b) => Boolean(b.guard) - Boolean(a.guard) || a.n.plannedDate.localeCompare(b.n.plannedDate));
  const mine = items.filter((i) => i.guard);

  const guarded = trees.filter((t) => getGuard(t.id));
  const events = (await Promise.all(
    guarded.map(async (tree) => (await upcomingEventsOf(tree)).map((e) => ({ tree, e }))),
  )).flat().sort((a, b) => a.e.date.localeCompare(b.e.date));

  el.innerHTML = `
    ${pageBarHtml('通知')}
    <div class="tp-scroll nt-scroll">
      ${mine.length ? alertHtml(mine) : ''}
      <section class="nt-section" aria-labelledby="nt-notices">
        <h2 class="tp-h nt-h" id="nt-notices">異動公示<small>${items.length} 棵樹・公示期間可以表達意見</small></h2>
        ${items.length
          ? items.map(noticeCardHtml).join('')
          : '<p class="tp-p tp-muted">目前沒有公示中的樹。</p>'}
      </section>
      <section class="nt-section" aria-labelledby="nt-events">
        <h2 class="tp-h nt-h" id="nt-events">守護的樹下活動<small>${events.length} 場</small></h2>
        ${events.length
          ? `<ul class="nt-list">${events.map(eventRowHtml).join('')}</ul>`
          : `<p class="tp-p tp-muted">${guarded.length ? '你守護的樹下最近沒有活動。' : '守護一棵樹之後，祂的消息會出現在這裡。'}</p>`}
      </section>
      <p class="tp-small">公示內容是模擬資料，不是真實公告。Demo 不會真的發推播。</p>
    </div>`;

  el.querySelector('[data-scroll]')?.addEventListener('click', (ev) => {
    ev.preventDefault();
    el.querySelector(`#${ev.currentTarget.dataset.scroll}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

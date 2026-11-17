// 社區共同目標（P1，US-10）：#/goals
// 從「我的」頁和樹木頁的燈海點進來。目標數字是模擬資料（data/mock/mock_community.json），
// 再加上這台裝置自己的在地守護和回報：守護一棵樹回來，就會多亮一盞燈。
// 比的是大家一起完成多少，不排名，也不顯示誰做了什麼。
import { esc, loadJson, pageBarHtml, HOME } from './shared.js';
import { getGuard, guardiansOf, totalOf, getAllMyReports } from './store.js';
import { HOME_REGION } from './regions.js';
import { LANTERN_SHAPE } from './tree.js';

const LIST_MAX = 3;

let community;

function lanternsHtml(goal, current, mine) {
  const lamps = Array.from({ length: goal.target }, (_, i) =>
    `<svg class="tp-lantern${i < current ? '' : ' tp-lantern--off'}" viewBox="0 0 24 36"><use href="#tp-lantern-shape"/></svg>`).join('');
  const lead = current >= goal.target
    ? '達標了！謝謝每一位鄰居。'
    : `再 ${goal.target - current} 棵就達標。每一盞燈是一棵有鄰居看著的樹。`;
  const yours = mine ? `其中 ${mine} 盞是你點亮的。` : '';
  return `
    <section class="dsh-lanterns tp-lanterns gl-lanterns" aria-label="${esc(goal.title)}">
      ${LANTERN_SHAPE}
      <div class="dsh-lanterns__head">
        <span class="dsh-lanterns__label">${esc(goal.title)}</span>
        <span class="dsh-lanterns__num">${current}<small>／${goal.target} 棵</small></span>
      </div>
      <div class="dsh-lanterns__grid" aria-hidden="true">${lamps}</div>
      <p class="dsh-lanterns__note">${lead}${yours}</p>
    </section>`;
}

function progressHtml(goal, current, mine) {
  const on = Math.floor((current / goal.target) * 10);
  const segs = Array.from({ length: 10 }, (_, i) => `<span class="dsh-vital__seg${i < on ? ' is-on' : ''}"></span>`).join('');
  return `
    <section class="dsh-vital tp-box">
      <div class="dsh-vital__head"><span class="dsh-vital__label">${esc(goal.title)}</span><span class="dsh-vital__value">${current}<small>／${goal.target} 次</small></span></div>
      <div class="dsh-vital__track" role="meter" aria-label="${esc(goal.title)}" aria-valuemin="0" aria-valuemax="${goal.target}" aria-valuenow="${current}">${segs}</div>
      ${mine ? `<p class="dsh-vital__hint">其中 ${mine} 次是你回報的。</p>` : ''}
    </section>`;
}

/** 離總部最近、還沒有人守護的樹 */
function unguardedHtml(trees) {
  const near = trees
    .filter((t) => t.region === HOME_REGION.id && totalOf(guardiansOf(t)) === 0)
    .map((tree) => ({ tree, dist: L.latLng(HOME).distanceTo([tree.lat, tree.lng]) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, LIST_MAX);
  if (!near.length) return '<p class="tp-p tp-muted">附近的樹都有人守護了。</p>';
  return `
    <ul class="dsh-treelist gl-list">
      ${near.map(({ tree, dist }) => `
        <li><a class="dsh-treelist__item" href="#/tree/${encodeURIComponent(tree.id)}">
          <img src="design-system/assets/icons/tree.svg" alt="" width="48" height="48">
          <span><p class="dsh-treelist__name">${esc(tree.species)}</p><p class="dsh-treelist__meta">${esc(`${tree.location}・${Math.round(dist)} 公尺・0 位守護`)}</p></span>
          <span class="dsh-treelist__count">守護祂</span>
        </a></li>`).join('')}
    </ul>`;
}

export async function renderGoalsPage(el, { trees }) {
  community ??= loadJson('data/mock/mock_community.json');
  const { goals: [guardGoal, reportGoal], highlights } = await community;
  const myGuards = trees.filter((t) => t.region === HOME_REGION.id && getGuard(t.id) === 'local').length;
  const myReports = getAllMyReports().filter((r) => r.date?.startsWith(reportGoal.month)).length;
  const guarded = Math.min(guardGoal.current + myGuards, guardGoal.target);
  const reported = Math.min(reportGoal.current + myReports, reportGoal.target);
  const month = Number(guardGoal.month.slice(5));

  el.innerHTML = `
    ${pageBarHtml('我們這區的共同目標')}
    <div class="tp-scroll gl-scroll">
      <p class="gl-sub">${esc(guardGoal.area)}・${month} 月</p>
      <div class="gl-cols">
        <div class="gl-col">
          ${lanternsHtml(guardGoal, guarded, myGuards)}
          ${progressHtml(reportGoal, reported, myReports)}
          <p class="tp-small gl-fair">比的是大家一起完成多少，不排名，也不公開誰做了什麼。</p>
        </div>
        <div class="gl-col">
          <section class="tp-box" aria-labelledby="gl-done">
            <h2 class="tp-h" id="gl-done">這個月大家一起做到</h2>
            <ul class="gl-done">${highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>
          </section>
          <h2 class="tp-h gl-h">附近還沒人守護的樹</h2>
          ${unguardedHtml(trees)}
          <a class="dsh-btn dsh-btn--secondary dsh-btn--block gl-map" href="#/">在地圖上看全部</a>
        </div>
      </div>
      <p class="tp-small">社區目標的數字是模擬資料；你自己的守護和回報只存在這台裝置。</p>
    </div>`;
}

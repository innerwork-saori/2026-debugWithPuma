// 我的（PRD 路由表 #/me，P1）：#/me
// 守護成果、隱私說明、資料來源，最下面是「關於大樹神獸」介紹頁的入口（手機版沒有頂部導覽）。
// 數字只來自 store.js，只有自己看得到；社區活動的數字要先讀模擬活動，由 board.js 算好再補上。
import { pageBarHtml } from './shared.js';
import { getGuard, guardedIds, getAllMyReports } from './store.js';
import { joinedEventCounts } from './board.js';

const README = 'https://github.com/innerwork-saori/2026-debugWithPuma#readme';
// 主辦票選頁上大樹神獸的作品頁（10/24 Qmoa 加）
const VOTE = 'https://puma.taipei/hackathon/works/14';

function statHtml(num, label) {
  return `<li class="me-stat"><span class="me-stat__num">${num}</span><span class="me-stat__label">${label}</span></li>`;
}

// 直接從 store 算，地圖範圍外的樹（掃樹牌打開的）也算進去
export function renderMePage(el) {
  const local = guardedIds().filter((id) => getGuard(id) === 'local').length;
  const remote = guardedIds().filter((id) => getGuard(id) === 'remote').length;
  const reports = getAllMyReports().length;

  el.innerHTML = `
    ${pageBarHtml('我的')}
    <div class="tp-scroll me-scroll">
      <section class="tp-box" aria-labelledby="me-done">
        <h2 class="tp-h" id="me-done">我的守護成果</h2>
        <ul class="me-stats">
          ${statHtml(local, '在地守護')}
          ${statHtml(remote, '遠端關注')}
          ${statHtml(reports, '次回報')}
        </ul>
        <h3 class="me-sub">社區活動</h3>
        <ul class="me-stats me-stats--two" data-events>
          ${statHtml('–', '已參加')}
          ${statHtml('–', '已結束')}
        </ul>
        <div class="me-actions">
          <a class="dsh-btn dsh-btn--secondary dsh-btn--block" href="#/myevents">看我參加的活動</a>
          <a class="dsh-btn dsh-btn--secondary dsh-btn--block" href="#/collection">看我的守護圖鑑</a>
          <a class="dsh-btn dsh-btn--secondary dsh-btn--block" href="#/goals">看我們這區的共同目標</a>
        </div>
      </section>

      <section class="tp-box" aria-labelledby="me-privacy">
        <h2 class="tp-h" id="me-privacy">你的資料</h2>
        <p class="tp-p">守護了哪些樹、送出的回報，都只存在這台裝置，不會上傳，也不會記住你家的地址。別人只看得到守護人數，看不到是誰。</p>
        <p class="tp-p">定位只在你按地圖上的定位鈕時用一次，用來標出你在哪、算離樹多遠，不會存起來，也不會上傳。</p>
      </section>

      <section class="tp-box" aria-labelledby="me-data">
        <h2 class="tp-h" id="me-data">資料來源</h2>
        <p class="tp-p">樹的位置、樹種、樹號來自臺北市政府開放資料「行道樹及公園樹木分布圖」。</p>
        <p class="tp-p">神獸的故事、守護人數、回報、異動公告和社區活動是黑客松 Demo 用的<strong>模擬資料</strong>。</p>
        <a class="tp-link" href="${README}" target="_blank" rel="noopener">看完整的資料說明（README）</a>
      </section>

      <a class="dsh-btn dsh-btn--primary dsh-btn--block me-about" href="about.html">關於大樹神獸</a>
      <a class="dsh-btn dsh-btn--secondary dsh-btn--block me-feedback" href="#/feedback">給我們意見</a>
      <a class="dsh-btn dsh-btn--secondary dsh-btn--block me-vote" href="${VOTE}" target="_blank" rel="noopener">幫大樹神獸投一票</a>
      <p class="me-vote__note">線上票選到 10/31（六）18:00，用 Google 或 LINE 登入就能投。</p>
    </div>`;

  joinedEventCounts().then(({ joined, ended }) => {
    const nums = el.querySelectorAll('[data-events] .me-stat__num');
    nums[0].textContent = joined;
    nums[1].textContent = ended;
  });
}

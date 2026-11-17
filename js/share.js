// 分享卡（關鍵畫面第 13～16 頁「守護籤」「求援籤」，PRD F9）：#/share/樹號。負責人：Saori
// #/share/樹號/guard、#/share/樹號/help 指定要哪一張；沒指定時，公示中的樹先給求援籤。
// 卡片是固定圖檔（scripts/capture_share_cards.cjs 從設計稿截的），只有鬚鬚公有；其他樹用神獸卡代替、只分享連結。
// 圖上印著鬚鬚公的名字，所以用樹號對應，不用 slug：其他區域沿用同一張插圖的神獸（例如會場的古莊伯）不會拿到這張卡。
// 分享出去的網址是 t/樹號（檔案是 t/樹號.html，scripts/make_og_pages.cjs 產生），LINE、Threads 才讀得到預覽圖。
// 網址不帶 .html：Cloudflare 會把 .html 轉址到沒有副檔名的網址，有些平台抓預覽時不跟轉址。
import { esc, DESKTOP, loadJson, pageBarHtml } from './shared.js';
import { guardiansOf, totalOf } from './store.js';
import { heroHtml } from './tree.js';

const SITE = 'https://2026-debugwithpuma.tree-god.workers.dev/';
const CARDS = {
  JS0155103034: { guard: 'assets/share/xuxugong-guard.png', help: 'assets/share/xuxugong-help.png' },
};
const KIND_LABEL = { guard: '守護籤', help: '求援籤' };

const shortDate = (date) => date.slice(5).split('-').map(Number).join('/');

let notices;
async function noticeOf(tree) {
  notices ??= loadJson('data/mock/mock_notices.json').then((d) => d.notices);
  return (await notices).find((n) => n.treeId === tree.id);
}

/** 分享出去的網址：神獸有自己的 OG 跳轉頁，一般樹直接連到樹木頁 */
function urlOf(tree, kind) {
  if (!tree.beast) return `${SITE}#/tree/${encodeURIComponent(tree.id)}`;
  return `${SITE}t/${encodeURIComponent(tree.id)}${kind === 'help' ? '-help' : ''}`;
}

/** 分享的文字只寫事實：狀態、原因、期限，不加未證實的說法 */
function textOf(tree, kind, notice) {
  const name = tree.beast?.name ?? tree.species;
  if (kind === 'help' && notice) {
    return `${tree.location}的${tree.species}「${name}」被公告預計${notice.action}（${notice.reason}，模擬公告），${shortDate(notice.plannedDate)} 前可以表達意見。來看看祂，一起守護祂。`;
  }
  return `我在守護${tree.location}的${tree.species}「${name}」，已經有 ${totalOf(guardiansOf(tree))} 位鄰居守護祂。一起來當祂的鄰居！`;
}

// 先把圖檔準備成 File：iPhone Safari 要在點擊當下呼叫 navigator.share，中間不能再等下載
const files = new Map();
function prepareFile(img) {
  if (!img || files.has(img)) return;
  files.set(img, null);
  fetch(img)
    .then((res) => res.blob())
    .then((blob) => files.set(img, new File([blob], img.split('/').pop(), { type: blob.type })))
    .catch(() => files.delete(img));
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** 有圖就連圖一起分享，不支援就只分享文字和網址，都不行就複製文字和連結 */
async function share({ img, title, text, url }) {
  const file = files.get(img);
  try {
    if (file && navigator.canShare?.({ files: [file] })) {
      // 帶檔案時很多 App 會丟掉 url 欄位，所以網址也放進文字
      await navigator.share({ files: [file], title, text: `${text}\n${url}` });
      return 'shared';
    }
    if (navigator.share) {
      await navigator.share({ title, text, url });
      return 'shared';
    }
  } catch (err) {
    if (err.name === 'AbortError') return 'cancel';
  }
  return (await copyText(`${text}\n${url}`)) ? 'copied' : 'failed';
}

const STATUS_TEXT = {
  shared: '分享出去了，謝謝你幫祂找到更多鄰居。',
  copied: '已複製文字和連結，可以貼到 LINE、Threads 或 IG 限動。',
  failed: '這台裝置不能自動複製，請長按上面的文字和網址複製。',
  cancel: '',
};

export async function renderSharePage(el, { tree }) {
  const name = tree.beast?.name ?? tree.species;
  const notice = tree.status === 'notice' ? await noticeOf(tree) : null;
  const kinds = notice ? ['help', 'guard'] : ['guard'];
  const asked = location.hash.split('/')[3];
  let kind = kinds.includes(asked) ? asked : kinds[0];
  const cards = CARDS[tree.id];
  Object.values(cards ?? {}).forEach(prepareFile);

  function draw() {
    const img = cards?.[kind];
    const url = urlOf(tree, kind);
    const text = textOf(tree, kind, notice);
    const title = `${KIND_LABEL[kind]}｜${name}`;
    const switcher = kinds.length > 1
      ? `<div class="sh-kinds" role="group" aria-label="選擇卡片">
          ${kinds.map((k) => `<button type="button" class="chip" data-kind="${k}" aria-pressed="${k === kind}">${KIND_LABEL[k]}</button>`).join('')}
        </div>`
      : '';
    const preview = img
      ? `<img class="sh-card" src="${esc(img)}" alt="${esc(`${title}的分享卡`)}" width="1080" height="1350">`
      : `${heroHtml(tree)}<p class="tp-small sh-note">這棵樹還沒有專屬的分享卡，會分享祂的網址。</p>`;

    el.innerHTML = `
      ${pageBarHtml(`分享${KIND_LABEL[kind]}`, `#/tree/${encodeURIComponent(tree.id)}`)}
      <div class="tp-scroll sh-scroll">
        <div class="sh-cols dsh-cols">
          <div class="sh-preview dsh-cols__aside">${switcher}${preview}</div>
          <div class="sh-main dsh-cols__main">
            <section class="tp-box">
              <h2 class="tp-h">${kind === 'help' ? `請朋友一起關心${esc(name)}` : `邀朋友一起守護${esc(name)}`}</h2>
              <p class="tp-p sh-text">${esc(text)}</p>
              <p class="sh-url">${esc(url)}</p>
            </section>
            <div class="sh-actions">
              <button type="button" class="dsh-btn dsh-btn--primary dsh-btn--block" data-share>${img ? '分享圖片和連結' : '分享連結'}</button>
              ${img ? `<a class="dsh-btn dsh-btn--secondary dsh-btn--block" href="${esc(img)}" download="${esc(`${name}-${KIND_LABEL[kind]}.png`)}">下載圖片</a>` : ''}
              <button type="button" class="dsh-btn dsh-btn--text dsh-btn--block" data-copy>複製文字和連結</button>
              <p class="sh-status" role="status"></p>
            </div>
            ${img && DESKTOP.matches ? '<p class="tp-small">IG 不能從電腦直接分享：先下載圖片，再用手機上傳。</p>' : ''}
            <p class="tp-small">卡片和連結只有樹的位置，不會帶出你的位置或路線。守護人數與公告是模擬資料。</p>
          </div>
        </div>
      </div>`;

    const status = el.querySelector('.sh-status');
    el.querySelector('[data-share]').addEventListener('click', async () => {
      status.textContent = STATUS_TEXT[await share({ img, title, text, url })];
    });
    el.querySelector('[data-copy]').addEventListener('click', async () => {
      status.textContent = STATUS_TEXT[(await copyText(`${text}\n${url}`)) ? 'copied' : 'failed'];
    });
    el.querySelectorAll('[data-kind]').forEach((btn) => {
      btn.addEventListener('click', () => {
        kind = btn.dataset.kind;
        draw();
        el.querySelector(`[data-kind="${kind}"]`).focus();
      });
    });
  }
  draw();
}

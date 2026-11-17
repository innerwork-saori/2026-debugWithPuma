// 意見回饋：#/feedback
// 從「我的」頁點進來。送到 worker.js 的 /api/feedback，存在 Cloudflare D1。
// 防灌水：Turnstile 驗證（進這頁才載入）＋看不見的陷阱欄位；限流和每日上限在 worker.js。
import { esc, pageBarHtml } from './shared.js';

const MESSAGE_MAX = 1000;
const KINDS = [
  { value: 'idea', label: '建議' },
  { value: 'bug', label: '遇到問題' },
  { value: 'other', label: '其他' },
];

// Turnstile 站點金鑰（公開的，可以寫在前端）。本機用 Cloudflare 的測試金鑰，一定會通過
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
const SITE_KEY = LOCAL ? '1x00000000000000000000AA' : '0x4AAAAAAFlW2mvcupFB0P_v';
const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

// worker.js 回的錯誤 → 畫面上的提示
const ERRORS = {
  400: '內容好像有點問題，確認一下再送一次。',
  403: '驗證沒有通過，重新整理頁面再試一次。',
  429: '送太快了，休息一分鐘再試。',
  500: '回饋箱還沒設定好，我們正在處理，晚一點再試。',
  503: '今天的回饋箱滿了，明天再來。',
};
const ERROR_DEFAULT = '沒送出去，等一下再試一次。';

// 記住是從哪一頁點進來的，一起送出，方便重現問題
let fromPage = '';
window.addEventListener('hashchange', (e) => {
  const prev = new URL(e.oldURL).hash;
  if (!prev.startsWith('#/feedback')) fromPage = prev || '#/';
});

let turnstileReady;
function loadTurnstile() {
  turnstileReady ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = TURNSTILE_SRC;
    s.async = true;
    s.onload = () => resolve(window.turnstile);
    s.onerror = () => { turnstileReady = null; reject(new Error('讀不到 Turnstile')); };
    document.head.append(s);
  });
  return turnstileReady;
}

let widgetId = null;

export function renderFeedbackPage(el) {
  el.innerHTML = `
    ${pageBarHtml('意見回饋', '#/me')}
    <div class="tp-scroll fb-scroll">
      <form class="tp-box fb-form" novalidate>
        <div>
          <h2 class="tp-h">給大樹神獸一點意見</h2>
          <p class="tp-small">好用的、不好用的、壞掉的地方都可以說，團隊會一則一則看。</p>
        </div>
        <fieldset class="fb-kinds">
          <legend class="fb-label">想說的是</legend>
          ${KINDS.map((k, i) => `<label><input type="radio" name="kind" value="${k.value}"${i === 0 ? ' checked' : ''}>${esc(k.label)}</label>`).join('')}
        </fieldset>
        <div class="fb-field">
          <label class="fb-label" for="fb-message">內容</label>
          <textarea id="fb-message" name="message" class="fb-input" rows="5" maxlength="${MESSAGE_MAX}" required
            placeholder="例如：回報的時候找不到上傳照片的按鈕"></textarea>
          <span class="fb-count" aria-live="polite">還可以寫 ${MESSAGE_MAX} 字</span>
        </div>
        <div class="fb-trap" aria-hidden="true">
          <label>網站<input name="website" type="text" tabindex="-1" autocomplete="off"></label>
        </div>
        <div class="dsh-reminder"><span>請不要寫姓名、電話、地址等個人資料。回饋是匿名的，不會記錄你是誰。</span></div>
        <div class="fb-turnstile" data-turnstile></div>
        <p class="fb-msg" role="alert" hidden></p>
        <button type="submit" class="dsh-btn dsh-btn--primary dsh-btn--block" disabled>送出</button>
      </form>
      <div class="tp-box fb-done" hidden>
        <h2 class="tp-h">謝謝你！</h2>
        <p class="tp-p">收到了，團隊會看過每一則。</p>
        <button type="button" class="dsh-btn dsh-btn--secondary dsh-btn--block" data-again>再寫一則</button>
        <a class="dsh-btn dsh-btn--text dsh-btn--block" href="#/me">回我的</a>
      </div>
    </div>`;

  const form = el.querySelector('.fb-form');
  const done = el.querySelector('.fb-done');
  const textarea = form.elements.message;
  const count = form.querySelector('.fb-count');
  const msg = form.querySelector('.fb-msg');
  const submit = form.querySelector('[type="submit"]');
  let token = '';

  const showMsg = (text) => { msg.textContent = text; msg.hidden = !text; };
  const syncSubmit = () => { submit.disabled = !token || !textarea.value.trim(); };

  textarea.addEventListener('input', () => {
    count.textContent = `還可以寫 ${MESSAGE_MAX - textarea.value.length} 字`;
    syncSubmit();
  });

  loadTurnstile().then((turnstile) => {
    const box = form.querySelector('[data-turnstile]');
    if (!box.isConnected) return;
    if (widgetId != null) turnstile.remove(widgetId);
    widgetId = turnstile.render(box, {
      sitekey: SITE_KEY,
      language: 'zh-tw',
      callback: (t) => { token = t; syncSubmit(); },
      'expired-callback': () => { token = ''; syncSubmit(); },
      'error-callback': () => { token = ''; syncSubmit(); showMsg('驗證元件出了點問題，重新整理頁面再試一次。'); },
    });
  }).catch(() => showMsg('驗證元件讀不到，確認網路後重新整理頁面。'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = textarea.value.trim();
    if (!message) return showMsg('先寫點內容再送出。');
    if (!token) return showMsg('等下面的驗證打勾再送出。');
    showMsg('');
    submit.disabled = true;
    submit.textContent = '送出中…';
    let status = 0;
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: form.elements.kind.value,
          message,
          page: fromPage,
          website: form.elements.website.value,
          token,
        }),
      });
      status = res.ok ? 200 : res.status;
    } catch { /* 斷線，用預設提示 */ }
    submit.textContent = '送出';
    if (status === 200) {
      form.reset();
      count.textContent = `還可以寫 ${MESSAGE_MAX} 字`;
      form.hidden = true;
      done.hidden = false;
      done.querySelector('[data-again]').focus();
    } else {
      // 打過的字留著；token 只能用一次，換一個新的
      showMsg(ERRORS[status] ?? ERROR_DEFAULT);
    }
    token = '';
    syncSubmit();
    if (widgetId != null) window.turnstile?.reset(widgetId);
  });

  done.querySelector('[data-again]').addEventListener('click', () => {
    done.hidden = true;
    form.hidden = false;
    textarea.focus();
  });
}

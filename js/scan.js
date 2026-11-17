// 掃描頁：#/scan
// 掃樹上的 QR code 樹牌，打開這棵樹的樹木頁。
// 市府樹牌的 QR code 是 http://trees.gov.taipei/show/?treeid=樹號，我們只在手機上從文字裡讀出樹號，
// 不會連到市府網站。用手機內建相機掃，還是會開到市府網站，要用這頁的掃描器才會開到神獸頁。
// 相機打不開、或在電腦上錄 Demo 時，可以手動輸入樹號、從照片讀，或點 Demo 樹牌。
import { camTipHtml, esc, pageBarHtml } from './shared.js';
import { markScanned } from './store.js';
import { treeIdFrom } from './lookup.js';

// iPhone 的 Safari 沒有內建 QR 辨識，用 nimiq 的 qr-scanner（瀏覽器有內建辨識時它會自己改用內建的）
const QR_SCANNER_URL = 'https://unpkg.com/qr-scanner@1.4.2/qr-scanner.min.js';

// 離開掃描頁就關相機。這個監聽比路由先註冊，所以會在畫下一個畫面之前關掉
let scanner = null;
function stopScanner() {
  scanner?.destroy();
  scanner = null;
}
window.addEventListener('hashchange', stopScanner);

let QrScanner = null;
async function loadQrScanner() {
  QrScanner ??= (await import(QR_SCANNER_URL)).default;
  return QrScanner;
}

export async function renderScanPage(el, { trees }) {
  stopScanner();
  const demoTrees = trees.filter((t) => t.beast);
  el.innerHTML = `
    ${pageBarHtml('掃描樹牌')}
    <div class="tp-scroll sc-scroll">
      <div class="sc-finder" data-mode="loading">
        <video class="sc-video" playsinline muted></video>
        <div class="sc-frame" aria-hidden="true"></div>
        <p class="sc-finder__hint">對準樹牌上的 QR code</p>
        <div class="sc-nocam">
          <img src="design-system/assets/icons/scan.svg" alt="" width="48" height="48">
          <p>這裡打不開相機。可以輸入樹牌上的編號，或從照片讀取。</p>
        </div>
      </div>
      ${camTipHtml()}
      <p class="sc-msg" role="status" aria-live="polite"></p>

      <form class="sc-form">
        <label for="sc-id">輸入樹牌上的編號</label>
        <div class="sc-form__row">
          <input id="sc-id" name="id" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="例如 ${esc(demoTrees[0]?.id ?? 'JJ0530051019')}">
          <button type="submit" class="dsh-btn dsh-btn--secondary">查詢</button>
        </div>
      </form>
      <label class="dsh-btn dsh-btn--text dsh-btn--block sc-file">
        從照片讀取 QR code
        <input type="file" accept="image/*" class="sc-file__input">
      </label>

      <section class="sc-demo">
        <h2 class="sc-demo__title">沒有樹牌在旁邊？試試 Demo 樹牌</h2>
        <ul class="sc-demo__list">
          ${demoTrees.map((t) => `
            <li><button type="button" class="sc-demo__btn" data-id="${esc(t.id)}">
              <img src="${esc(t.beast.images.icon)}" alt="" width="40" height="40">
              <span><b>${esc(t.beast.name)}</b>${esc(t.id)}</span>
            </button></li>`).join('')}
        </ul>
      </section>
      <p class="tp-small">掃描只在你的手機上讀出樹號，不會連到市府網站，也不會記錄你的位置。</p>
    </div>`;

  const finder = el.querySelector('.sc-finder');
  const video = el.querySelector('.sc-video');
  const msg = el.querySelector('.sc-msg');

  let lastText = null;
  function handle(text) {
    // 鏡頭對著同一個 QR code 會一直讀到，同樣的內容只處理一次
    if (text === lastText) return;
    lastText = text;
    const id = treeIdFrom(text);
    if (!id) {
      msg.textContent = '這不是樹牌的 QR code，換一個試試。';
    } else {
      // 不在地圖範圍的樹號也照樣打開，樹木頁會顯示「樹種待查」（見 lookup.js）
      stopScanner();
      markScanned(id);
      location.hash = `#/tree/${encodeURIComponent(id)}`;
    }
  }

  el.querySelector('.sc-form').addEventListener('submit', (e) => {
    e.preventDefault();
    lastText = null;
    const text = e.currentTarget.elements.id.value.trim();
    if (text) handle(text);
  });
  el.querySelectorAll('.sc-demo__btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      lastText = null;
      handle(btn.dataset.id);
    });
  });
  el.querySelector('.sc-file__input').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    lastText = null;
    try {
      const Qr = await loadQrScanner();
      const result = await Qr.scanImage(file, { returnDetailedScanResult: true });
      handle(result.data);
    } catch {
      msg.textContent = '這張照片裡找不到 QR code，靠近一點再拍一次。';
    }
  });

  // 開相機：要 HTTPS 或 localhost，使用者也可能拒絕權限
  try {
    const Qr = await loadQrScanner();
    if (!video.isConnected) return;
    const s = new Qr(video, (result) => handle(result.data), {
      preferredCamera: 'environment',
      returnDetailedScanResult: true,
      maxScansPerSecond: 10,
    });
    scanner = s;
    await s.start();
    // 等相機權限的時候人已經離開這頁了
    if (scanner !== s) return;
    finder.dataset.mode = 'live';
  } catch {
    stopScanner();
    if (video.isConnected) finder.dataset.mode = 'nocam';
  }
}

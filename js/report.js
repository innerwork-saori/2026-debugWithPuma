// 回報頁（關鍵畫面 ③）：#/report/樹號
// 在地守護者三步驟：1 拍照 → 2 健康檢查 → 3 完成，送出後元氣值跟著更新。
// 回報存在這台裝置（store.js），不會真的送到市府。
import { DESKTOP, camTipHtml, esc, pageBarHtml } from './shared.js';
import { getGuard, getMyReports, addReport, problemsOf, vitalityOf } from './store.js';
import { vitalHtml } from './tree.js';

// 題目寫成「正常的樣子」，勾選＝沒問題；預設全勾，取消勾的項目送出後變成待關注事項（checks[key] = true）。
// 預設全勾：不然直接按送出會變成五項都有問題。
// key 和 data/mock/mock_reports.json 的 checkItems 一樣。
const CHECKS = [
  { key: 'rootBulge', q: '樹根周圍的地面平整，沒有隆起', hint: '根盤隆起可能是根部出了狀況' },
  { key: 'trunkNetPattern', q: '樹幹表面正常，沒有網狀的格紋', hint: '網狀格紋是褐根病常見的徵兆，看到請拍照' },
  { key: 'sparseLeaves', q: '枝葉茂密，沒有突然變稀疏或大片枯黃', hint: '和上次經過時比比看' },
  { key: 'constructionNotice', q: '樹旁沒有施工公告或圍籬', hint: '有的話，請把公告拍下來' },
  { key: 'pitFilled', q: '樹穴沒有被水泥、磚塊或雜物填住', hint: '樹根也需要呼吸和喝水' },
];
const LABEL = Object.fromEntries(CHECKS.map((c) => [c.key, c.q]));
const PROBLEM = {
  rootBulge: '根盤隆起',
  trunkNetPattern: '樹幹有網狀格紋',
  sparseLeaves: '枝葉稀疏',
  constructionNotice: '有施工公告',
  pitFilled: '樹穴被填',
};
const STEPS = ['拍照', '檢查', '完成'];
// 電腦版第一步是上傳照片
const DESK_STEPS = ['照片', '檢查', '完成'];
// 照片縮到最長邊這麼大再存，原圖不保存
const PHOTO_SIZE = 320;

// 離開回報頁就關相機。這個監聽比路由先註冊，所以會在畫下一個畫面之前關掉
let stream = null;
function stopCamera() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}
window.addEventListener('hashchange', stopCamera);

async function startCamera(video) {
  if (!navigator.mediaDevices?.getUserMedia) return false;
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    // 等相機權限的時候人已經離開這頁了
    if (!video.isConnected) {
      s.getTracks().forEach((t) => t.stop());
      return false;
    }
    stream = s;
    video.srcObject = s;
    // 不等 play()：iPad 的 PWA 裡影片還藏著時，play() 可能一直不回應，畫面就卡在載入中。
    // 影片有 autoplay，顯示出來就會自己播
    video.play().catch(() => {});
    return true;
  } catch {
    return false;
  }
}

/** 把相機畫面或照片縮成小張 JPEG */
function toThumb(source, w, h) {
  const scale = Math.min(1, PHOTO_SIZE / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.7);
}

function fileToThumb(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(toThumb(img, img.naturalWidth, img.naturalHeight));
    };
    img.onerror = reject;
    img.src = url;
  });
}

const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD

const stepsHtml = (current) => `
  <ol class="rp-steps">
    ${(DESKTOP.matches ? DESK_STEPS : STEPS).map((s, i) => `<li${i === current ? ' aria-current="step"' : ''}${i < current ? ' class="is-done"' : ''}><span>${i + 1}</span>${s}</li>`).join('')}
  </ol>`;

const beastImg = (tree, mood) => (tree.beast
  ? `design-system/assets/character/beasts/${tree.beast.slug}/${mood}-cutout.webp`
  : 'design-system/assets/icons/tree.svg');

function gateHtml(tree) {
  const remote = getGuard(tree.id) === 'remote';
  return `
    <div class="dsh-gate">
      <img src="design-system/assets/icons/guard.svg" alt="" width="40" height="40">
      <div>
        <b>在地守護者才能回報樹況</b>
        要到現場親眼看過，回報才準。${remote ? '你現在是遠端關注，人在樹旁邊時，可以在樹的檔案改成在地守護。' : '先回樹的檔案按「守護祂」，選擇在地守護。'}
      </div>
    </div>
    <a class="dsh-btn dsh-btn--secondary dsh-btn--block" href="#/tree/${encodeURIComponent(tree.id)}">回到樹的檔案</a>`;
}

export async function renderReportPage(el, { tree }) {
  stopCamera();
  const name = tree.beast?.name ?? tree.species;
  const treeHref = `#/tree/${encodeURIComponent(tree.id)}`;
  el.innerHTML = `
    ${pageBarHtml(`回報${name}`, treeHref)}
    <div class="tp-scroll rp-scroll"></div>`;
  const body = el.querySelector('.rp-scroll');

  if (getGuard(tree.id) !== 'local') {
    body.innerHTML = gateHtml(tree);
    return;
  }

  // date：拍攝日期。電腦版是回家才上傳，讓人填照片是哪天在樹旁拍的
  const draft = { photo: null, date: today() };

  function show(html) {
    body.innerHTML = html;
    body.scrollTop = 0;
    body.querySelector('[data-focus]')?.focus({ preventScroll: true });
  }

  // ── 步驟 1：拍照 ──
  async function shotStep() {
    // 電腦版不開相機（筆電鏡頭對著人），改成選照片上傳
    const desk = DESKTOP.matches;
    show(`
      ${stepsHtml(0)}
      <h2 class="tp-h" tabindex="-1" data-focus>${desk ? '放一張' : '拍一張'}${esc(name)}現在的樣子</h2>
      <div class="rp-finder">
        <video class="rp-video" autoplay playsinline muted></video>
        <img class="rp-preview" alt="剛拍的照片" hidden>
        <div class="rp-nocam" hidden>
          <img src="design-system/assets/icons/camera.svg" alt="" width="48" height="48">
          <p>${desk ? '選一張你在樹旁拍的照片。' : '這裡打不開相機，改用手機內建的相機拍。'}</p>
        </div>
        <div class="rp-frame" aria-hidden="true"></div>
        <p class="rp-finder__hint">把整棵樹放進框裡，樹根也要拍到</p>
      </div>
      ${desk ? '' : camTipHtml()}
      <div class="rp-controls" data-mode="loading">
        <button type="button" class="rp-shutter" data-show="live" aria-label="拍照"></button>
        <label class="dsh-btn dsh-btn--secondary dsh-btn--block rp-file" data-show="loading nocam">
          <img src="design-system/assets/icons/camera.svg" alt="" width="28" height="28">${desk ? '選擇照片' : '打開相機'}
          <input type="file" accept="image/*"${desk ? '' : ' capture="environment"'} class="rp-file__input">
        </label>
        ${desk ? `
          <label class="dsh-field rp-date">
            <span>拍攝日期</span>
            <input type="date" class="dsh-input" name="photoDate" value="${draft.date}" max="${today()}" required>
          </label>
          <p class="tp-small">照片的位置資訊會在上傳前移除。</p>` : ''}
        <div class="rp-row" data-show="taken">
          <button type="button" class="dsh-btn dsh-btn--text" data-retake>${desk ? '換一張' : '重拍'}</button>
          <button type="button" class="dsh-btn dsh-btn--secondary rp-grow" data-next>下一步：檢查</button>
        </div>
        <button type="button" class="dsh-btn dsh-btn--text dsh-btn--block" data-show="loading live nocam" data-skip>${desk ? '先不放照片，直接檢查' : '先不拍照，直接檢查'}</button>
      </div>`);

    const video = body.querySelector('.rp-video');
    const preview = body.querySelector('.rp-preview');
    const controls = body.querySelector('.rp-controls');
    const setMode = (mode) => {
      controls.dataset.mode = mode;
      controls.querySelectorAll('[data-show]').forEach((c) => { c.hidden = !c.dataset.show.split(' ').includes(mode); });
      video.hidden = mode !== 'live';
      preview.hidden = mode !== 'taken';
      body.querySelector('.rp-nocam').hidden = mode !== 'nocam';
    };
    const taken = (photo) => {
      draft.photo = photo;
      preview.src = photo;
      stopCamera();
      setMode('taken');
    };

    body.querySelector('.rp-shutter').addEventListener('click', () => {
      if (!video.videoWidth) return;
      taken(toThumb(video, video.videoWidth, video.videoHeight));
    });
    body.querySelector('.rp-file__input').addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (file) taken(await fileToThumb(file));
    });
    body.querySelector('[name="photoDate"]')?.addEventListener('change', (e) => {
      if (e.target.value) draft.date = e.target.value;
    });
    body.querySelector('[data-retake]').addEventListener('click', () => {
      draft.photo = null;
      shotStep();
    });
    body.querySelector('[data-next]').addEventListener('click', checkStep);
    body.querySelector('[data-skip]').addEventListener('click', () => {
      stopCamera();
      checkStep();
    });

    // 按鈕先接好再開相機：等相機權限時，「打開相機」和「先不拍照」也按得動
    setMode('loading');
    if (draft.photo) {
      taken(draft.photo);
    } else if (desk) {
      setMode('nocam');
    } else {
      const camOk = await startCamera(video);
      // 人已經離開這頁，或等相機時已經用內建相機拍好了
      if (!video.isConnected || controls.dataset.mode !== 'loading') {
        if (camOk) stopCamera();
        return;
      }
      setMode(camOk ? 'live' : 'nocam');
    }
  }

  // ── 步驟 2：健康檢查 ──
  function checkStep() {
    const items = CHECKS.map((c) => `
      <label class="dsh-check__item">
        <input type="checkbox" class="dsh-check__box" name="${c.key}" checked>
        <span class="dsh-check__q">${esc(c.q)}<span class="dsh-check__hint">${esc(c.hint)}</span></span>
      </label>`).join('');
    show(`
      ${stepsHtml(1)}
      ${draft.photo ? `<div class="rp-thumbrow"><img class="rp-thumb" src="${esc(draft.photo)}" alt="你拍的照片"><button type="button" class="dsh-btn dsh-btn--text" data-back>重拍</button></div>` : ''}
      <form class="dsh-check">
        <h2 class="dsh-check__title" tabindex="-1" data-focus>${esc(name)}看起來還好嗎？</h2>
        <p class="rp-lead">先幫你全部勾好了。哪一項跟現場不一樣，就把勾取消，會變成「待關注」請專業的人來看，你不用判斷是什麼病。</p>
        ${items}
        <label class="rp-note">
          <span>想補充什麼？（選填）</span>
          <textarea name="note" rows="3" maxlength="100" placeholder="例如：樹下又有人在下棋，氣根長得很好。"></textarea>
          <small>請不要寫別人的名字、電話或住址。</small>
        </label>
        <div class="dsh-check__foot"><button type="submit" class="dsh-btn dsh-btn--secondary dsh-btn--block">送出回報</button></div>
      </form>`);

    body.querySelector('[data-back]')?.addEventListener('click', shotStep);
    body.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const checks = Object.fromEntries(CHECKS.map((c) => [c.key, !form.elements[c.key].checked]));
      const before = vitalityOf(tree);
      const report = {
        id: `R-ME-${Date.now()}`,
        treeId: tree.id,
        date: draft.date,
        nickname: '你（這台裝置）',
        checks,
        note: form.elements.note.value.trim(),
      };
      if (draft.photo) report.photo = draft.photo;
      addReport(report);
      doneStep(report, before);
    });
  }

  // ── 步驟 3：完成 ──
  function doneStep(report, before) {
    const problems = problemsOf(report);
    const after = vitalityOf(tree);
    const count = getMyReports(tree.id).length;
    const mood = problems.length >= 2 || after < 40 ? 'sad' : 'healthy';
    const delta = before == null ? `元氣值第一次出現：${after}` : `元氣 ${before} → ${after}`;
    show(`
      ${stepsHtml(2)}
      <section class="rp-done">
        <img class="rp-done__art${tree.beast ? '' : ' rp-done__art--tree'}" src="${beastImg(tree, mood)}" alt="">
        <h2 class="tp-h" tabindex="-1" data-focus>謝謝你，${esc(name)}收到了</h2>
        <p class="tp-p">這是你給祂的第 ${count} 次回報。${esc(delta)}</p>
      </section>
      ${vitalHtml(tree, null)}
      ${problems.length ? `
        <div class="dsh-reminder rp-todo">
          <div>
            <b>待關注事項</b>
            <ul>${problems.map((k) => `<li>${esc(PROBLEM[k] ?? LABEL[k])}</li>`).join('')}</ul>
            正式上線後會轉給管理單位，並通知其他守護者一起留意。（Demo 不會真的送出）
          </div>
        </div>` : '<p class="tp-p rp-center">一切看起來都好。下次經過，再來看看祂。</p>'}
      <a class="dsh-btn dsh-btn--primary dsh-btn--block" href="#/share/${encodeURIComponent(tree.id)}/guard">分享守護籤</a>
      <a class="dsh-btn dsh-btn--secondary dsh-btn--block" href="${treeHref}">回到樹的檔案</a>
      <a class="dsh-btn dsh-btn--text dsh-btn--block" href="#/">回地圖</a>`);
  }

  shotStep();
}

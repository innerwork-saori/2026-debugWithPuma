// 地圖首頁（關鍵畫面 ①）：真實樹木位置＋模擬的神獸、樹況、守護人數。
// 也負責 hash 路由：#/tree/樹號 打開樹木頁，其他網址回到地圖。
// 新增畫面要在 PAGES 加一行。
import { STATUS, DESKTOP, HOME, esc, statusTag, loadJson } from './shared.js';
import { guardiansOf, totalOf } from './store.js';
import { renderTreePage } from './tree.js';
import { renderReportPage } from './report.js';
import { renderNoticesPage } from './notices.js';
import { renderScanPage } from './scan.js';
import { renderBoardPage } from './board.js';
import { renderCollectionPage } from './collection.js';
import { renderSharePage } from './share.js';
import { renderMePage } from './me.js';
import { renderMyEventsPage } from './myevents.js';
import { renderGoalsPage } from './goals.js';
import { renderFeedbackPage } from './feedback.js';
import { CATEGORIES, categoryOf } from './categories.js';
import { treeIdFrom, findOutsideTree } from './lookup.js';
import { HOME_REGION, loadRegionTrees, setupRegionSheet } from './regions.js';

// 路由註冊表：#/名稱 或 #/名稱/樹號 → 要畫的畫面。
// 新增畫面：在 js/ 開一個檔案匯出 render(el, { tree, trees })，再到這裡加一行。
// needsTree：網址要帶樹號，找不到那棵樹就回地圖。
const PAGES = {
  tree: { render: (el, { tree }) => renderTreePage(el, tree), needsTree: true },
  report: { render: renderReportPage, needsTree: true },
  notices: { render: renderNoticesPage },
  scan: { render: renderScanPage },
  board: { render: renderBoardPage, needsTree: true },
  collection: { render: renderCollectionPage },
  share: { render: renderSharePage, needsTree: true },
  me: { render: renderMePage },
  myevents: { render: renderMyEventsPage },
  goals: { render: renderGoalsPage },
  feedback: { render: renderFeedbackPage },
};

// 這幾頁蓋在地圖上時，手機版底部導覽列照常顯示；樹木頁、回報、掃描這類內容頁不顯示（底部有自己的按鈕）
const WITH_NAV = ['collection', 'notices', 'me', 'myevents', 'goals', 'feedback'];

// Demo 用的「你的位置」是 shared.js 的 HOME，真實定位離太遠時退回這裡。
const NEAR_LIMIT_M = 2000;
// 其他區域：真實定位在收錄範圍外多少公尺內，還算人在這一區（室內定位常常偏掉）
const REGION_MARGIN_M = 300;
// 沒寫半徑的區域（例如只收一條路的行道樹）用這個半徑判斷人在不在
const REGION_RADIUS_M = 600;
// 定位提示泡泡顯示多久
const LOCATE_HINT_MS = 6000;
// 比這個近才畫完整的屋簷標記；拉遠時一般樹縮成小圓點，神獸和選取中的樹照常顯示
const FAR_ZOOM = 19;

// 標記疊在一起時誰在上面：選取中 > 公示中神獸 > 需關注神獸 > 其他神獸 > 一般樹
const Z_SELECTED = 2000;
const Z_BEAST = { notice: 1500, watch: 1200 };
const zFor = (tree) => (tree.beast ? Z_BEAST[tree.status] ?? 1000 : 0);

// 電腦版左欄「附近的樹」列幾棵
const NEARBY_MAX = 20;

// 載入畫面（index.html 的 #loading）：樹資料和底圖都好了才收起。
// 底圖卡住時，樹資料讀完後最多再等這麼久就先收起，地圖讓它自己慢慢畫。
const LOADING_MAP_WAIT_MS = 8000;
// 等超過這麼久還沒好，提示改成說明為什麼慢（網路快的人不會看到）
const LOADING_SLOW_MS = 3000;
const LOADING_SLOW_HINT = '這是黑客松兩天做出來的市政 MVP，地圖用免費的開源圖資，第一次打開會慢一點。未來有機會正式上線，會換成更快的地圖與主機。';
const loadingEl = document.getElementById('loading');
const loadingPending = new Set(['trees', 'map']);
setTimeout(() => {
  if (loadingEl.classList.contains('is-done') || loadingEl.classList.contains('is-error')) return;
  loadingEl.querySelector('.loading__hint').textContent = LOADING_SLOW_HINT;
}, LOADING_SLOW_MS);

function hideLoading() {
  if (loadingEl.classList.contains('is-done') || loadingEl.classList.contains('is-error')) return;
  loadingEl.classList.add('is-done');
  // 減少動態效果時沒有淡出，所以不等 transitionend，時間到直接收起
  setTimeout(() => {
    if (loadingEl.classList.contains('is-done')) loadingEl.hidden = true;
  }, 400);
}

function loadingStep(name) {
  loadingEl.querySelector(`[data-step="${name}"]`)?.classList.add('is-done');
  loadingPending.delete(name);
  if (!loadingPending.size) hideLoading();
}

function showLoadingError(message) {
  loadingEl.hidden = false;
  loadingEl.classList.remove('is-done');
  loadingEl.classList.add('is-error');
  loadingEl.querySelector('.loading__beast').src = 'design-system/assets/character/beasts/xuxugong/sad-icon.webp';
  loadingEl.querySelector('.loading__title').textContent = '資料載入失敗';
  loadingEl.querySelector('.loading__hint').textContent = message;
  loadingEl.querySelector('.loading__retry').hidden = false;
}

async function loadTrees() {
  const [real, beasts, guardians] = await Promise.all([
    loadJson('data/trees.json'),
    loadJson('data/mock/mock_beasts.json'),
    loadJson('data/mock/mock_guardians.json'),
  ]);
  const beastByTree = Object.fromEntries(beasts.beasts.map((b) => [b.treeId, b]));
  return real.trees.map((t) => {
    const beast = beastByTree[t.id];
    const g = beast?.guardians ?? guardians.guardians[t.id] ?? { local: 0, remote: 0 };
    return {
      ...t,
      beast,
      status: STATUS[beast?.status] ?? 'ok',
      category: categoryOf(t.species),
      guardians: g,
      region: HOME_REGION.id,
    };
  });
}

function matches(tree, region, filter, query, category) {
  // 地圖一次只畫一個區域（切換區域見 regions.js）
  if (tree.region !== region) return false;
  if (category !== 'all' && tree.category.id !== category) return false;
  if (filter === 'beast' && !tree.beast) return false;
  if ((filter === 'watch' || filter === 'notice') && tree.status !== filter) return false;
  if (!query) return true;
  const text = [tree.beast?.name, tree.species, tree.category.name, tree.location, tree.id].join(' ');
  return text.includes(query);
}

function iconFor(tree, selected) {
  return dshMarkerIcon({
    status: tree.status,
    count: totalOf(guardiansOf(tree)),
    name: tree.beast?.name,
    beastIcon: tree.beast?.images.icon,
    selected,
  });
}

/** here 是 null（看的是別的區域）就不顯示距離 */
function renderCard(el, tree, here) {
  const b = tree.beast;
  const name = b ? b.name : tree.species;
  const meta = [
    b ? tree.species : tree.location,
    tree.ageEstimated ? `約 ${tree.ageEstimated} 年（推估）` : null,
    here ? `距你 ${Math.round(L.latLng(here).distanceTo([tree.lat, tree.lng]))} 公尺` : null,
  ].filter(Boolean).join('・');
  const art = b
    ? `<div class="tree-card__art"><img src="${esc(b.images.icon)}" alt="" width="64" height="64"></div>`
    : `<div class="tree-card__art tree-card__art--tree"><img src="design-system/assets/icons/tree.svg" alt="" style="width:44px;height:44px"></div>`;
  el.innerHTML = `
    ${art}
    <div class="tree-card__body">
      <div class="tree-card__head">
        <h2 class="tree-card__name">${esc(name)}</h2>
        ${statusTag(tree.status)}
      </div>
      <p class="tree-card__meta">${esc(meta)}</p>
      <p class="tree-card__count"><b>${totalOf(guardiansOf(tree))}</b> 位鄰居守護</p>
    </div>
    <a class="tree-card__go" href="#/tree/${encodeURIComponent(tree.id)}" aria-label="看${esc(name)}">
      <span class="tree-card__go-label">看祂的檔案</span>
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M6 3 L12 9 L6 15" fill="none" stroke="#26231f" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </a>`;
  el.hidden = false;
}

/** 電腦版左欄：離你最近的樹，點了在地圖上選取 */
function renderNearby(el, shown, selected, here, onPick) {
  const near = shown
    .map((tree) => ({ tree, dist: L.latLng(here).distanceTo([tree.lat, tree.lng]) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, NEARBY_MAX);
  el.innerHTML = near.map(({ tree, dist }) => {
    const name = tree.beast?.name ?? tree.species;
    const img = tree.beast ? tree.beast.images.icon : 'design-system/assets/icons/tree.svg';
    const meta = [tree.beast ? tree.species : null, `${Math.round(dist)} 公尺`].filter(Boolean).join('・');
    return `
      <li><a class="dsh-treelist__item" href="#/" data-id="${esc(tree.id)}"${tree === selected ? ' aria-current="true"' : ''}>
        <img src="${esc(img)}" alt="" width="48" height="48">
        <div><p class="dsh-treelist__name">${esc(name)}</p><p class="dsh-treelist__meta">${esc(meta)}</p></div>
        <span class="dsh-treelist__count">${totalOf(guardiansOf(tree))} 人</span>
      </a></li>`;
  }).join('');
  el.querySelectorAll('[data-id]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      onPick(near.find(({ tree }) => tree.id === a.dataset.id).tree);
    });
  });
}

/**
 * 樹種類別選單：chip 樣式的按鈕＋自己畫的清單（原生 select 打開後的樣子沒辦法配合設計系統）。
 * 鍵盤：↑↓ Home End 移動、Enter 或空白鍵選取、Esc 關閉。回傳關閉選單的函式。
 */
function setupCategoryMenu(button, menu, initialItems, onChange) {
  let current = 'all';
  let active = 0;
  let items = [];
  let rows = [];

  const label = (item) => (item.emoji ? `${item.emoji} ${item.name}` : item.name);

  /** 換一組類別（切換區域時棵數不同），選取回到「所有樹種」 */
  function setItems(next) {
    items = next;
    current = 'all';
    button.textContent = label(items[0]);
    button.classList.remove('is-active');
    menu.innerHTML = items.map((item, i) => `
    <li class="cat-menu__item" id="cat-opt-${i}" role="option" aria-selected="${item.id === current}" data-index="${i}">
      <span class="cat-menu__emoji" aria-hidden="true">${item.emoji}</span>
      <span class="cat-menu__name">${esc(item.name)}</span>
      <span class="cat-menu__count">${item.count} 棵</span>
      <span class="cat-menu__check" aria-hidden="true"></span>
    </li>`).join('');
    rows = [...menu.children];
  }
  setItems(initialItems);

  function setActive(i) {
    active = (i + rows.length) % rows.length;
    rows.forEach((row, j) => row.classList.toggle('is-active-desc', j === active));
    menu.setAttribute('aria-activedescendant', rows[active].id);
    rows[active].scrollIntoView({ block: 'nearest' });
  }

  function open() {
    // 對齊按鈕：選單放在 .topbar 裡，按鈕所在的 chip 列可能被橫向捲動過
    menu.hidden = false;
    const box = button.getBoundingClientRect();
    const parent = menu.offsetParent;
    const pBox = parent.getBoundingClientRect();
    menu.style.top = `${box.bottom - pBox.top + parent.scrollTop + 6}px`;
    menu.style.left = `${Math.max(0, box.left - pBox.left)}px`;
    // 螢幕太矮時清單自己捲動，不超出畫面底部
    menu.style.maxHeight = `${Math.max(160, innerHeight - box.bottom - 16)}px`;
    button.setAttribute('aria-expanded', 'true');
    setActive(items.findIndex((item) => item.id === current));
    menu.focus({ preventScroll: true });
  }

  function close(refocus) {
    if (menu.hidden) return;
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (refocus) button.focus({ preventScroll: true });
  }

  function choose(i) {
    const item = items[i];
    current = item.id;
    rows.forEach((row, j) => row.setAttribute('aria-selected', String(j === i)));
    button.textContent = label(item);
    button.classList.toggle('is-active', current !== 'all');
    close(true);
    onChange(current);
  }

  button.addEventListener('click', () => (menu.hidden ? open() : close(true)));
  button.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      open();
    }
  });
  const keys = {
    ArrowDown: () => setActive(active + 1),
    ArrowUp: () => setActive(active - 1),
    Home: () => setActive(0),
    End: () => setActive(rows.length - 1),
    Enter: () => choose(active),
    ' ': () => choose(active),
    Escape: () => close(true),
  };
  menu.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') return close(false);
    if (!keys[e.key]) return;
    e.preventDefault();
    keys[e.key]();
  });
  menu.addEventListener('click', (e) => {
    const row = e.target.closest('[data-index]');
    if (row) choose(Number(row.dataset.index));
  });
  menu.addEventListener('pointermove', (e) => {
    const row = e.target.closest('[data-index]');
    if (row && Number(row.dataset.index) !== active) setActive(Number(row.dataset.index));
  });
  document.addEventListener('pointerdown', (e) => {
    if (!menu.contains(e.target) && !button.contains(e.target)) close(false);
  });
  return { close: () => close(false), setItems };
}

/** 類別選單的項目：棵數從資料算，沒有樹的類別不列 */
function categoryItems(list) {
  const count = {};
  for (const tree of list) count[tree.category.id] = (count[tree.category.id] ?? 0) + 1;
  return [
    { id: 'all', emoji: '', name: '所有樹種', count: list.length },
    ...CATEGORIES.filter((c) => count[c.id]).map((c) => ({ ...c, count: count[c.id] })),
  ];
}

async function main() {
  const mapEl = document.getElementById('map');
  const card = document.getElementById('card');
  const bottom = document.querySelector('.bottom');
  const app = document.querySelector('.app');
  const nearby = document.getElementById('nearby');

  const map = L.map(mapEl, { zoomControl: false, attributionControl: true }).setView(HOME, 17);
  // OpenFreeMap 向量底圖（免金鑰），透過 maplibre-gl-leaflet 放進 Leaflet。
  // CARTO 圖磚現在會蓋「API KEY REQUIRED」浮水印，所以不用。
  const base = L.maplibreGL({
    style: 'https://tiles.openfreemap.org/styles/positron',
    attribution: '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/" target="_blank">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
  }).addTo(map);
  // 底色改成設計系統的宣紙米色（surface-sunken）
  const gl = base.getMaplibreMap();
  gl.on('load', () => {
    loadingStep('map');
    if (gl.getLayer('background')) gl.setPaintProperty('background', 'background-color', '#ede6d8');
    // 路名、地名只顯示中文（預設會中英並列）
    for (const layer of gl.getStyle().layers) {
      if (layer.type === 'symbol' && gl.getLayoutProperty(layer.id, 'text-field')) {
        gl.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', 'name:zh-Hant'], ['get', 'name:zh'], ['get', 'name']]);
      }
    }
  });

  // 底部卡片的高度會變，讓定位鈕和圖資標示跟著往上推
  const syncBottom = () => app.style.setProperty('--bottom-h', `${bottom.offsetHeight}px`);
  new ResizeObserver(syncBottom).observe(bottom);

  const syncZoom = () => mapEl.classList.toggle('is-far', map.getZoom() < FAR_ZOOM);
  map.on('zoomend', syncZoom);
  syncZoom();

  let here = HOME;
  const meMarker = L.marker(here, {
    icon: L.divIcon({ className: 'dsh-leaflet-icon', html: '<div class="me-dot" aria-label="你的位置"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }),
    keyboard: false,
    interactive: false,
  }).addTo(map);

  const trees = await loadTrees();
  loadingStep('trees');
  setTimeout(hideLoading, LOADING_MAP_WAIT_MS);
  let selected = null;
  let filter = 'all';
  let query = '';
  let category = 'all';
  let region = HOME_REGION.id;
  let shown = trees;
  const byId = new Map(trees.map((t) => [t.id, t]));
  // 附近的樹算距離的起點：在預設地點是你的位置，在別的區域是那一區的中心（卡片不顯示距離）
  let regionCenter = null;
  // 在別的區域的「你的位置」：真實定位落在這一區，或這一區把中心當成 Demo 的位置（分享會會場）。有的話卡片照樣顯示距離
  let regionHere = null;
  const origin = () => regionHere ?? regionCenter ?? here;
  const cardFrom = () => (regionCenter ? regionHere : here);

  // 框選範圍時避開蓋在地圖上的東西：手機是上方搜尋列和底部卡片；電腦版左右欄不蓋地圖
  const mapPadding = (topLeft, bottomExtra) => (DESKTOP.matches
    ? { paddingTopLeft: [40, 40], paddingBottomRight: [40, 40] }
    : { paddingTopLeft: topLeft, paddingBottomRight: [topLeft[0], bottom.offsetHeight + bottomExtra] });

  const syncNearby = () => {
    if (DESKTOP.matches) renderNearby(nearby, shown, selected, origin(), pick);
  };
  DESKTOP.addEventListener('change', syncNearby);

  const markers = new Map();
  function addMarkers(list) {
    for (const tree of list) {
      const m = L.marker([tree.lat, tree.lng], {
        icon: iconFor(tree, false),
        zIndexOffset: zFor(tree),
        title: tree.beast?.name ?? tree.species,
      });
      m.on('click', () => select(tree));
      markers.set(tree.id, m);
    }
  }
  addMarkers(trees);

  function select(tree) {
    if (selected) {
      const prev = markers.get(selected.id);
      prev.setIcon(iconFor(selected, false));
      prev.setZIndexOffset(zFor(selected));
    }
    selected = tree;
    const m = markers.get(tree.id);
    m.setIcon(iconFor(tree, true));
    m.setZIndexOffset(Z_SELECTED);
    renderCard(card, tree, cardFrom());
    syncNearby();
  }

  // 從左欄清單點選：選取並把地圖移過去
  function pick(tree) {
    select(tree);
    map.panTo([tree.lat, tree.lng]);
  }

  function applyFilter() {
    shown = [];
    for (const tree of trees) {
      const m = markers.get(tree.id);
      if (matches(tree, region, filter, query, category)) {
        m.addTo(map);
        shown.push(tree);
      } else {
        m.remove();
      }
    }
    if ((filter !== 'all' || query || category !== 'all') && shown.length) {
      const bounds = L.latLngBounds(shown.map((t) => [t.lat, t.lng]));
      map.fitBounds(bounds, { ...mapPadding([24, 140], 24), maxZoom: 18 });
      if (shown.length === 1 || !shown.includes(selected)) select(shown.find((t) => t.beast) ?? shown[0]);
    }
    syncNearby();
  }

  document.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      filter = chip.dataset.filter;
      document.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
      applyFilter();
    });
  });

  const catMenu = setupCategoryMenu(
    document.getElementById('category'),
    document.getElementById('category-menu'),
    categoryItems(trees),
    (id) => {
      category = id;
      applyFilter();
    },
  );
  map.on('movestart', catMenu.close);

  const q = document.getElementById('q');
  q.addEventListener('input', () => {
    query = q.value.trim();
    applyFilter();
  });

  // 定位沒被採用時告訴使用者為什麼，手機版順便提可以掃樹牌（掃描查的是全臺北的樹；電腦版沒有掃描）
  const hintEl = document.getElementById('locate-hint');
  let hintTimer = 0;
  const hideHint = () => { hintEl.hidden = true; };
  hintEl.addEventListener('click', hideHint);
  const hint = (text) => {
    const scan = DESKTOP.matches ? '' : '在臺北看到樹上的 QR code，也可以<a href="#/scan">掃描看祂的資料</a>。';
    hintEl.innerHTML = `${text}${scan}`;
    hintEl.hidden = false;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(hideHint, LOCATE_HINT_MS);
  };
  const NO_POSITION = '沒拿到你的位置，先帶你看總部附近的樹。';

  // 定位只用來畫出你的位置、算距離，不保存
  // 人在哪一區就切到哪一區；都不在（或沒拿到位置）就回預設地點
  document.getElementById('locate').addEventListener('click', () => {
    const goTo = async (id) => {
      if (region !== id) await (await regionSheet)?.choose(id);
      return region === id;
    };
    const center = () => map.setView(origin(), Math.max(map.getZoom(), 17));
    const goHome = async (text) => {
      if (text) hint(text);
      await goTo(HOME_REGION.id);
      center();
    };
    const fail = () => goHome(NO_POSITION);
    if (!navigator.geolocation) return fail();
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const p = [pos.coords.latitude, pos.coords.longitude];
        const at = (await regionSheet)?.regions.find((r) => r.center
          && L.latLng(p).distanceTo([r.center.lat, r.center.lng]) < (r.radiusM ?? REGION_RADIUS_M) + REGION_MARGIN_M);
        if (at && await goTo(at.id)) {
          regionHere = p;
        } else if (L.latLng(p).distanceTo(HOME) < NEAR_LIMIT_M) {
          await goTo(HOME_REGION.id);
          here = p;
        } else {
          return goHome('你不在目前收錄的範圍內，先帶你看總部附近的樹。');
        }
        meMarker.setLatLng(p);
        if (selected) renderCard(card, selected, cardFrom());
        syncNearby();
        center();
      },
      fail,
      { enableHighAccuracy: true, timeout: 5000 },
    );
  });

  applyFilter();
  // 一打開就選 Demo 主角，地圖把所有神獸和你的位置一起框進畫面
  const hero = trees.find((t) => t.beast?.slug === 'xuxugong') ?? trees[0];
  const beastSpots = trees.filter((t) => t.beast).map((t) => [t.lat, t.lng]);
  function showHome() {
    select(hero);
    map.fitBounds(L.latLngBounds([HOME, ...beastSpots]), { ...mapPadding([40, 160], 60), maxZoom: 18 });
  }
  // 網址帶 ?region=區域代號（例如分享會會場的 ?region=roosevelt）：一打開就切到那一區（在下面 regionSheet 準備好之後）。
  // 這時先不框預設地點，不然地圖還在縮放的動畫裡又被移到別區，手機上標記會畫不出來
  const startRegion = new URLSearchParams(location.search).get('region');
  if (startRegion) select(hero);
  else showHome();

  // 切換區域：第一次切過去才下載那一區的樹，篩選和搜尋都清掉重來
  async function switchRegion(r) {
    if (r.id !== HOME_REGION.id) {
      const list = (await loadRegionTrees(r.id)).filter((t) => !markers.has(t.id));
      trees.push(...list);
      // 之前用分享連結打開過的同一棵樹（findOutsideTree 查的），換成有守護人數的版本
      for (const t of list) byId.set(t.id, t);
      addMarkers(list);
    }
    region = r.id;
    regionCenter = r.center ? [r.center.lat, r.center.lng] : null;
    regionHere = r.here ? regionCenter : null;
    meMarker.setLatLng(regionHere ?? here);
    filter = 'all';
    document.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.filter === 'all')));
    query = '';
    q.value = '';
    category = 'all';
    const inRegion = trees.filter((t) => t.region === region);
    catMenu.setItems(categoryItems(inRegion));
    applyFilter();
    if (region === HOME_REGION.id) return showHome();
    // 有神獸的區域（分享會會場）：跟預設地點一樣，選公示中的主角，地圖框住神獸和你的位置
    const beastsHere = inRegion.filter((t) => t.beast);
    if (beastsHere.length) {
      select(beastsHere.find((t) => t.status === 'notice') ?? beastsHere[0]);
      map.fitBounds(L.latLngBounds([regionCenter, ...beastsHere.map((t) => [t.lat, t.lng])]), { ...mapPadding([40, 230], 60), maxZoom: 18, animate: false });
      return;
    }
    // 選這一區最粗的樹，地圖框住整區
    select(inRegion.reduce((a, b) => ((b.dbh ?? 0) > (a.dbh ?? 0) ? b : a)));
    map.fitBounds(L.latLngBounds(inRegion.map((t) => [t.lat, t.lng])), { ...mapPadding([24, 140], 24), maxZoom: 18 });
  }
  const regionBtn = document.getElementById('region');
  const regionSheet = setupRegionSheet(regionBtn, document.getElementById('region-sheet'), switchRegion)
    .catch((err) => {
      // 讀不到區域清單就不顯示按鈕，地圖照常用
      console.error(err);
      regionBtn.hidden = true;
    });
  if (startRegion) regionSheet.then((s) => s?.choose(startRegion)).catch(console.error);

  // 路由：依 PAGES 把畫面畫進同一個全螢幕的 #page，蓋在地圖上面
  const page = document.getElementById('page');
  const behindPage = [...app.children].filter((c) => c !== page);
  function showPage(on, name) {
    const nav = on && WITH_NAV.includes(name);
    page.hidden = !on;
    app.classList.toggle('has-nav', nav);
    behindPage.forEach((c) => { c.inert = on && !(nav && c === bottom); });
    card.inert = nav;
  }
  // 底部導覽列和電腦版頂部導覽，標出現在在哪一頁（沒有對應的畫面都算地圖）
  const navLinks = document.querySelectorAll('.dsh-nav__item[href], .dsh-topnav__item');
  function syncNav(name) {
    const current = Object.hasOwn(PAGES, name) && !['tree', 'report', 'board', 'share', 'goals'].includes(name) ? `#/${name}` : '#/';
    navLinks.forEach((a) => {
      if (a.getAttribute('href') === current) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  async function route() {
    const [, name, id] = location.hash.match(/^#\/([^/]+)(?:\/([^/]+))?/) ?? [];
    syncNav(name);
    const target = Object.hasOwn(PAGES, name) ? PAGES[name] : null;
    let tree = id ? byId.get(decodeURIComponent(id)) : null;
    // 不在地圖範圍的樹號（例如在家附近掃到的樹牌）：到全臺北的資料找，找不到就用「樹種待查」（見 lookup.js）
    const outsideId = !tree && target?.needsTree && id ? treeIdFrom(decodeURIComponent(id)) : null;
    if (outsideId) {
      tree = byId.get(outsideId) ?? await findOutsideTree(outsideId);
      // 查不到的「樹種待查」不記住，下次打開再查一次（可能只是網路不穩讀不到）
      if (tree.lat != null) byId.set(outsideId, tree);
      // 等資料的時候網址已經換了，就不畫這一頁
      if (location.hash.match(/^#\/[^/]+\/([^/]+)/)?.[1] !== id) return;
    }
    if (target && (tree || !target.needsTree)) {
      // 範圍外的樹沒有地圖標記，不用選取
      if (tree && selected !== tree && markers.has(tree.id)) select(tree);
      // 換到別的畫面時清掉樹號，樹木頁才不會沿用上一次的捲動位置
      if (name !== 'tree') delete page.dataset.treeId;
      page.dataset.page = name;
      await target.render(page, { tree, trees });
      showPage(true, name);
      page.querySelector('.tp-back')?.focus({ preventScroll: true });
    } else {
      showPage(false);
      // 在樹木頁按了守護，回到地圖時人數要跟著更新
      if (selected) select(selected);
    }
  }
  window.addEventListener('hashchange', route);
  route();
}

main().catch((err) => {
  console.error(err);
  showLoadingError('請檢查網路後重新整理。在自己電腦上要用本機伺服器開啟（不能直接雙擊 index.html）。');
});

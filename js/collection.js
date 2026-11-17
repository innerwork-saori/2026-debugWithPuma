// 我的守護圖鑑（關鍵畫面「我的守護圖鑑」「圖鑑｜空白狀態」，PRD F7）：#/collection
// 列出這台裝置守護的樹：在地守護排成卡片，遠端關注排成清單。資料只來自 store.js，只有自己看得到。
// 第二個分頁「樹種圖鑑」（P1 設計稿「樹種圖鑑・剪影」，US-09）：#/collection/species。
import { esc, statusTag, pageBarHtml } from './shared.js';
import { getGuard, guardedIds, seenBySpecies } from './store.js';
import { findOutsideTree } from './lookup.js';
import { upcomingEventsOf } from './board.js';
import { OLD_TREE_AGE } from './tree.js';

const ICON_LOCK = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="2.5" y="6" width="9" height="6.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4.5 6 V4.5 a2.5 2.5 0 0 1 5 0 V6" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';

const treeHref = (tree) => `#/tree/${encodeURIComponent(tree.id)}`;
const nameOf = (tree) => tree.beast?.name ?? tree.species;

/** 神獸排前面，其他照守護的先後 */
function guardedTrees(trees, kind) {
  return trees.filter((t) => getGuard(t.id) === kind).sort((a, b) => Boolean(b.beast) - Boolean(a.beast));
}

/** 卡片左上角的緞帶：公示中優先，其次是樹下接下來的活動 */
function ribbonHtml(tree, events) {
  if (tree.status === 'notice') return '<span class="col-ribbon col-ribbon--notice">異動公告</span>';
  if (events) return `<span class="col-ribbon">新活動 ${events}</span>`;
  return '';
}

function cardHtml(tree, events) {
  const b = tree.beast;
  const old = b && tree.ageEstimated >= OLD_TREE_AGE;
  const mood = tree.status === 'watch' || b?.vitality < 40 ? 'sad' : 'healthy';
  const art = b
    ? `<img src="design-system/assets/character/beasts/${esc(b.slug)}/${mood}-cutout.webp" alt="">`
    : '<img class="col-card__tree" src="design-system/assets/icons/tree.svg" alt="">';
  return `
    <a class="dsh-beast col-card${old ? ' dsh-beast--rare' : ''}${b ? '' : ' col-card--tree'}" href="${treeHref(tree)}">
      <div class="dsh-beast__art ${old ? 'dsh-pattern--cloud' : 'dsh-pattern--leaves'}">
        ${art}
        ${old ? '<span class="dsh-beast__seal">老樹</span>' : ''}
      </div>
      <div class="dsh-beast__body">
        <span class="dsh-plaque dsh-beast__name">${esc(nameOf(tree))}</span>
        <p class="dsh-beast__meta">${esc(b ? `${tree.species}・#${tree.id}` : `#${tree.id}`)}</p>
        ${statusTag(tree.status)}
      </div>
      ${ribbonHtml(tree, events)}
    </a>`;
}

function rowHtml(tree, events) {
  const b = tree.beast;
  const art = b
    ? `<span class="col-row__avatar"><img src="${esc(b.images.icon)}" alt="" width="40" height="40"></span>`
    : '<img class="col-row__tree" src="design-system/assets/icons/tree.svg" alt="" width="36" height="36">';
  const pin = tree.status === 'notice'
    ? '<span class="dsh-pin dsh-pin--notice">異動公告</span>'
    : events ? '<span class="dsh-pin">新活動</span>' : '';
  return `
    <li><a class="col-row" href="${treeHref(tree)}">
      ${art}
      <span class="col-row__body">
        <span class="col-row__name">${esc(nameOf(tree))}${pin}</span>
        <span class="col-row__meta">${esc([b ? tree.species : null, tree.location].filter(Boolean).join('・'))}</span>
      </span>
      ${tree.status === 'ok' ? '' : statusTag(tree.status)}
    </a></li>`;
}

function emptyHtml() {
  return `
    <div class="col-empty dsh-pattern--lattice">
      <div class="col-empty__art">
        <img src="design-system/assets/character/beasts/xuxugong/healthy-cutout.webp" alt="" width="160" height="198">
      </div>
      <div class="col-empty__box">
        <h2 class="col-empty__title">你還沒有守護任何一棵樹</h2>
        <p class="col-empty__text">家附近、上班路上的大樹，都在等一群鄰居。找到一棵，按下「守護祂」，祂就會出現在這裡。</p>
        <a class="dsh-btn dsh-btn--primary dsh-btn--block" href="#/">去地圖找樹</a>
        <a class="dsh-btn dsh-btn--secondary dsh-btn--block col-empty__scan" href="#/scan">掃描樹牌 QR code</a>
      </div>
    </div>`;
}

// 樹種圖鑑收幾種：地圖上棵數最多的樹種，神獸的樹種一定在裡面
const DEX_SIZE = 12;

const TABS = [
  { id: '', name: '我守護的樹' },
  { id: 'species', name: '樹種圖鑑' },
];

function tabsHtml(current) {
  return `
    <nav class="col-tabs" aria-label="圖鑑分類">
      ${TABS.map((t) => `<a class="col-tab" href="#/collection${t.id ? `/${t.id}` : ''}"${t.id === current ? ' aria-current="page"' : ''}>${t.name}</a>`).join('')}
    </nav>`;
}

/** 圖鑑要列的樹種：神獸的樹種排前面，其他照地圖上的棵數 */
function dexSpecies(trees) {
  const count = new Map();
  for (const t of trees) {
    if (t.species !== '樹種待查') count.set(t.species, (count.get(t.species) ?? 0) + 1);
  }
  const beastSpecies = [...new Set(trees.filter((t) => t.beast).map((t) => t.species))];
  const others = [...count.keys()].filter((s) => !beastSpecies.includes(s)).sort((a, b) => count.get(b) - count.get(a));
  return [...beastSpecies, ...others].slice(0, DEX_SIZE).map((species) => ({ species, nearby: count.get(species) ?? 0 }));
}

function dexCellHtml({ species, nearby }, seenIds, trees) {
  // 認識過這種樹的神獸，才當稀有款顯示
  const beastTree = trees.find((t) => t.beast && t.species === species && seenIds.includes(t.id));
  if (beastTree) {
    return `
      <a class="col-dex__cell col-dex__cell--rare" href="${treeHref(beastTree)}">
        <img src="${esc(beastTree.beast.images.icon)}" alt="" width="64" height="64">
        <span class="col-dex__name">${esc(species)}</span>
        <span class="col-dex__meta">神獸・${esc(beastTree.beast.name)}</span>
      </a>`;
  }
  if (seenIds.length) {
    return `
      <a class="col-dex__cell" href="#/tree/${encodeURIComponent(seenIds[0])}">
        <img src="design-system/assets/icons/tree.svg" alt="" width="64" height="64">
        <span class="col-dex__name">${esc(species)}</span>
        <span class="col-dex__meta">認識了 ${seenIds.length} 棵</span>
      </a>`;
  }
  return `
    <div class="col-dex__cell col-dex__cell--unknown">
      <img src="design-system/assets/icons/tree.svg" alt="" width="64" height="64">
      <span class="col-dex__name">？？？</span>
      <span class="col-dex__meta">附近有 ${nearby} 棵</span>
    </div>`;
}

function speciesHtml(trees) {
  const seen = seenBySpecies();
  // 守護過的樹也算認識（守護功能比圖鑑早上線，那時打開過的樹沒有記下來）
  const guarded = new Set(guardedIds());
  const seenOf = (species) => [...new Set([
    ...(seen[species] ?? []),
    ...trees.filter((t) => t.species === species && guarded.has(t.id)).map((t) => t.id),
  ])];

  const dex = dexSpecies(trees).map((d) => ({ ...d, seenIds: seenOf(d.species) }));
  const known = dex.filter((d) => d.seenIds.length).length;
  const segs = Array.from({ length: dex.length }, (_, i) => `<span class="dsh-vital__seg${i < known ? ' is-on' : ''}"></span>`).join('');

  return `
    <div class="dsh-vital col-dex__progress">
      <div class="dsh-vital__head">
        <span class="dsh-vital__label">已認識的樹種</span>
        <span class="dsh-vital__value">${known}<small>／${dex.length} 種</small></span>
      </div>
      <div class="dsh-vital__track" style="grid-template-columns: repeat(${dex.length}, minmax(0, 1fr))" aria-hidden="true">${segs}</div>
    </div>
    <div class="col-dex">${dex.map((d) => dexCellHtml(d, d.seenIds, trees)).join('')}</div>
    ${known < dex.length ? `
      <section class="col-dex__hint">
        <p class="col-dex__hint-title">下一種可能就在路口</p>
        <p class="tp-small">附近還有 ${dex.length - known} 種樹你還沒認識。點開地圖上的樹、打開祂的檔案，就會收進圖鑑。</p>
        <a class="dsh-btn dsh-btn--secondary dsh-btn--block" href="#/">去地圖找樹</a>
      </section>` : `
      <section class="col-dex__hint">
        <p class="col-dex__hint-title">附近的樹種都認識了</p>
        <p class="tp-small">換個區域走走，還有更多樹在等你。</p>
      </section>`}
    <p class="tp-small tp-muted">樹種和棵數來自臺北市行道樹開放資料；「認識」是你自己的紀錄，只存在這台裝置。</p>`;
}

export async function renderCollectionPage(el, { trees: mapTrees }) {
  const tab = location.hash.match(/^#\/collection\/([^/]+)/)?.[1] === 'species' ? 'species' : '';
  if (tab === 'species') {
    el.innerHTML = `
      ${pageBarHtml('樹種圖鑑')}
      <div class="tp-scroll col-scroll">${tabsHtml(tab)}${speciesHtml(mapTrees)}</div>`;
    return;
  }

  // 地圖範圍外守護的樹（掃樹牌打開的）不在 mapTrees 裡，用樹號到全臺北的資料補上
  const known = new Set(mapTrees.map((t) => t.id));
  const outside = await Promise.all(guardedIds().filter((id) => !known.has(id)).map(findOutsideTree));
  const trees = [...mapTrees, ...outside];
  const local = guardedTrees(trees, 'local');
  const remote = guardedTrees(trees, 'remote');
  const events = new Map(await Promise.all(
    [...local, ...remote].map(async (t) => [t.id, (await upcomingEventsOf(t)).length]),
  ));

  const body = local.length || remote.length
    ? `
      <p class="col-private">${ICON_LOCK}只有你看得到，資料只存在這台裝置</p>
      <section class="col-section" aria-labelledby="col-local">
        <h2 class="tp-h col-h" id="col-local">在地守護<small>${local.length} 棵・家附近、常經過的樹</small></h2>
        ${local.length
          ? `<div class="col-grid dsh-dex">${local.map((t) => cardHtml(t, events.get(t.id))).join('')}</div>`
          : '<p class="tp-p tp-muted">還沒有。家附近或常經過的樹，在祂的檔案按「守護祂」、選在地守護。</p>'}
      </section>
      <section class="col-section" aria-labelledby="col-remote">
        <h2 class="tp-h col-h" id="col-remote">遠端關注<small>${remote.length} 棵・在遠方，收到祂們的消息</small></h2>
        ${remote.length
          ? `<ul class="col-list">${remote.map((t) => rowHtml(t, events.get(t.id))).join('')}</ul>`
          : '<p class="tp-p tp-muted">還沒有。不住附近也能遠端關注，祂有異動時會通知你。</p>'}
      </section>`
    : emptyHtml();

  el.innerHTML = `
    ${pageBarHtml('我的守護圖鑑')}
    <div class="tp-scroll col-scroll">${tabsHtml(tab)}${body}</div>`;
}

// 使用者自己的操作（守護哪些樹、送出的回報）存在這台裝置的 localStorage，不上傳。
// 私密視窗或儲存被擋時，退回只存在記憶體裡，重新整理就會消失。

const cache = {};

function load(key, empty) {
  if (!(key in cache)) {
    try {
      cache[key] = JSON.parse(localStorage.getItem(key)) ?? empty;
    } catch {
      cache[key] = empty;
    }
  }
  return cache[key];
}

function save(key) {
  try {
    localStorage.setItem(key, JSON.stringify(cache[key]));
    return true;
  } catch {
    // 存不進去也沒關係，這次瀏覽還是看得到
    return false;
  }
}

// ── 守護 ──────────────────────────────────────

const GUARDS = 'dsh.guards';

/** 'local'（在地守護）、'remote'（遠端關注）或 null */
export const getGuard = (id) => load(GUARDS, {})[id] ?? null;

/** 這台裝置守護的所有樹號，包含不在地圖範圍的樹（掃樹牌打開的） */
export const guardedIds = () => Object.keys(load(GUARDS, {}));

export function setGuard(id, kind) {
  load(GUARDS, {})[id] = kind;
  save(GUARDS);
}

/** 守護人數＝模擬的基礎人數＋自己按的那一下 */
export function guardiansOf(tree) {
  const g = { ...tree.guardians };
  const mine = getGuard(tree.id);
  if (mine) g[mine] += 1;
  return g;
}

export const totalOf = (g) => g.local + g.remote;

// ── 掃描樹牌 ──────────────────────────────────
// 掃過樹牌代表人曾經在樹旁邊。只記樹號和時間，不記位置。

const SCANS = 'dsh.scans';

/** 最近一次掃這棵樹樹牌的時間（毫秒），沒掃過是 null */
export const lastScanOf = (id) => load(SCANS, {})[id] ?? null;

export function markScanned(id) {
  load(SCANS, {})[id] = Date.now();
  save(SCANS);
}

// ── 認識的樹種（樹種圖鑑） ─────────────────────
// 打開過樹木頁就算認識這棵樹。存 { 樹種: [樹號…] }，不記時間和位置。

const SEEN = 'dsh.seen';

export function markSeen(tree) {
  if (tree.lat == null) return; // 查不到資料的「樹種待查」不算
  const ids = (load(SEEN, {})[tree.species] ??= []);
  if (ids.includes(tree.id)) return;
  ids.push(tree.id);
  save(SEEN);
}

/** 樹種 → 認識的樹號（先認識的在前） */
export const seenBySpecies = () => load(SEEN, {});

// ── 回報 ──────────────────────────────────────
// 格式和 data/mock/mock_reports.json 一樣：checks 的 true 代表「有看到這個問題」。
// photo 是縮成小圖的 JPEG data URL（約 20KB），原圖不保存。

const REPORTS = 'dsh.reports';

/** 這台裝置對某棵樹送出的回報，新的在前 */
export const getMyReports = (treeId) =>
  load(REPORTS, []).filter((r) => r.treeId === treeId).reverse();

/** 這台裝置送出的所有回報（不分樹），「我的」頁統計用 */
export const getAllMyReports = () => load(REPORTS, []);

export function addReport(report) {
  const all = load(REPORTS, []);
  all.push(report);
  if (save(REPORTS)) return;
  // 空間不夠多半是照片太多：這筆先不存照片再試一次
  delete report.photo;
  save(REPORTS);
}

// ── 社區活動 ──────────────────────────────────
// 自己發起的活動格式和 data/mock/mock_events.json 一樣，只存在這台裝置，別人看不到。

const EVENTS = 'dsh.events';
const JOINS = 'dsh.joins';

/** 這台裝置在某棵樹下發起的活動 */
export const getMyEvents = (treeId) => load(EVENTS, []).filter((e) => e.treeId === treeId);

/** 這台裝置發起的所有活動（不分樹），「我的」頁統計用 */
export const getAllMyEvents = () => load(EVENTS, []);

export function addEvent(event) {
  load(EVENTS, []).push(event);
  save(EVENTS);
}

/** 有沒有按「我想參加」 */
export const isJoined = (eventId) => Boolean(load(JOINS, {})[eventId]);

export function setJoined(eventId, on) {
  const joins = load(JOINS, {});
  if (on) joins[eventId] = true;
  else delete joins[eventId];
  save(JOINS);
}

// ── 元氣 ──────────────────────────────────────
// 每筆回報先換成一個分數（每看到一個問題扣 15 分），再和原本的元氣值加權平均，
// 所以一次回報只會讓元氣慢慢變化，不會一下子歸零。沒有基礎值的一般樹，第一筆回報就是元氣值。

const PER_PROBLEM = 15;
const NEW_WEIGHT = 0.3;

export const problemsOf = (report) => Object.keys(report.checks).filter((k) => report.checks[k]);
export const scoreOf = (report) => Math.max(25, 100 - PER_PROBLEM * problemsOf(report).length);

/** 目前的元氣值（0～100），沒有資料時是 null */
export function vitalityOf(tree) {
  let v = tree.beast?.vitality ?? null;
  // getMyReports 是新的在前，要從最舊的開始算
  for (const r of getMyReports(tree.id).reverse()) {
    v = v == null ? scoreOf(r) : Math.round(v * (1 - NEW_WEIGHT) + scoreOf(r) * NEW_WEIGHT);
  }
  return v;
}

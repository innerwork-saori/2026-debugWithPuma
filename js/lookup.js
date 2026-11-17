// 用樹號找樹。
// 地圖只收錄總部周邊的樹，民眾在家附近掃到的樹牌常常不在裡面。
// 這時到 data/trees-all/ 找（全臺北分成 256 個小檔，只下載那棵樹所在的那一份）；
// 還是找不到（資料沒更新、網路斷了），就用樹號做一棵「樹種待查」的樹，樹木頁照樣打得開。
import { categoryOf } from './categories.js';
import { loadJson } from './shared.js';
import { loadRegionBeasts, withBeast } from './regions.js';

const SHARDS = 256;
// 地圖範圍外的樹沒有模擬守護人數，從 0 開始
const NO_GUARDIANS = { local: 0, remote: 0 };

// 樹號：兩個英文字母＋10 位數字，例如 JJ0530051019。市府網址和我們的 #/tree/樹號 網址都讀得到
export const TREE_ID = /\b[A-Z]{2}\d{10}\b/;

export const treeIdFrom = (text) => String(text).toUpperCase().match(TREE_ID)?.[0] ?? null;

// 樹號前兩碼是行政區（從臺北市行道樹及公園樹木分布圖整理，16 萬棵只有十幾棵例外）
const DISTRICT_BY_PREFIX = {
  BT: '北投區', DA: '大安區', DT: '大同區', JJ: '中正區', JS: '中山區', NG: '南港區',
  NH: '內湖區', SL: '士林區', SS: '松山區', SY: '信義區', WH: '萬華區', WS: '文山區',
};

/** 不在資料裡的樹號：只知道樹號和大概的行政區，其他欄位留空（畫面上顯示［待補］） */
export function placeholderTree(id) {
  const species = '樹種待查';
  return {
    id,
    species,
    lat: null,
    lng: null,
    district: '臺北市',
    location: DISTRICT_BY_PREFIX[id.slice(0, 2)] ?? '',
    dbh: null,
    height: null,
    surveyDate: null,
    managerEstimated: null,
    ageEstimated: null,
    beast: undefined,
    status: 'ok',
    category: categoryOf(species),
    guardians: { ...NO_GUARDIANS },
    outside: true,
  };
}

/** 樹號 → 分檔編號。scripts/build_data.py 的 shard_of 要用一模一樣的算法 */
export function shardOf(id) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % SHARDS;
  return h.toString(16).padStart(2, '0');
}

const shards = new Map();
function loadShard(key) {
  if (!shards.has(key)) {
    const p = loadJson(`data/trees-all/${key}.json`).then(({ fields, rows }) =>
      new Map(rows.map((row) => {
        const t = Object.fromEntries(fields.map((f, i) => [f, row[i]]));
        return [t.id, t];
      })));
    // 讀失敗（例如斷線）不要記住，下次再試
    p.catch(() => shards.delete(key));
    shards.set(key, p);
  }
  return shards.get(key);
}

/** 地圖範圍外的樹號：先查全臺北的開放資料，查不到才用「樹種待查」 */
export async function findOutsideTree(id) {
  let raw = null;
  try {
    raw = (await loadShard(shardOf(id))).get(id) ?? null;
  } catch {
    // 讀不到分檔就當作查不到
  }
  if (!raw) return placeholderTree(id);
  // 其他區域的神獸（例如分享會會場的）：還沒切到那一區就用連結打開，也要認得祂
  return withBeast({
    ...raw,
    managerEstimated: '臺北市公園路燈工程管理處',
    beast: undefined,
    status: 'ok',
    category: categoryOf(raw.species),
    guardians: { ...NO_GUARDIANS },
    outside: true,
  }, (await loadRegionBeasts()).get(id));
}

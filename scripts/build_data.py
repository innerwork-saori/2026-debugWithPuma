"""樹木資料前處理：開放資料 → data/trees.json（總部周邊）、data/trees-all/（全臺北分檔），
並產生模擬守護人數 data/mock/mock_guardians.json。

執行方式（在 repo 根目錄）：
    python scripts/build_data.py

需要的原始檔（不進 repo，放在 data/source/open-data/）：
    TaipeiTree.json      臺北市行道樹及公園樹木分布圖（行道樹）  https://data.gov.tw/dataset/128274
    TaipeiParkTree.json  臺北市行道樹及公園樹木分布圖（公園樹）  同上

只用 Python 標準函式庫，不用安裝套件。
"""

import hashlib
import json
import math
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIR = ROOT / "data" / "source" / "open-data"
MOCK_DIR = ROOT / "data" / "mock"
OUT_TREES = ROOT / "data" / "trees.json"
OUT_GUARDIANS = MOCK_DIR / "mock_guardians.json"
# 全臺北的樹分成小檔，掃到地圖範圍外的樹牌時，前端只下載那一份（js/lookup.js）
OUT_ALL_DIR = ROOT / "data" / "trees-all"
SHARDS = 256
ALL_FIELDS = ["id", "species", "lat", "lng", "district", "kind", "location", "dbh", "height", "surveyDate", "ageEstimated"]

# 預設地點：競選總部（臺北市中正區北平東路 30-1 號）。
# 這是地址的約略座標，請用地圖核對後再更新，前端的預設中心點也要一起改。
CENTER = {"lat": 25.0459, "lng": 121.5243}
RADIUS_M = 800

# 推估樹齡用的假設：胸徑每年長 1.5 公分。只是粗估，畫面上要標「推估」。
DBH_GROWTH_CM_PER_YEAR = 1.5


def twd97_to_wgs84(x, y):
    """TWD97 TM2（EPSG:3826，中央經線 121°）轉經緯度，公式見 Snyder《Map Projections》。"""
    a = 6378137.0
    f = 1 / 298.257222101  # GRS80
    k0 = 0.9999
    lon0 = math.radians(121)
    e2 = f * (2 - f)
    ep2 = e2 / (1 - e2)
    e1 = (1 - math.sqrt(1 - e2)) / (1 + math.sqrt(1 - e2))

    x -= 250000
    m = y / k0
    mu = m / (a * (1 - e2 / 4 - 3 * e2**2 / 64 - 5 * e2**3 / 256))
    phi1 = (
        mu
        + (3 * e1 / 2 - 27 * e1**3 / 32) * math.sin(2 * mu)
        + (21 * e1**2 / 16 - 55 * e1**4 / 32) * math.sin(4 * mu)
        + (151 * e1**3 / 96) * math.sin(6 * mu)
        + (1097 * e1**4 / 512) * math.sin(8 * mu)
    )
    sin1, cos1, tan1 = math.sin(phi1), math.cos(phi1), math.tan(phi1)
    c1 = ep2 * cos1**2
    t1 = tan1**2
    n1 = a / math.sqrt(1 - e2 * sin1**2)
    r1 = a * (1 - e2) / (1 - e2 * sin1**2) ** 1.5
    d = x / (n1 * k0)

    lat = phi1 - (n1 * tan1 / r1) * (
        d**2 / 2
        - (5 + 3 * t1 + 10 * c1 - 4 * c1**2 - 9 * ep2) * d**4 / 24
        + (61 + 90 * t1 + 298 * c1 + 45 * t1**2 - 252 * ep2 - 3 * c1**2) * d**6 / 720
    )
    lon = lon0 + (
        d
        - (1 + 2 * t1 + c1) * d**3 / 6
        + (5 - 2 * c1 + 28 * t1 - 3 * c1**2 + 8 * ep2 + 24 * t1**2) * d**5 / 120
    ) / cos1
    return math.degrees(lat), math.degrees(lon)


def distance_m(lat1, lng1, lat2, lng2):
    r = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def load(name):
    with open(SOURCE_DIR / name, encoding="utf-8") as f:
        return json.load(f)


def to_tree(raw, kind):
    lat, lng = twd97_to_wgs84(float(raw["TWD97X"]), float(raw["TWD97Y"]))
    if kind == "street":
        location = raw["Region"] + (raw.get("RegionRemark") or "").strip()
    else:
        location = raw["ParkName"]
    dbh = raw.get("Diameter") or None
    return {
        "id": raw["TreeID"],
        "species": raw["TreeType"],
        "lat": round(lat, 6),
        "lng": round(lng, 6),
        "district": raw["Dist"],
        "kind": kind,
        "location": location,
        "dbh": dbh,
        "height": raw.get("TreeHeight") or None,
        "surveyDate": raw.get("SurveyDate"),
        # 以下兩個欄位不是開放資料原有的，是推定或推估
        "managerEstimated": "臺北市公園路燈工程管理處",
        "ageEstimated": round(dbh / DBH_GROWTH_CM_PER_YEAR / 5) * 5 if dbh else None,
    }


def shard_of(tree_id):
    """樹號 → 分檔編號。js/lookup.js 的 shardOf 要用一模一樣的算法。"""
    h = 0
    for c in tree_id:
        h = (h * 31 + ord(c)) % SHARDS
    return f"{h:02x}"


def write_all_shards(all_trees, today):
    """每份約 630 棵；一棵樹存成一列陣列，欄位順序見 fields，檔案比較小。"""
    shards = {}
    for t in all_trees:
        shards.setdefault(shard_of(t["id"]), []).append([t[k] for k in ALL_FIELDS])
    OUT_ALL_DIR.mkdir(exist_ok=True)
    for old in OUT_ALL_DIR.glob("*.json"):
        old.unlink()
    meta = {
        "dataType": "真實開放資料",
        "source": "臺北市行道樹及公園樹木分布圖 https://data.gov.tw/dataset/128274",
        "license": "政府資料開放授權條款 https://data.gov.tw/license",
        "note": "座標已由 TWD97 轉成 WGS84。ageEstimated 依胸徑粗估，不是原始欄位。",
        "generatedAt": today,
    }
    for key, rows in shards.items():
        (OUT_ALL_DIR / f"{key}.json").write_text(
            json.dumps({"meta": meta, "fields": ALL_FIELDS, "rows": rows}, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
    return len(shards)


def mock_guardians_for(tree, beasts):
    """依樹號產生固定的假人數，每次執行結果都一樣。神獸用 mock_beasts.json 裡寫好的數字。"""
    if tree["id"] in beasts:
        return beasts[tree["id"]]["guardians"]
    h = int(hashlib.md5(tree["id"].encode()).hexdigest(), 16)
    if (tree["dbh"] or 0) >= 80:
        local, remote = 5 + h % 16, 10 + (h >> 8) % 41  # 大樹：在地 5～20、遠端 10～50
    else:
        local, remote = h % 4, (h >> 8) % 9  # 一般的樹：在地 0～3、遠端 0～8
    return {"local": local, "remote": remote}


def main():
    sys.stdout.reconfigure(encoding="utf-8")  # Windows 終端機預設不是 UTF-8，中文會變亂碼
    with open(MOCK_DIR / "mock_beasts.json", encoding="utf-8") as f:
        beasts = {b["treeId"]: b for b in json.load(f)["beasts"]}

    trees = []
    all_trees = []
    for name, kind in [("TaipeiTree.json", "street"), ("TaipeiParkTree.json", "park")]:
        for raw in load(name):
            if not raw.get("TWD97X"):
                continue
            tree = to_tree(raw, kind)
            all_trees.append(tree)
            dist = distance_m(CENTER["lat"], CENTER["lng"], tree["lat"], tree["lng"])
            # 神獸對應的樹不管距離都收進來
            if dist <= RADIUS_M or tree["id"] in beasts:
                tree["distanceM"] = round(dist)
                trees.append(tree)
    trees.sort(key=lambda t: t["distanceM"])

    missing = set(beasts) - {t["id"] for t in trees}
    if missing:
        raise SystemExit(f"mock_beasts.json 裡的樹號在開放資料找不到：{sorted(missing)}")

    today = date.today().isoformat()
    OUT_TREES.write_text(
        json.dumps(
            {
                "meta": {
                    "dataType": "真實開放資料",
                    "source": "臺北市行道樹及公園樹木分布圖 https://data.gov.tw/dataset/128274",
                    "license": "政府資料開放授權條款 https://data.gov.tw/license",
                    "note": "座標已由 TWD97 轉成 WGS84。managerEstimated 依資料集推定、ageEstimated 依胸徑粗估，都不是原始欄位。",
                    "center": CENTER,
                    "radiusM": RADIUS_M,
                    "generatedAt": today,
                },
                "trees": trees,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )

    OUT_GUARDIANS.write_text(
        json.dumps(
            {
                "meta": {
                    "dataType": "模擬資料",
                    "note": "守護人數是依樹號產生的假數字，不是真實使用者。神獸的人數來自 mock_beasts.json。",
                    "generatedAt": today,
                },
                "guardians": {t["id"]: mock_guardians_for(t, beasts) for t in trees},
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )

    shard_count = write_all_shards(all_trees, today)

    print(f"trees.json：{len(trees)} 棵（半徑 {RADIUS_M} 公尺，含神獸）")
    print(f"trees-all/：全臺北 {len(all_trees)} 棵，分成 {shard_count} 個檔案")
    for b in beasts.values():
        t = next(t for t in trees if t["id"] == b["treeId"])
        print(f"  {b['name']}：{t['id']} {t['species']} 胸徑 {t['dbh']} cm，{t['location']}，距總部 {t['distanceM']} 公尺")


if __name__ == "__main__":
    main()

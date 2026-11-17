"""切換區域（P1 US-12）的樹木資料：data/trees-all/ → data/regions/。
負責人：Saori

收錄「市長，你給我聽好了」種樹相關留言裡最常被點名的三個地點（留言數見 01_種樹痛點儀表板.html），
再加上 11/24 專案心得分享會的會場周邊。
每區控制在一千多棵，地圖一次只畫一區，手機才不會卡。

執行方式（在 repo 根目錄，要先跑過 build_data.py 產生 data/trees-all/）：
    python scripts/build_regions.py

只用 Python 標準函式庫，不用安裝套件。
"""

import json
import sys
from datetime import date
from pathlib import Path

from build_data import ALL_FIELDS, distance_m, mock_guardians_for

ROOT = Path(__file__).resolve().parent.parent
ALL_DIR = ROOT / "data" / "trees-all"
OUT_DIR = ROOT / "data" / "regions"
OUT_GUARDIANS = ROOT / "data" / "mock" / "mock_guardians_regions.json"

# center 是收錄範圍的中心，也是地圖切過去時的中心。
# 美崙公園、民生公園的中心是園內樹木座標的平均；敦化南路一段只收路名有「敦化南路一段」的行道樹。
REGIONS = [
    {
        "id": "meilun",
        "name": "美崙公園",
        "district": "士林區",
        "comments": 41,
        "note": "地下停車場工程規劃中",
        "center": {"lat": 25.097642, "lng": 121.517564},
        "radiusM": 300,
    },
    {
        "id": "minsheng",
        "name": "民生社區",
        "district": "松山區",
        "comments": 40,
        "note": "民生公園與富錦街一帶",
        "center": {"lat": 25.057414, "lng": 121.558056},
        "radiusM": 300,
    },
    {
        "id": "dunhua",
        "name": "敦化南路一段",
        "district": "大安區・松山區",
        "comments": 37,
        "note": "樟樹與臺灣欒樹的林蔭大道",
        "match": "敦化南路一段",
    },
    # 11/24 專案心得分享會的會場（中正區羅斯福路三段 218-2 號）周邊，不是留言熱點，所以沒有 comments。
    # center 是依門牌推估的位置；label 顯示在區域選單右側，代替留言數。
    {
        "id": "roosevelt",
        "name": "羅斯福路三段周邊",
        "district": "中正區・大安區",
        "label": "分享會會場",
        "note": "古莊公園到溫州公園一帶",
        # here：把中心當成 Demo 的「你的位置」（和預設地點一樣），卡片會顯示距離
        "here": True,
        "center": {"lat": 25.0201, "lng": 121.5286},
        "radiusM": 400,
    },
]


def load_all():
    trees = []
    for path in sorted(ALL_DIR.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        trees += [dict(zip(data["fields"], row)) for row in data["rows"]]
    return trees


def in_region(tree, region):
    if "match" in region:
        return region["match"] in (tree["location"] or "")
    c = region["center"]
    return distance_m(c["lat"], c["lng"], tree["lat"], tree["lng"]) <= region["radiusM"]


def main():
    sys.stdout.reconfigure(encoding="utf-8")  # Windows 終端機預設不是 UTF-8，中文會變亂碼
    all_trees = load_all()
    if not all_trees:
        raise SystemExit("data/trees-all/ 是空的，先跑 python scripts/build_data.py")

    today = date.today().isoformat()
    OUT_DIR.mkdir(exist_ok=True)
    guardians = {}
    index = []
    for region in REGIONS:
        trees = [t for t in all_trees if in_region(t, region)]
        trees.sort(key=lambda t: t["id"])
        if "center" not in region:
            region["center"] = {
                "lat": round(sum(t["lat"] for t in trees) / len(trees), 6),
                "lng": round(sum(t["lng"] for t in trees) / len(trees), 6),
            }
        # 跟 trees-all 一樣一棵樹存成一列陣列，檔案比較小
        path = OUT_DIR / f"{region['id']}.json"
        path.write_text(
            json.dumps(
                {
                    "meta": {
                        "dataType": "真實開放資料",
                        "source": "臺北市行道樹及公園樹木分布圖 https://data.gov.tw/dataset/128274",
                        "license": "政府資料開放授權條款 https://data.gov.tw/license",
                        "note": "座標已由 TWD97 轉成 WGS84。ageEstimated 依胸徑粗估，不是原始欄位。",
                        "region": region["id"],
                        "generatedAt": today,
                    },
                    "fields": ALL_FIELDS,
                    "rows": [[t[k] for k in ALL_FIELDS] for t in trees],
                },
                ensure_ascii=False,
                separators=(",", ":"),
            ),
            encoding="utf-8",
        )
        guardians.update({t["id"]: mock_guardians_for(t, {}) for t in trees})
        index.append({**region, "count": len(trees)})
        print(f"{region['name']}：{len(trees)} 棵，{path.stat().st_size // 1024} KB")

    (OUT_DIR / "index.json").write_text(
        json.dumps(
            {
                "meta": {
                    "note": "comments 是「市長，你給我聽好了」種樹相關留言裡提到這個地點的則數，來自 01_種樹痛點儀表板.html；樹木是臺北市行道樹開放資料。",
                    "generatedAt": today,
                },
                "regions": index,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    OUT_GUARDIANS.write_text(
        json.dumps(
            {
                "meta": {
                    "dataType": "模擬資料",
                    "note": "切換區域收錄的樹的守護人數，是依樹號產生的假數字，不是真實使用者。算法和 mock_guardians.json 相同。",
                    "generatedAt": today,
                },
                "guardians": guardians,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    print(f"mock_guardians_regions.json：{len(guardians)} 棵，{OUT_GUARDIANS.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()

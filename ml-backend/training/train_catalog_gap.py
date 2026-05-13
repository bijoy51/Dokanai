"""Mine catalog-gap and complementary-product rules.

Inputs:
    datasets/synthetic/shops.csv + shop_catalogs.csv  -- which product_types each shop carries
    datasets/processed/baskets.csv                    -- Online Retail baskets (optional)

Outputs:
    artifacts/catalog_gap_rules.pkl   -- {shop_type: [{product_type, support, reason}]}
    artifacts/complementary_pairs.json -- {product_type: [paired_product_types]}
"""
from __future__ import annotations

import json
import pickle
from collections import Counter, defaultdict
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
ARTIFACTS = ROOT / "artifacts"
ARTIFACTS.mkdir(exist_ok=True)


def per_shop_type_support(shops: pd.DataFrame, catalogs: pd.DataFrame) -> dict:
    joined = catalogs.merge(shops[["shop_id", "shop_type"]], on="shop_id", how="left")
    out: dict = {}
    for st, grp in joined.groupby("shop_type"):
        n_shops = grp["shop_id"].nunique()
        counts = grp.groupby("product_type")["shop_id"].nunique()
        items = []
        for pt, n in counts.items():
            support = float(n / n_shops)
            if support >= 0.3:  # common-enough items
                items.append({
                    "product_type": pt,
                    "support": round(support, 2),
                    "reason": f"carried by {int(support * 100)}% of similar shops",
                })
        items.sort(key=lambda r: r["support"], reverse=True)
        out[st] = items
    return out


def mine_complementary(baskets_path: Path, min_count: int = 30) -> dict:
    if not baskets_path.exists():
        return {}
    df = pd.read_csv(baskets_path)
    if "invoice_id" not in df.columns or "product" not in df.columns:
        return {}
    pairs: Counter = Counter()
    item_counts: Counter = Counter()
    for inv, grp in df.groupby("invoice_id"):
        items = sorted(set(p.strip().lower() for p in grp["product"].dropna()))
        item_counts.update(items)
        for i in range(len(items)):
            for j in range(i + 1, min(i + 6, len(items))):  # cap fan-out
                pairs[(items[i], items[j])] += 1

    comp: dict = defaultdict(list)
    for (a, b), c in pairs.items():
        if c < min_count:
            continue
        # confidence(a -> b)
        ca = item_counts[a]
        if ca and c / ca > 0.1:
            comp[a].append(b)
        cb = item_counts[b]
        if cb and c / cb > 0.1:
            comp[b].append(a)

    return {k: v[:5] for k, v in comp.items()}


def main() -> None:
    shops = pd.read_csv(ROOT / "datasets" / "synthetic" / "shops.csv")
    catalogs = pd.read_csv(ROOT / "datasets" / "synthetic" / "shop_catalogs.csv")
    rules = per_shop_type_support(shops, catalogs)

    with open(ARTIFACTS / "catalog_gap_rules.pkl", "wb") as fh:
        pickle.dump(rules, fh)
    print(f"wrote catalog_gap_rules.pkl with {sum(len(v) for v in rules.values())} entries")

    comp = mine_complementary(ROOT / "datasets" / "processed" / "baskets.csv")
    (ARTIFACTS / "complementary_pairs.json").write_text(json.dumps(comp, indent=2))
    print(f"wrote complementary_pairs.json with {len(comp)} keys")


if __name__ == "__main__":
    main()

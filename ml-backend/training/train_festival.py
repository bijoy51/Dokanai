"""Fit per-(shop_type, festival, category) demand uplift coefficients.

The uplift for a festival is the ratio of demand inside its lead-window to a
baseline window outside any festival. Saved as artifacts/festival_uplift.json
and consumed by app.models.festival.FestivalDemandModel.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd

from app.data.festivals import FESTIVALS

ROOT = Path(__file__).resolve().parent.parent
ARTIFACTS = ROOT / "artifacts"
ARTIFACTS.mkdir(exist_ok=True)

# Map product_type prefixes/keywords to the festival-boost categories used by the calendar.
def to_category(product_type: str) -> str:
    p = product_type.lower()
    if any(k in p for k in ["saree", "panjabi", "kurti", "shirt", "frock", "blouse",
                            "hijab", "shawl", "jacket", "trouser", "salwar", "lehenga"]):
        return "clothing"
    if any(k in p for k in ["perfume", "attar", "lipstick", "serum", "kajal", "henna",
                            "moisturizer", "spray", "compact", "foundation"]):
        return "beauty"
    if any(k in p for k in ["dates", "rice", "oil", "dal", "sweet", "hilsa", "tea",
                            "honey", "spice", "chickpea", "iftar"]):
        return "food"
    if any(k in p for k in ["bedsheet", "blanket", "pillow", "knife", "curtain",
                            "mat", "container", "doormat", "freezer"]):
        return "home"
    return "clothing"


def in_window(d, fest_date, lead_days):
    d = d.date() if hasattr(d, "date") else d
    delta = (fest_date - d).days
    return 0 <= delta <= lead_days


def main() -> None:
    sales_path = ROOT / "datasets" / "synthetic" / "shop_sales.csv"
    shops_path = ROOT / "datasets" / "synthetic" / "shops.csv"
    if not sales_path.exists() or not shops_path.exists():
        raise SystemExit("synthetic data missing — run training.generate_synthetic first.")
    sales = pd.read_csv(sales_path)
    shops = pd.read_csv(shops_path)
    sales = sales.merge(shops[["shop_id", "shop_type"]], on="shop_id", how="left")
    sales["date"] = pd.to_datetime(sales["date"])
    sales["category"] = sales["product_type"].map(to_category)

    # baseline = daily mean demand far from any festival window
    fest_windows = []
    for f in FESTIVALS:
        fd = datetime.strptime(f.date, "%Y-%m-%d").date()
        fest_windows.append((fd - timedelta(days=f.lead_days), fd))

    def in_any_window(d):
        d = d.date()
        return any(start <= d <= end for start, end in fest_windows)

    sales["in_fest_window"] = sales["date"].apply(in_any_window)

    baseline = (sales[~sales["in_fest_window"]]
                .groupby(["shop_type", "category"])["qty"].mean()
                .rename("baseline").reset_index())

    uplift = {}
    for f in FESTIVALS:
        fd = datetime.strptime(f.date, "%Y-%m-%d").date()
        mask = sales["date"].apply(lambda d: in_window(d, fd, f.lead_days))
        window = sales[mask]
        if window.empty:
            continue
        win_mean = (window.groupby(["shop_type", "category"])["qty"].mean()
                          .rename("win").reset_index())
        merged = win_mean.merge(baseline, on=["shop_type", "category"], how="inner")
        merged["uplift"] = (merged["win"] / merged["baseline"]).round(2)
        for _, row in merged.iterrows():
            uplift.setdefault(row["shop_type"], {}).setdefault(f.id, {})[row["category"]] = float(row["uplift"])

    (ARTIFACTS / "festival_uplift.json").write_text(json.dumps(uplift, indent=2))
    print(f"wrote festival_uplift.json with {sum(len(v) for v in uplift.values())} festival entries")


if __name__ == "__main__":
    main()

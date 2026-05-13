"""Compute market-wide trending lists per shop type and write the cache.

Output: artifacts/trends_cache.json
    {
      "<shop_type>": {
        "up":   [{"product_type": "...", "momentum": 0.31}, ...],
        "down": [...],
        "as_of": "YYYY-MM-DD"
      },
      ...
    }

Designed to run on a daily/weekly cron. The backend's TrendDetector reads this
file on startup and via POST /admin/refresh-trends.
"""
from __future__ import annotations

import json
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
ARTIFACTS = ROOT / "artifacts"
ARTIFACTS.mkdir(exist_ok=True)


def main(window_days: int = 30) -> None:
    sales_path = ROOT / "datasets" / "synthetic" / "shop_sales.csv"
    shops_path = ROOT / "datasets" / "synthetic" / "shops.csv"
    if not sales_path.exists() or not shops_path.exists():
        raise SystemExit("synthetic data missing — run training.generate_synthetic first.")
    sales = pd.read_csv(sales_path)
    shops = pd.read_csv(shops_path)
    sales = sales.merge(shops[["shop_id", "shop_type"]], on="shop_id", how="left")
    sales["date"] = pd.to_datetime(sales["date"])

    today = sales["date"].max().date()
    recent_start = today - timedelta(days=window_days - 1)
    prior_start = recent_start - timedelta(days=window_days)
    prior_end = recent_start - timedelta(days=1)

    out: dict = {}
    for st, grp in sales.groupby("shop_type"):
        recent = grp[(grp["date"].dt.date >= recent_start) & (grp["date"].dt.date <= today)]
        prior = grp[(grp["date"].dt.date >= prior_start) & (grp["date"].dt.date <= prior_end)]
        r = recent.groupby("product_type")["qty"].sum()
        p = prior.groupby("product_type")["qty"].sum()
        all_keys = set(r.index) | set(p.index)
        rows = []
        for k in all_keys:
            rv = int(r.get(k, 0))
            pv = int(p.get(k, 0))
            if rv + pv < 10:
                continue
            momentum = (rv - pv) / max(pv, 1)
            rows.append((k, round(momentum, 2)))
        rows.sort(key=lambda x: x[1], reverse=True)
        up = [{"product_type": k, "momentum": m} for k, m in rows[:8] if m > 0.1]
        down = [{"product_type": k, "momentum": m} for k, m in reversed(rows[-8:]) if m < -0.1]
        out[st] = {"up": up, "down": down, "as_of": today.isoformat()}

    (ARTIFACTS / "trends_cache.json").write_text(json.dumps(out, indent=2))
    print(f"wrote trends_cache.json with {sum(len(v.get('up', [])) + len(v.get('down', [])) for v in out.values())} entries")


if __name__ == "__main__":
    main()

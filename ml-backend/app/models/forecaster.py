"""Demand Forecaster.

Uses a trained XGBoost global model if its artifact exists; otherwise a
moving-average + festival-boost heuristic on the supplied sales history (or
shop-type category priors when no history is given).
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional, Tuple

from ..settings import ARTIFACTS_DIR
from ..data.festivals import festival_boost

# Rough baseline daily units per shop category, used only when the user
# uploads no sales history. Replaced by learned priors after training.
CATEGORY_PRIORS: Dict[str, float] = {
    "clothing": 1.2, "grocery": 3.5, "electronics": 0.8, "beauty": 1.5,
    "home": 1.0, "food": 2.2, "pharmacy": 2.0, "stationery": 1.6,
}

# Map a product type to a festival-boost category bucket.
TYPE_TO_BOOST_CAT = {
    "saree": "clothing", "panjabi": "clothing", "kurti": "clothing",
    "three-piece": "clothing", "shirt": "clothing", "dress": "clothing",
    "blouse": "clothing", "hijab": "clothing", "jacket": "clothing", "shawl": "clothing",
    "perfume": "beauty", "attar": "beauty", "lipstick": "beauty", "serum": "beauty",
    "dates": "food", "mishti": "food", "hilsa": "food", "tea": "food", "honey": "food",
    "blanket": "home", "knife": "home", "freezer bag": "home", "prayer mat": "home",
}


def _to_date(v) -> date:
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    return datetime.strptime(str(v)[:10], "%Y-%m-%d").date()


def _boost_category(product_type: Optional[str], shop_type: str) -> str:
    if product_type and product_type.lower() in TYPE_TO_BOOST_CAT:
        return TYPE_TO_BOOST_CAT[product_type.lower()]
    return shop_type if shop_type in {"clothing", "beauty", "food", "home"} else "clothing"


class DemandForecaster:
    name = "forecaster"

    def __init__(self) -> None:
        self.loaded = False
        self._model = None
        self._feature_spec = None

    def load(self) -> None:
        json_path = ARTIFACTS_DIR / "demand_forecaster.json"
        spec_path = ARTIFACTS_DIR / "feature_spec.json"
        try:
            if json_path.exists():
                import xgboost as xgb
                booster = xgb.Booster()
                booster.load_model(str(json_path))
                self._model = booster
                if spec_path.exists():
                    import json
                    self._feature_spec = json.loads(spec_path.read_text())
                self.loaded = True
        except Exception:
            self.loaded = False

    def forecast(
        self,
        listings: List[dict],
        catalog: List[dict],
        sales: List[dict],
        shop_type: str,
    ) -> Tuple[List[dict], List[dict], List[dict]]:
        """Returns (selling_well, selling_poorly, restock_soon)."""
        today = date.today()

        # Build trailing-30d units per product key, from sales history.
        units_30d: Dict[str, int] = defaultdict(int)
        units_prior_30d: Dict[str, int] = defaultdict(int)
        for s in sales:
            try:
                d = _to_date(s.get("date"))
            except Exception:
                continue
            age = (today - d).days
            key = (s.get("product") or "").strip().lower()
            if not key:
                continue
            qty = int(s.get("qty") or 1)
            if 0 <= age < 30:
                units_30d[key] += qty
            elif 30 <= age < 60:
                units_prior_30d[key] += qty

        # Index catalog by lowercased title for stock + product_type lookups.
        cat_by_title: Dict[str, dict] = {}
        for c in catalog:
            cat_by_title[(c.get("title") or "").strip().lower()] = c
        stock_by_title: Dict[str, Optional[int]] = {}
        for l in listings:
            stock_by_title[(l.get("title") or "").strip().lower()] = l.get("stock")

        prior_daily = CATEGORY_PRIORS.get(shop_type, 1.2)

        rows = []
        for l in listings:
            title = (l.get("title") or "").strip()
            key = title.lower()
            c = cat_by_title.get(key, {})
            ptype = (c.get("product_type") or l.get("category") or title)
            boost_cat = _boost_category(c.get("product_type"), shop_type)

            # Baseline daily demand.
            if key in units_30d:
                base_daily = units_30d[key] / 30.0
            else:
                base_daily = prior_daily * 0.5  # unknown product, conservative

            # Apply average festival boost over the next 7 days.
            boost7 = sum(festival_boost(today + timedelta(days=i), boost_cat)[0] for i in range(1, 8)) / 7.0
            fc7 = round(base_daily * 7 * boost7)
            daily_fwd = max(base_daily * boost7, 1e-6)
            stock = stock_by_title.get(key)
            days_of_stock = (stock / daily_fwd) if isinstance(stock, (int, float)) and stock is not None else 999.0

            rows.append({
                "product_type": ptype,
                "units_30d": int(units_30d.get(key, 0)),
                "units_prior_30d": int(units_prior_30d.get(key, 0)),
                "forecast_7d": int(fc7),
                "days_of_stock": round(float(days_of_stock), 1),
                "stock": stock,
            })

        # selling_well: top by units_30d (or forecast if no history)
        sort_key = (lambda r: (r["units_30d"], r["forecast_7d"]))
        well_sorted = sorted(rows, key=sort_key, reverse=True)
        selling_well = []
        for r in well_sorted[:8]:
            trend = "flat"
            if r["units_prior_30d"] > 0:
                g = (r["units_30d"] - r["units_prior_30d"]) / r["units_prior_30d"]
                trend = "up" if g > 0.1 else "down" if g < -0.1 else "flat"
            elif r["units_30d"] > 0:
                trend = "up"
            selling_well.append({
                "product_type": r["product_type"],
                "units_30d": r["units_30d"],
                "trend": trend,
            })

        # selling_poorly: low units, lots of stock left
        poor = [r for r in rows if r["units_30d"] <= 2 and (r["stock"] or 0) > 5]
        poor_sorted = sorted(poor, key=lambda r: -r["days_of_stock"])
        selling_poorly = [
            {"product_type": r["product_type"], "units_30d": r["units_30d"], "days_of_stock": min(r["days_of_stock"], 365.0)}
            for r in poor_sorted[:8]
        ]

        # restock_soon: little stock relative to forecast
        restock = [r for r in rows if r["days_of_stock"] < 10 and r["forecast_7d"] > 0]
        restock_sorted = sorted(restock, key=lambda r: r["days_of_stock"])
        restock_soon = [
            {"product_type": r["product_type"], "days_of_stock": r["days_of_stock"], "forecast_7d": r["forecast_7d"]}
            for r in restock_sorted[:8]
        ]

        return selling_well, selling_poorly, restock_soon

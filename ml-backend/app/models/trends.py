"""Trend Detector.

Serves a cached trends file (trends_cache.json) refreshed by training/refresh_trends.py.
If the cache is absent, derives trends from the uploaded sales history, or falls
back to a season-aware default list per shop type.
"""
from __future__ import annotations

import json
from collections import defaultdict
from datetime import date, datetime
from typing import Dict, List, Optional

from ..settings import ARTIFACTS_DIR

# Season-aware defaults used only when there is no cache and no sales history.
SEASONAL_TRENDS: Dict[str, Dict[str, List[tuple]]] = {
    # month-bucket -> shop_type -> [(product_type, momentum)]
    "ramadan_eid": {
        "clothing": [("pastel three-piece", 0.34), ("embroidered panjabi", 0.28), ("kids Eid frock", 0.22)],
        "beauty": [("attar perfume", 0.31), ("henna cones", 0.19)],
        "food": [("premium dates", 0.4), ("iftar snack boxes", 0.27)],
    },
    "boishakh": {
        "clothing": [("red-and-white saree", 0.3), ("cotton panjabi", 0.21)],
        "food": [("hilsa fish", 0.33), ("traditional sweets", 0.18)],
    },
    "winter": {
        "clothing": [("woolen shawl", 0.29), ("winter jacket", 0.24), ("warm caps", 0.17)],
        "home": [("blanket", 0.26)],
    },
    "default": {
        "clothing": [("casual kurti", 0.12), ("graphic t-shirt", 0.09)],
        "grocery": [("instant noodles", 0.1)],
        "electronics": [("bluetooth earbuds", 0.14), ("smartwatch", 0.11)],
        "beauty": [("face serum", 0.13)],
        "home": [("kitchen storage set", 0.08)],
        "food": [("specialty tea", 0.07)],
        "pharmacy": [("vitamin supplements", 0.1)],
        "stationery": [("art supplies", 0.06)],
    },
}

DOWN_DEFAULT: Dict[str, List[tuple]] = {
    "clothing": [("heavy bridal lehenga", -0.16), ("formal blazer", -0.09)],
    "electronics": [("wired earphones", -0.18)],
    "beauty": [("compact powder", -0.07)],
}


def _to_date(v) -> date:
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    return datetime.strptime(str(v)[:10], "%Y-%m-%d").date()


def _season_bucket(today: Optional[date] = None) -> str:
    today = today or date.today()
    m = today.month
    if m in (2, 3):
        return "ramadan_eid"
    if m == 4:
        return "boishakh"
    if m in (12, 1):
        return "winter"
    return "default"


class TrendDetector:
    name = "trends"

    def __init__(self) -> None:
        self.loaded = False
        self._cache: Optional[dict] = None  # {shop_type: {"up": [...], "down": [...], "as_of": "..."}}

    def load(self) -> None:
        path = ARTIFACTS_DIR / "trends_cache.json"
        try:
            if path.exists():
                self._cache = json.loads(path.read_text())
                self.loaded = True
        except Exception:
            self.loaded = False

    def for_shop_type(self, shop_type: str) -> dict:
        if self._cache and shop_type in self._cache:
            entry = self._cache[shop_type]
            return {
                "up": entry.get("up", []),
                "down": entry.get("down", []),
                "as_of": entry.get("as_of", date.today().isoformat()),
            }
        return self._seasonal_default(shop_type)

    def from_sales(self, shop_type: str, sales: List[dict]) -> dict:
        """Recent-30d vs prior-30d growth per product, if enough history exists."""
        if not sales:
            return self._seasonal_default(shop_type)
        today = date.today()
        recent: Dict[str, int] = defaultdict(int)
        prior: Dict[str, int] = defaultdict(int)
        for s in sales:
            try:
                d = _to_date(s.get("date"))
            except Exception:
                continue
            age = (today - d).days
            key = (s.get("product") or "").strip()
            if not key:
                continue
            qty = int(s.get("qty") or 1)
            if 0 <= age < 30:
                recent[key] += qty
            elif 30 <= age < 60:
                prior[key] += qty
        if not recent and not prior:
            return self._seasonal_default(shop_type)
        scored = []
        for k in set(list(recent) + list(prior)):
            r, p = recent.get(k, 0), prior.get(k, 0)
            if r + p < 3:
                continue
            momentum = (r - p) / max(p, 1)
            scored.append((k, round(momentum, 2)))
        scored.sort(key=lambda x: x[1], reverse=True)
        up = [{"product_type": k, "momentum": m} for k, m in scored if m > 0.1][:6]
        down = [{"product_type": k, "momentum": m} for k, m in reversed(scored) if m < -0.1][:6]
        if not up and not down:
            return self._seasonal_default(shop_type)
        return {"up": up, "down": down, "as_of": today.isoformat()}

    @staticmethod
    def _seasonal_default(shop_type: str) -> dict:
        bucket = _season_bucket()
        up_table = SEASONAL_TRENDS.get(bucket, {}).get(shop_type) or SEASONAL_TRENDS["default"].get(shop_type, [])
        if not up_table:
            up_table = SEASONAL_TRENDS["default"].get("clothing", [])
        down_table = DOWN_DEFAULT.get(shop_type, [])
        return {
            "up": [{"product_type": k, "momentum": m} for k, m in up_table],
            "down": [{"product_type": k, "momentum": m} for k, m in down_table],
            "as_of": date.today().isoformat(),
        }

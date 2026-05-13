"""Festival Demand model.

Loads learned per-(shop_type, category, festival) uplift coefficients from
festival_uplift.json if present; otherwise uses the calendar's built-in
peak-boost values. Either way, returns the upcoming festivals plus advice.
"""
from __future__ import annotations

import json
from typing import List, Optional

from ..settings import ARTIFACTS_DIR
from ..data.festivals import upcoming_festivals


class FestivalDemandModel:
    name = "festival"

    def __init__(self) -> None:
        self.loaded = False
        self._uplift: Optional[dict] = None  # {shop_type: {festival_id: {category: multiplier}}}

    def load(self) -> None:
        path = ARTIFACTS_DIR / "festival_uplift.json"
        try:
            if path.exists():
                self._uplift = json.loads(path.read_text())
                self.loaded = True
        except Exception:
            self.loaded = False

    def outlook(self, shop_type: str, days: int = 75) -> List[dict]:
        out = []
        for f in upcoming_festivals(days=days):
            uplift = f.peak_boost
            if self._uplift:
                by_shop = self._uplift.get(shop_type) or {}
                by_fest = by_shop.get(f.id) or {}
                if by_fest:
                    # use the strongest learned multiplier among this shop's relevant categories
                    uplift = max(by_fest.values())
            out.append({
                "festival": f.name,
                "date": f.date,
                "advice": f.advice,
                "expected_uplift": round(float(uplift), 2),
                "categories": list(f.categories),
            })
        return out

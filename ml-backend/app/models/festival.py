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
                    learned = max(by_fest.values())
                    # Trust the learned coefficient only when it shows a clear
                    # lift over baseline. If a festival's lead window falls
                    # near the edge of the training data (so we have only a
                    # day or two of "festival" rows), the mined uplift
                    # collapses to ~1.0 even though demand actually spikes.
                    # In that case the calendar's hand-set peak_boost is a
                    # better signal than a degenerate learned one.
                    if learned >= 1.15:
                        uplift = learned
            out.append({
                "festival": f.name,
                "date": f.date,
                "advice": f.advice,
                "expected_uplift": round(float(uplift), 2),
                "categories": list(f.categories),
            })
        return out

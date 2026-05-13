"""Catalog-Gap / Missing-Goods recommender.

Loads mined association rules (catalog_gap_rules.pkl) and complementary pairs
if available. Without them, uses a curated benchmark of product types that a
well-stocked shop of each type typically carries, plus a small set of
complementary-product rules.
"""
from __future__ import annotations

import pickle
from typing import Dict, List, Optional

from ..settings import ARTIFACTS_DIR

# Curated "typical assortment" per shop type, with an approximate share of
# similar shops that carry each item. Replaced by mined rules after training.
BENCHMARK: Dict[str, List[tuple]] = {
    "clothing": [
        ("matching blouse", 0.82, "complements sarees, frequently bought together"),
        ("petticoat", 0.74, "almost always paired with sarees"),
        ("kids festive wear", 0.68, "high demand around Eid and Puja"),
        ("men's formal shoes", 0.55, "cross-sells with panjabi and shirts"),
        ("gift wrapping / hampers", 0.49, "lifts average order value during festivals"),
        ("bridal collection", 0.41, "high-margin seasonal line"),
        ("winter caps & mufflers", 0.46, "captures Dec-Feb demand"),
    ],
    "grocery": [
        ("packaged snacks", 0.85, "impulse buys at checkout"),
        ("cooking ghee", 0.62, "spikes around Eid-ul-Adha"),
        ("powdered milk", 0.71, "staple, steady repeat sales"),
        ("dish & laundry soap", 0.78, "frequently restocked household item"),
        ("instant noodles", 0.69, "fast-moving low-cost item"),
    ],
    "electronics": [
        ("phone screen protectors", 0.8, "high-margin accessory, easy attach-sell"),
        ("USB wall adapters", 0.66, "complements cables and phones"),
        ("bluetooth speakers", 0.52, "popular gift item"),
        ("power strips / extension boards", 0.58, "steady household demand"),
        ("memory cards", 0.49, "attach-sells with phones and cameras"),
    ],
    "beauty": [
        ("sunscreen", 0.6, "year-round demand, rising awareness"),
        ("makeup remover", 0.55, "complements foundation and lipstick"),
        ("hair masks / treatments", 0.48, "upsell from hair oil and shampoo"),
        ("nail polish sets", 0.5, "festive impulse buy"),
        ("men's grooming kits", 0.43, "growing segment"),
    ],
    "home": [
        ("kitchen storage containers", 0.66, "steady household demand"),
        ("table runners & napkins", 0.45, "festive home decor"),
        ("door mats", 0.58, "low-cost frequent replacement"),
        ("hangers & organizers", 0.62, "complements bedsheets and curtains"),
        ("LED night lamps", 0.4, "popular gift and decor item"),
    ],
    "food": [
        ("dry fruits & nuts", 0.7, "spikes during Ramadan"),
        ("packaged spices", 0.64, "complements rice and groceries"),
        ("ready-to-cook mixes", 0.5, "convenience trend"),
        ("specialty teas", 0.46, "higher-margin variants"),
        ("dessert / iftar boxes", 0.55, "seasonal high-volume item"),
    ],
    "pharmacy": [
        ("first-aid kits", 0.6, "household essential"),
        ("vitamin & mineral supplements", 0.72, "growing wellness demand"),
        ("baby care products", 0.58, "steady repeat purchases"),
        ("blood-pressure monitors", 0.38, "high-margin device"),
        ("hand sanitizers", 0.66, "year-round demand"),
    ],
    "stationery": [
        ("school exercise books in bulk", 0.8, "seasonal volume around term start"),
        ("art & craft supplies", 0.5, "higher-margin add-on"),
        ("printer paper reams", 0.6, "office demand"),
        ("calculators", 0.45, "exam-season demand"),
        ("backpacks & pencil cases", 0.55, "cross-sells with school supplies"),
    ],
}

COMPLEMENTARY = {
    "saree": ["matching blouse", "petticoat"],
    "panjabi": ["pajama", "men's sandals"],
    "shirt": ["trousers", "belt"],
    "burger": ["cold drink", "fries"],
    "rice": ["cooking oil", "lentils"],
    "phone charger": ["usb cable", "phone case"],
}


class CatalogGapRecommender:
    name = "catalog_gap"

    def __init__(self) -> None:
        self.loaded = False
        self._rules: Optional[dict] = None
        self._complementary: Optional[dict] = None

    def load(self) -> None:
        rules_path = ARTIFACTS_DIR / "catalog_gap_rules.pkl"
        comp_path = ARTIFACTS_DIR / "complementary_pairs.json"
        try:
            if rules_path.exists():
                with open(rules_path, "rb") as fh:
                    self._rules = pickle.load(fh)
                self.loaded = True
            if comp_path.exists():
                import json
                self._complementary = json.loads(comp_path.read_text())
        except Exception:
            self.loaded = False

    def recommend(self, shop_type: str, catalog: List[dict]) -> List[dict]:
        present = set()
        for c in catalog:
            for v in (c.get("product_type"), c.get("garment_type"), c.get("title")):
                if v:
                    present.add(str(v).lower())
        present_text = " | ".join(present)

        out: List[dict] = []

        # Mined rules take priority when available.
        rules = (self._rules or {}).get(shop_type) if self._rules else None
        if rules:
            for item in rules:  # expect list of {"product_type","support","reason"}
                pt = str(item.get("product_type", "")).lower()
                if pt and pt not in present_text:
                    out.append({
                        "product_type": item.get("product_type"),
                        "carried_by_similar_pct": round(float(item.get("support", 0.5)), 2),
                        "reason": item.get("reason", "common in similar shops"),
                    })
        else:
            for name, pct, reason in BENCHMARK.get(shop_type, []):
                key_words = name.split("/")[0].strip().lower()
                if key_words not in present_text:
                    out.append({
                        "product_type": name,
                        "carried_by_similar_pct": round(float(pct), 2),
                        "reason": reason,
                    })

        # Complementary-product suggestions based on what the shop already stocks.
        comp_table = self._complementary or COMPLEMENTARY
        seen = {o["product_type"].lower() for o in out}
        for c in catalog:
            base = (c.get("product_type") or c.get("garment_type") or "").lower()
            for comp in comp_table.get(base, []):
                if comp.lower() not in present_text and comp.lower() not in seen:
                    out.append({
                        "product_type": comp,
                        "carried_by_similar_pct": 0.6,
                        "reason": f"complements the {base} you already stock",
                    })
                    seen.add(comp.lower())

        return out[:10]

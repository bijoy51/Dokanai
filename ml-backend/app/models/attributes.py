"""Attribute Extractor.

Heuristic regex + gazetteer extraction by default. If a trained NER artifact
(spaCy model dir or ONNX token classifier) exists, it augments the result.
"""
from __future__ import annotations

import re
from typing import List, Optional

from ..settings import ARTIFACTS_DIR

COLORS = [
    "red", "blue", "green", "black", "white", "yellow", "pink", "purple",
    "orange", "brown", "grey", "gray", "maroon", "navy", "beige", "cream",
    "gold", "golden", "silver", "pastel", "magenta", "olive", "teal",
    "lal", "shada", "kalo", "nil", "shobuj",
]
MATERIALS = [
    "cotton", "silk", "linen", "georgette", "chiffon", "denim", "wool",
    "woolen", "polyester", "viscose", "rayon", "khadi", "jamdani", "muslin",
    "leather", "synthetic",
]
GARMENTS = {
    "saree": ["saree", "shari", "sari", "jamdani"],
    "panjabi": ["panjabi", "punjabi"],
    "kurti": ["kurti", "kurta", "anarkali"],
    "three-piece": ["three-piece", "threepiece", "three piece", "salwar", "shalwar"],
    "shirt": ["shirt", "tshirt", "t-shirt"],
    "pant": ["pant", "trouser", "jeans", "palazzo"],
    "dress": ["dress", "frock", "gown", "lehenga"],
    "blouse": ["blouse"],
    "hijab": ["hijab", "scarf", "abaya", "burka"],
    "jacket": ["jacket", "blazer", "coat"],
    "shawl": ["shawl", "chador", "stole"],
}
OCCASIONS = {
    "festive": ["eid", "puja", "festive", "wedding", "bridal", "party", "boishakh"],
    "casual": ["casual", "daily", "everyday", "regular"],
    "formal": ["formal", "office", "corporate"],
    "winter": ["winter", "warm", "woolen"],
}
SIZE_RE = re.compile(r"\b(xxl|xl|xs|s|m|l)\b|\bsize\s*[:\-]?\s*(\d{1,2})\b", re.IGNORECASE)
# A small known-brand gazetteer; extend during training from catalog data.
BRANDS = [
    "aarong", "yellow", "ecstasy", "richman", "sailor", "le reve", "kay kraft",
    "rang bangladesh", "infinity", "cats eye", "easy", "twelve", "artisti",
]


class AttributeExtractor:
    name = "attributes"

    def __init__(self) -> None:
        self.loaded = False
        self._nlp = None
        # Mined gazetteers from training/train_attributes.py override the
        # hardcoded base lists when the artifact is present.
        self._brands = BRANDS
        self._colors = COLORS
        self._materials = MATERIALS
        self._garments = GARMENTS
        self._occasions = OCCASIONS

    def load(self) -> None:
        # Preferred artifact: a JSON gazetteer mined from labeled product data.
        gaz_path = ARTIFACTS_DIR / "attribute_gazetteer.json"
        if gaz_path.exists():
            try:
                import json
                data = json.loads(gaz_path.read_text(encoding="utf-8"))
                if isinstance(data.get("brands"), list):
                    self._brands = data["brands"]
                if isinstance(data.get("colors"), list):
                    self._colors = data["colors"]
                if isinstance(data.get("materials"), list):
                    self._materials = data["materials"]
                if isinstance(data.get("garments"), dict):
                    self._garments = data["garments"]
                if isinstance(data.get("occasions"), dict):
                    self._occasions = data["occasions"]
                self.loaded = True
            except Exception:
                self.loaded = False

        # Optional richer NER model if someone trains one later.
        spacy_dir = ARTIFACTS_DIR / "attribute_extractor"
        try:
            if spacy_dir.exists():
                import spacy
                self._nlp = spacy.load(str(spacy_dir))
                self.loaded = True
        except Exception:
            # leave self.loaded as set by the gazetteer branch
            pass

    def extract(self, listing: dict) -> dict:
        title = (listing.get("title") or "")
        desc = (listing.get("description") or "")
        text = f"{title} {desc}".strip()
        low = text.lower()

        garment = self._first_match(low, self._garments)
        occasion = self._first_match(low, self._occasions)
        color = next((c for c in self._colors if re.search(rf"\b{re.escape(c)}\b", low)), None)
        material = next((m for m in self._materials if re.search(rf"\b{re.escape(m)}\b", low)), None)
        brand = next((b for b in self._brands if b in low), None)
        gender = None
        if any(w in low for w in ["women", "ladies", "girl", "woman", "female"]):
            gender = "women"
        elif any(w in low for w in ["men", "gents", "boy", "man", "male"]):
            gender = "men"
        elif any(w in low for w in ["kids", "child", "baby", "boys", "girls"]):
            gender = "kids"
        size = None
        m = SIZE_RE.search(text)
        if m:
            size = (m.group(1) or m.group(2) or "").upper() or None

        price = listing.get("price")
        price_band = None
        if isinstance(price, (int, float)):
            price_band = "low" if price < 600 else "mid" if price < 2500 else "high"

        product_type = garment or self._guess_product_type(low) or (listing.get("category") or None)

        # If a trained NER model is available, let it fill blanks.
        if self.loaded and self._nlp is not None:
            try:
                doc = self._nlp(text)
                for ent in doc.ents:
                    lbl = ent.label_.lower()
                    val = ent.text.strip()
                    if lbl == "brand" and not brand:
                        brand = val
                    elif lbl == "color" and not color:
                        color = val.lower()
                    elif lbl == "material" and not material:
                        material = val.lower()
                    elif lbl in ("product", "product_type") and not product_type:
                        product_type = val.lower()
            except Exception:
                pass

        return {
            "title": title,
            "product_type": product_type,
            "brand": brand,
            "color": color,
            "size": size,
            "material": material,
            "gender": gender,
            "garment_type": garment,
            "occasion": occasion,
            "price_band": price_band,
        }

    @staticmethod
    def _first_match(text: str, table: dict) -> Optional[str]:
        for key, words in table.items():
            if any(w in text for w in words):
                return key
        return None

    @staticmethod
    def _guess_product_type(text: str) -> Optional[str]:
        # last-resort: the most informative non-stopword token in the title
        tokens = re.findall(r"[a-zA-Z]{3,}", text)
        stop = {"the", "and", "for", "with", "new", "best", "pack", "set", "premium", "quality"}
        for tok in tokens:
            if tok.lower() not in stop:
                return tok.lower()
        return None

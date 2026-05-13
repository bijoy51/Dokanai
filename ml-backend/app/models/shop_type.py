"""Shop-Type Classifier.

If a trained artifact is present (TF-IDF+SVM via joblib, or ONNX), it is used.
Otherwise a keyword-vote heuristic classifies the shop from its listings, so the
endpoint is fully functional before any model is trained.
"""
from __future__ import annotations

from collections import Counter
from typing import List, Optional, Tuple

from ..settings import ARTIFACTS_DIR

# Shop types DokanAI recognises.
SHOP_TYPES = [
    "clothing", "grocery", "electronics", "beauty",
    "home", "food", "pharmacy", "stationery",
]

# Keyword gazetteers for the heuristic fallback.
KEYWORDS = {
    "clothing": [
        "saree", "shari", "panjabi", "punjabi", "kurti", "kurta", "shirt", "pant",
        "three-piece", "threepiece", "dress", "frock", "hijab", "burka", "abaya",
        "blouse", "petticoat", "jacket", "shawl", "lehenga", "salwar", "shalwar",
        "fabric", "cloth", "tshirt", "t-shirt", "jeans", "trouser", "scarf", "tops",
    ],
    "grocery": [
        "rice", "chal", "oil", "tel", "dal", "lentil", "sugar", "chini", "salt",
        "atta", "flour", "spice", "moshla", "masala", "onion", "potato", "egg",
        "milk", "powder milk", "soap", "detergent", "noodles", "biscuit",
    ],
    "electronics": [
        "charger", "cable", "earbud", "earphone", "headphone", "power bank",
        "powerbank", "smartwatch", "watch", "bulb", "led", "battery", "adapter",
        "usb", "speaker", "router", "mouse", "keyboard", "phone case", "screen guard",
    ],
    "beauty": [
        "lipstick", "serum", "moisturizer", "cream", "facewash", "face wash",
        "perfume", "attar", "ator", "kajal", "kohl", "henna", "mehedi", "mehndi",
        "hair oil", "shampoo", "conditioner", "foundation", "compact", "nail polish",
        "body spray", "deodorant", "sunscreen",
    ],
    "home": [
        "bedsheet", "bed sheet", "blanket", "kombol", "pillow", "balish", "curtain",
        "porda", "clock", "knife", "freezer bag", "mat", "jaynamaz", "prayer mat",
        "towel", "mug", "plate", "bowl", "cookware", "pan", "bucket",
    ],
    "food": [
        "dates", "khejur", "mishti", "sweets", "hilsa", "ilish", "honey", "modhu",
        "tea", "cha", "coffee", "chola", "chickpea", "biriyani", "iftar", "snack",
        "cake", "chocolate", "juice", "ghee",
    ],
    "pharmacy": [
        "tablet", "capsule", "syrup", "ointment", "paracetamol", "antiseptic",
        "bandage", "thermometer", "mask", "sanitizer", "vitamin", "supplement",
        "first aid", "medicine", "ors", "saline",
    ],
    "stationery": [
        "pen", "pencil", "notebook", "khata", "exercise book", "eraser", "rubber",
        "sharpener", "ruler", "scale", "marker", "highlighter", "file", "folder",
        "glue", "stapler", "paper", "color box", "geometry box",
    ],
}


class ShopTypeClassifier:
    name = "shop_type"

    def __init__(self) -> None:
        self.loaded = False
        self._model = None
        self._vectorizer = None

    def load(self) -> None:
        joblib_path = ARTIFACTS_DIR / "shop_type_clf.joblib"
        onnx_path = ARTIFACTS_DIR / "shop_type_clf.onnx"
        try:
            if joblib_path.exists():
                import joblib  # local import keeps cold-start light
                bundle = joblib.load(joblib_path)
                self._model = bundle["model"]
                self._vectorizer = bundle["vectorizer"]
                self.loaded = True
            elif onnx_path.exists():
                import onnxruntime as ort
                self._model = ort.InferenceSession(str(onnx_path))
                self.loaded = True
        except Exception:
            # Any load failure -> fall back to heuristic, don't crash the service.
            self.loaded = False

    # ----- prediction -----

    def predict(self, listings: List[dict]) -> Tuple[str, float, List[Tuple[str, float]], str]:
        texts = [
            f"{(l.get('title') or '')} {(l.get('description') or '')}".strip().lower()
            for l in listings
        ]
        texts = [t for t in texts if t]
        if not texts:
            return "clothing", 0.5, [], "heuristic"

        if self.loaded and self._vectorizer is not None and self._model is not None:
            try:
                X = self._vectorizer.transform(texts)
                preds = self._model.predict(X)
                counts = Counter(preds)
                total = sum(counts.values())
                ranked = counts.most_common()
                label = str(ranked[0][0])
                conf = ranked[0][1] / total
                alts = [(str(k), v / total) for k, v in ranked[1:4]]
                return label, round(conf, 3), alts, "model"
            except Exception:
                pass  # fall through to heuristic

        return self._heuristic(texts)

    @staticmethod
    def _heuristic(texts: List[str]) -> Tuple[str, float, List[Tuple[str, float]], str]:
        votes: Counter = Counter()
        for t in texts:
            best_type: Optional[str] = None
            best_hits = 0
            for shop_type, words in KEYWORDS.items():
                hits = sum(1 for w in words if w in t)
                if hits > best_hits:
                    best_hits = hits
                    best_type = shop_type
            if best_type:
                votes[best_type] += 1
        if not votes:
            return "clothing", 0.4, [], "heuristic"
        total = sum(votes.values())
        ranked = votes.most_common()
        label = ranked[0][0]
        conf = ranked[0][1] / total
        alts = [(k, round(v / total, 3)) for k, v in ranked[1:4]]
        return label, round(conf, 3), alts, "heuristic"

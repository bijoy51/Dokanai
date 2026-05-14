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
    "jewellery", "footwear", "toys", "books",
    "sports", "baby", "mobile_accessories", "gifts",
    "kitchen", "pet", "religious", "bakery",
]

# Keyword gazetteers for the heuristic fallback.
KEYWORDS = {
    "clothing": [
        "saree", "shari", "panjabi", "punjabi", "kurti", "kurta", "shirt", "pant",
        "three-piece", "threepiece", "dress", "frock", "hijab", "burka", "abaya",
        "blouse", "petticoat", "jacket", "shawl", "lehenga", "salwar", "shalwar",
        "fabric", "cloth", "tshirt", "t-shirt", "jeans", "trouser", "scarf", "tops",
        "cardigan", "lungi", "nightwear",
    ],
    "grocery": [
        "rice", "chal", "oil", "tel", "dal", "lentil", "sugar", "chini", "salt",
        "atta", "flour", "spice", "moshla", "masala", "onion", "potato", "egg",
        "milk", "powder milk", "soap", "detergent", "noodles", "biscuit",
        "mustard oil", "tomato sauce", "ginger paste",
    ],
    "electronics": [
        "charger", "cable", "earbud", "earphone", "headphone", "power bank",
        "powerbank", "smartwatch", "watch", "bulb", "led", "battery", "adapter",
        "usb", "speaker bluetooth", "router", "mouse", "keyboard",
        "memory card", "hdmi", "table lamp", "desk fan",
    ],
    "beauty": [
        "lipstick", "serum", "moisturizer", "cream", "facewash", "face wash",
        "perfume", "attar", "ator", "kajal", "kohl", "henna", "mehedi", "mehndi",
        "hair oil", "shampoo", "conditioner", "foundation", "compact", "nail polish",
        "body spray", "deodorant", "sunscreen", "eyeliner", "mascara", "makeup remover",
    ],
    "home": [
        "bedsheet", "bed sheet", "blanket", "kombol", "pillow", "balish", "curtain",
        "porda", "clock", "freezer bag", "mat", "jaynamaz", "prayer mat",
        "towel", "doormat", "hanger", "dustbin", "drying rack", "ironing board",
    ],
    "food": [
        "dates", "khejur", "mishti", "hilsa", "ilish", "honey", "modhu",
        "tea", "cha", "instant coffee", "chola", "chickpea", "biriyani", "iftar",
        "ghee", "cashew", "dry fruit", "spice mix",
    ],
    "pharmacy": [
        "tablet", "capsule", "syrup", "ointment", "paracetamol", "antiseptic",
        "bandage", "thermometer", "mask", "sanitizer", "vitamin", "supplement",
        "first aid", "medicine", "ors", "saline", "cough syrup", "antacid",
        "nasal spray", "blood pressure monitor",
    ],
    "stationery": [
        "ball pen", "pencil pack", "exercise book", "eraser", "rubber",
        "sharpener", "ruler", "scale", "marker", "highlighter", "file folder",
        "glue stick", "stapler", "a4 paper", "color box", "geometry box",
        "calculator", "pencil case",
    ],
    "jewellery": [
        "gold chain", "silver bracelet", "imitation jewellery", "bangles", "nose ring",
        "anklet", "mangalsutra", "pendant", "toe ring", "ear cuff",
        "bridal jewellery", "pearl necklace", "kundan", "choker", "earring", "ornament",
    ],
    "footwear": [
        "heels", "sandals", "formal shoes", "casual shoes", "sneakers",
        "school shoes", "flip flops", "sports shoes", "running shoes", "leather shoes",
        "canvas shoes", "ankle boots", "ballet flats", "loafers", "shoes pair",
    ],
    "toys": [
        "soft toy", "teddy bear", "educational blocks", "remote control car", "doll",
        "puzzle game", "rubik cube", "learning tablet kids", "toy kitchen",
        "action figure", "rattle", "play doh", "musical toy", "magnetic board",
        "toy car", "toy",
    ],
    "books": [
        "textbook", "novel", "religious book", "storybook", "cookbook",
        "biography", "self help", "science reference", "grammar book",
        "literature", "exam guide", "comic book", "dictionary", "magazine",
    ],
    "sports": [
        "cricket bat", "cricket ball", "football", "yoga mat", "dumbbells",
        "skipping rope", "badminton racket", "table tennis", "helmet bicycle",
        "gym gloves", "water bottle sports", "basketball", "running shorts",
        "sports towel",
    ],
    "baby": [
        "diapers", "baby formula", "baby food", "baby clothes", "baby blanket",
        "baby stroller", "car seat", "baby bath", "baby shampoo", "baby lotion",
        "pacifier", "feeding bottle", "baby walker", "teether",
    ],
    "mobile_accessories": [
        "phone case", "screen protector", "tempered glass", "car phone holder",
        "selfie stick", "car kit bluetooth", "otg cable", "phone stand",
        "ring holder", "airpods case", "phone pouch waterproof", "magnetic phone mount",
        "popsocket", "phone lens",
    ],
    "gifts": [
        "gift hamper", "gift basket", "gift set", "gift box", "gift card",
        "personalized mug", "photo frame gift", "gift wrapping", "gift ribbon",
        "scented candle gift", "greeting card",
    ],
    "kitchen": [
        "non stick pan", "pressure cooker", "mixer grinder", "food processor",
        "gas stove", "cutting board", "measuring cups", "chopping knife",
        "water filter pitcher", "glass jar", "rice cooker", "electric kettle",
        "toaster", "microwave bowl", "silicone spatula",
    ],
    "pet": [
        "dog food", "cat food", "pet shampoo", "pet collar", "pet leash",
        "cat litter", "pet bed", "pet toy", "pet feeding bowl", "fish food",
        "bird cage", "chew bone",
    ],
    "religious": [
        "quran", "gita", "bible", "tasbih", "prayer rug", "topi", "agarbati",
        "diya lamp", "puja thali", "religious calendar", "hajj kit", "janamaz",
    ],
    "bakery": [
        "cake", "birthday cake", "fruit cake", "bread loaf", "bun pack",
        "pastry", "cookies", "donut", "cupcake", "patty", "samosa",
        "rasgulla", "cheesecake", "muffin",
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

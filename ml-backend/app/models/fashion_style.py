"""Fashion Style Classifier + Visual Recommender.

Phase 2 model. If an ONNX classifier + FAISS index + image library are present,
it classifies uploaded photos and retrieves real sample images. Otherwise it
returns a curated, season-aware list of popular styles (with emoji placeholders),
so the clothing-shop experience still works before the vision model is trained.
"""
from __future__ import annotations

import json
from datetime import date
from typing import List, Optional

from ..settings import ARTIFACTS_DIR

# Curated popular styles per season bucket, used when the vision model is absent.
STYLE_BANK = {
    "ramadan_eid": [
        {"label": "Embroidered three-piece", "emoji": "👗", "momentum": 0.31, "note": "top seller in clothing shops before Eid"},
        {"label": "Pastel cotton saree", "emoji": "🥻", "momentum": 0.26, "note": "rising demand for light festive looks"},
        {"label": "Designer panjabi", "emoji": "👔", "momentum": 0.24, "note": "men's Eid staple"},
        {"label": "Kids Eid frock", "emoji": "👶", "momentum": 0.2, "note": "high-volume seasonal line"},
        {"label": "Anarkali kurti", "emoji": "👚", "momentum": 0.18, "note": "popular semi-formal option"},
    ],
    "boishakh": [
        {"label": "Red-and-white saree", "emoji": "🥻", "momentum": 0.3, "note": "the Pohela Boishakh signature look"},
        {"label": "White cotton panjabi", "emoji": "👔", "momentum": 0.22, "note": "men's Boishakh staple"},
        {"label": "Block-print kurti", "emoji": "👚", "momentum": 0.16, "note": "traditional print, strong demand"},
    ],
    "winter": [
        {"label": "Woolen shawl", "emoji": "🧣", "momentum": 0.29, "note": "Dec-Feb essential"},
        {"label": "Quilted winter jacket", "emoji": "🧥", "momentum": 0.24, "note": "best-selling outerwear"},
        {"label": "Knit sweater", "emoji": "🧶", "momentum": 0.19, "note": "steady winter demand"},
    ],
    "default": [
        {"label": "Casual cotton kurti", "emoji": "👚", "momentum": 0.12, "note": "everyday best-seller"},
        {"label": "Graphic t-shirt", "emoji": "👕", "momentum": 0.1, "note": "popular with younger buyers"},
        {"label": "Slim-fit shirt", "emoji": "👔", "momentum": 0.09, "note": "office wear staple"},
        {"label": "Printed three-piece", "emoji": "👗", "momentum": 0.11, "note": "broad appeal year-round"},
    ],
}

# Style adjacency for "similar styles" suggestions in the fallback.
SIMILAR = {
    "Embroidered three-piece": ["Pastel cotton saree", "Anarkali kurti"],
    "Pastel cotton saree": ["Embroidered three-piece", "Block-print kurti"],
    "Designer panjabi": ["White cotton panjabi", "Slim-fit shirt"],
    "Anarkali kurti": ["Casual cotton kurti", "Printed three-piece"],
}


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


class FashionStyleModel:
    name = "fashion_style"

    def __init__(self) -> None:
        self.loaded = False
        self._session = None
        self._labels: Optional[List[str]] = None
        self._faiss = None
        self._library_index: Optional[dict] = None  # label -> [image filenames]
        self._library_dir = ARTIFACTS_DIR / "image_library"

    def load(self) -> None:
        onnx_path = ARTIFACTS_DIR / "fashion_style_clf.onnx"
        labels_path = ARTIFACTS_DIR / "style_labels.json"
        faiss_path = ARTIFACTS_DIR / "style_index.faiss"
        try:
            if onnx_path.exists() and labels_path.exists():
                import onnxruntime as ort
                self._session = ort.InferenceSession(str(onnx_path))
                self._labels = json.loads(labels_path.read_text())
                # Optional: a {label: [filenames]} index for quick retrieval.
                lib_idx = ARTIFACTS_DIR / "image_library_index.json"
                if lib_idx.exists():
                    self._library_index = json.loads(lib_idx.read_text())
                if faiss_path.exists():
                    try:
                        import faiss  # noqa: F401
                        self._faiss = faiss.read_index(str(faiss_path))
                    except Exception:
                        self._faiss = None
                self.loaded = True
        except Exception:
            self.loaded = False

    # ----- context popularity (no image needed) -----

    def popular_styles(self, shop_type: str) -> List[dict]:
        if shop_type != "clothing":
            return []
        bucket = _season_bucket()
        items = STYLE_BANK.get(bucket, STYLE_BANK["default"])
        out = []
        for it in items:
            sample = self._sample_images_for(it["label"])
            out.append({
                "label": it["label"],
                "momentum": it["momentum"],
                "note": it["note"],
                "emoji": it.get("emoji", ""),
                "sample_images": sample,
            })
        return out

    def _sample_images_for(self, label: str) -> List[str]:
        if self._library_index and label in self._library_index:
            files = self._library_index[label][:4]
            return [f"/images/{f}" for f in files]
        return []  # no library yet -> UI shows the emoji placeholder

    # ----- image classification -----

    def classify(self, image_b64: str) -> dict:
        if self.loaded and self._session is not None and self._labels:
            try:
                import base64, io
                import numpy as np
                from PIL import Image

                raw = image_b64.split(",", 1)[1] if "," in image_b64 else image_b64
                img = Image.open(io.BytesIO(base64.b64decode(raw))).convert("RGB").resize((224, 224))
                arr = np.asarray(img, dtype=np.float32) / 255.0
                # standard ImageNet normalisation
                mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
                std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
                arr = (arr - mean) / std
                arr = np.transpose(arr, (2, 0, 1))[None, ...]
                inp_name = self._session.get_inputs()[0].name
                logits = self._session.run(None, {inp_name: arr})[0][0]
                exp = np.exp(logits - logits.max())
                probs = exp / exp.sum()
                top = int(probs.argmax())
                label = self._labels[top] if top < len(self._labels) else "unknown"
                conf = float(probs[top])
                similar = SIMILAR.get(label, [])
                return {
                    "predicted_style": label,
                    "confidence": round(conf, 3),
                    "similar_styles": similar,
                    "trending": label in {s["label"] for s in STYLE_BANK.get(_season_bucket(), [])},
                    "suggestions": [f"stock more {label.lower()} ahead of the next festival"],
                    "method": "model",
                }
            except Exception:
                pass

        # Fallback: pick the top current style and call it the prediction.
        bucket = _season_bucket()
        top = STYLE_BANK.get(bucket, STYLE_BANK["default"])[0]
        return {
            "predicted_style": top["label"],
            "confidence": 0.5,
            "similar_styles": SIMILAR.get(top["label"], []),
            "trending": True,
            "suggestions": [
                f"{top['label']} is trending this season; consider featuring it",
                "upload the fashion-image model to get real per-photo classification",
            ],
            "method": "heuristic",
        }

    def analyze_uploaded(self, images: List[str]) -> List[dict]:
        out = []
        for i, img in enumerate(images[:6]):
            res = self.classify(img)
            out.append({
                "image_index": i,
                "predicted_style": res["predicted_style"],
                "confidence": res["confidence"],
                "trending": res.get("trending", False),
                "suggestions": res.get("suggestions", []),
            })
        return out

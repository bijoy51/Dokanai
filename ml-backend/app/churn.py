"""
Churn prediction service — loads the trained XGBoost model + SHAP
TreeExplainer at startup and exposes a single `predict()` function the
FastAPI router wraps.

Runtime dependencies kept to numpy + joblib + xgboost + shap (no pandas)
so the inference image stays slim and the latency budget stays tight.
"""

from __future__ import annotations

import json
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

import joblib
import numpy as np


ARTIFACT_DIR = Path(__file__).resolve().parent.parent / "artifacts" / "churn"
MODEL_PATH = ARTIFACT_DIR / "model.joblib"
EXPLAINER_PATH = ARTIFACT_DIR / "explainer.joblib"
META_PATH = ARTIFACT_DIR / "meta.json"


@dataclass
class _LoadedModel:
    model: Any
    explainer: Any
    meta: Dict[str, Any]
    category_index: Dict[str, int]


_state: Optional[_LoadedModel] = None
_lock = threading.Lock()


def _load() -> Optional[_LoadedModel]:
    """Lazy-load and cache. Returns None if artifacts don't exist yet
    (i.e. churn_train.py hasn't been run on this host)."""
    global _state
    if _state is not None:
        return _state
    with _lock:
        if _state is not None:
            return _state
        if not (MODEL_PATH.exists() and EXPLAINER_PATH.exists() and META_PATH.exists()):
            return None
        model = joblib.load(MODEL_PATH)
        explainer = joblib.load(EXPLAINER_PATH)
        meta = json.loads(META_PATH.read_text())
        category_index = {c: i for i, c in enumerate(meta["categories_ordered"])}
        _state = _LoadedModel(model=model, explainer=explainer, meta=meta, category_index=category_index)
        return _state


def is_ready() -> bool:
    return _load() is not None


def model_info() -> Dict[str, Any]:
    """Surfaces meta for /health-style diagnostics."""
    s = _load()
    if s is None:
        return {"ready": False, "reason": "churn artifacts not found — run `python -m training.churn_train` first"}
    return {
        "ready": True,
        "model_version": s.meta.get("model_version"),
        "feature_names": s.meta.get("feature_names"),
        "categories": s.meta.get("categories_ordered"),
        "metrics": s.meta.get("metrics"),
        "tier_cutoffs": s.meta.get("tier_cutoffs"),
    }


def _risk_tier(prob: float, cutoffs: Dict[str, float]) -> str:
    if prob < cutoffs.get("low_max", 0.33):
        return "low"
    if prob < cutoffs.get("medium_max", 0.66):
        return "medium"
    return "high"


def _features_to_vector(features: Dict[str, Any], category: str, s: _LoadedModel) -> np.ndarray:
    """
    Caller passes a dict like:
      { "recency_days": 45, "frequency_90d": 3, "monetary": 12000,
        "avg_order_gap_days": 30, "tenure_days": 180, "cancel_rate": 0.0 }
    Plus a `category` string at the top level. We resolve it to the
    numeric index the model was trained with.

    Missing fields default to neutral values so the endpoint is forgiving
    of partial inputs (a fresh shop may not know cancel_rate yet, etc.).
    """
    defaults = {
        "recency_days": 30.0,
        "frequency_90d": 2.0,
        "monetary": 5000.0,
        "avg_order_gap_days": 45.0,
        "tenure_days": 120.0,
        "cancel_rate": 0.0,
    }
    feature_order = s.meta["feature_names"]  # last entry is category_idx
    vec = np.zeros(len(feature_order), dtype=np.float32)
    for i, name in enumerate(feature_order):
        if name == "category_idx":
            vec[i] = s.category_index.get(category.lower(), s.category_index.get("clothing", 0))
        else:
            v = features.get(name, defaults.get(name, 0.0))
            try:
                vec[i] = float(v)
            except (TypeError, ValueError):
                vec[i] = defaults.get(name, 0.0)
    return vec


def predict(category: str, features: Dict[str, Any]) -> Dict[str, Any]:
    """
    Returns the full prediction payload — probability, risk_tier,
    category thresholds, and the top-3 SHAP drivers (with sign so the
    caller knows which features pushed risk UP vs DOWN).
    """
    s = _load()
    if s is None:
        return {
            "ready": False,
            "error": "churn model not trained on this host — run `python -m training.churn_train`",
        }

    vec = _features_to_vector(features, category, s).reshape(1, -1)
    proba = float(s.model.predict_proba(vec)[0, 1])
    tier = _risk_tier(proba, s.meta.get("tier_cutoffs", {}))
    cat_threshold = s.meta.get("category_thresholds", {}).get(
        category.lower(),
        s.meta.get("category_thresholds", {}).get("clothing", {}),
    )

    # SHAP TreeExplainer on XGBoost returns one row of feature contributions
    # (log-odds). Rank by absolute magnitude → top 3 drivers.
    shap_values = s.explainer.shap_values(vec)
    # shap_values shape: (1, n_features) for binary classifier with newer xgboost
    if hasattr(shap_values, "shape") and len(shap_values.shape) == 2:
        contribs = shap_values[0]
    else:
        # Older API returned [class0, class1] list of arrays — take positive class.
        contribs = shap_values[1][0] if isinstance(shap_values, list) and len(shap_values) > 1 else shap_values[0]

    feature_names: List[str] = s.meta["feature_names"]
    pairs = []
    for i, name in enumerate(feature_names):
        if name == "category_idx":
            continue  # don't expose internal encoding to the caller
        contrib = float(contribs[i])
        pairs.append({
            "feature": name,
            "value": float(vec[0, i]),
            "shap": round(contrib, 4),
            "direction": "increases_risk" if contrib > 0 else "decreases_risk",
        })
    pairs.sort(key=lambda p: abs(p["shap"]), reverse=True)
    top_drivers = pairs[:3]

    return {
        "ready": True,
        "category": category.lower(),
        "category_thresholds": cat_threshold,
        "churn_probability": round(proba, 4),
        "risk_tier": tier,
        "top_drivers": top_drivers,
        "model_version": s.meta.get("model_version"),
    }

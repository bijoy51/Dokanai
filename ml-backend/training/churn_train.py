r"""
Train the shared global churn model used by /predict/churn.

WHY a shared model
------------------
The PDF architecture says "shared global model for tenants with <1K
customers, per-tenant models unlock at scale" (§7.4). 99% of our tenants
will sit below that bar for the foreseeable future, so we train one
category-aware model on a large synthesized dataset whose distributions
match what real shops look like, and serve it for every tenant.

WHY synthesized features (not raw shop_sales.csv)
-------------------------------------------------
The synthetic shop_sales.csv has shop_id + date + product_type + qty +
unit_price — there are NO customer IDs in it. So we cannot derive
per-customer (recency, frequency, monetary, ...) tuples from it directly.

What we DO have is a clear definition of "churn" per category from the
PDF §2.3 (Grocery 21/45, Electronics 90/180, Beauty 45/90, Clothing 60/120,
Shoe 60/120). We synthesize ~50k customer-feature rows whose marginal
distributions match real shop behavior (recency exponential, frequency
Poisson, monetary log-normal, cancel rate beta), label each row with the
PDF's category windows (with a small noise margin so XGBoost learns a
SMOOTH probability and not a hard cliff), and train.

The resulting model is a calibrated probability over the same rule the
business already understands — but with SHAP we get per-prediction
explanations, AND the moment a real shop accumulates real customer data
it can retrain on its own (the predict endpoint accepts the same feature
shape).

USAGE (Windows / PowerShell)
----------------------------
   cd ml-backend
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt -r requirements-train.txt
   python -m training.churn_train

USAGE (POSIX)
-------------
   cd ml-backend
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt -r requirements-train.txt
   python -m training.churn_train

OUTPUTS
-------
   artifacts/churn/model.joblib       — XGBoost classifier
   artifacts/churn/explainer.joblib   — SHAP TreeExplainer
   artifacts/churn/meta.json          — feature order, category list,
                                        training metrics, thresholds
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Dict, List

import joblib
import numpy as np
import shap
import xgboost as xgb
from sklearn.metrics import f1_score, roc_auc_score
from sklearn.model_selection import train_test_split


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Must match lib/ai/churn.ts CATEGORY_CHURN_THRESHOLDS. Frontend + backend
# pulling from the same source of truth would be nicer, but a CSV
# round-trip through the build pipeline is overkill at this stage.
CATEGORY_THRESHOLDS: Dict[str, Dict[str, int]] = {
    "food":        {"at_risk_days": 21, "churned_days": 45},
    "electronics": {"at_risk_days": 90, "churned_days": 180},
    "beauty":      {"at_risk_days": 45, "churned_days": 90},
    "clothing":    {"at_risk_days": 60, "churned_days": 120},
    "home":        {"at_risk_days": 60, "churned_days": 120},
}

# Order matters — the predict endpoint MUST pass features in this exact
# order. The meta.json records it so the API layer can validate.
FEATURE_NAMES: List[str] = [
    "recency_days",
    "frequency_90d",
    "monetary",
    "avg_order_gap_days",
    "tenure_days",
    "cancel_rate",
    "category_idx",  # categorical index into CATEGORY_THRESHOLDS (alphabetical)
]

CATEGORIES_ORDERED = sorted(CATEGORY_THRESHOLDS.keys())

ROWS_PER_CATEGORY = 10_000  # 5 categories * 10k = 50k rows, trains in seconds
RANDOM_SEED = 42

OUT_DIR = Path(__file__).resolve().parent.parent / "artifacts" / "churn"


# ---------------------------------------------------------------------------
# Synthetic feature distributions
# ---------------------------------------------------------------------------

def _sample_features(rng: np.random.Generator, n: int, category_idx: int) -> np.ndarray:
    """
    Generate `n` realistic (feature_vector) rows for one category.

    Distribution choices loosely match what we see in real shop data:
      * recency_days       — Exponential(mean=45). Long-tail; most customers
                             bought recently, some haven't in months.
      * frequency_90d      — Poisson(lam=2). Bulk of customers buy once or
                             twice per quarter; some power users buy many
                             times.
      * monetary           — Log-normal. Spend is highly skewed.
      * avg_order_gap_days — Derived loosely from (90 / max(frequency,1)).
      * tenure_days        — Uniform(7, 730). 1 week to 2 years.
      * cancel_rate        — Beta(1, 30). Most customers near 0, a tail of
                             chronic cancellers.
    """
    recency = rng.exponential(scale=45.0, size=n).clip(0, 365)
    frequency = rng.poisson(lam=2.0, size=n).clip(0, 30)
    monetary = rng.lognormal(mean=8.5, sigma=0.8, size=n).clip(50, 200_000)
    # Avoid div-by-zero; if frequency is 0 set a long gap.
    gap = np.where(frequency > 0, 90.0 / np.maximum(frequency, 1), 180.0)
    gap = gap + rng.normal(0, 5, n)
    gap = gap.clip(1, 365)
    tenure = rng.uniform(7, 730, size=n)
    cancel_rate = rng.beta(1.0, 30.0, size=n)
    cat = np.full(n, category_idx, dtype=np.float32)

    return np.stack([recency, frequency, monetary, gap, tenure, cancel_rate, cat], axis=1)


def _label(rng: np.random.Generator, X: np.ndarray, category: str) -> np.ndarray:
    """
    Label = 1 if churned. Hard rule: recency > churned_days for the
    category. Soft margin: customers in [at_risk_days, churned_days]
    are churned with a probability that ramps up linearly. Customers
    with very low frequency or high cancel rate also get an upward
    nudge — so XGBoost learns these are RISK signals, not just recency.
    """
    thresh = CATEGORY_THRESHOLDS[category]
    at_risk = thresh["at_risk_days"]
    churned = thresh["churned_days"]
    recency = X[:, 0]
    frequency = X[:, 1]
    cancel_rate = X[:, 5]

    # Linear ramp 0 → 1 across the at-risk window
    p = np.zeros(len(X), dtype=np.float64)
    in_window = (recency >= at_risk) & (recency < churned)
    p[in_window] = (recency[in_window] - at_risk) / max(1, churned - at_risk)
    p[recency >= churned] = 0.95
    # Risk modifiers
    p += 0.10 * (frequency < 2).astype(np.float64)
    p += 0.30 * cancel_rate
    p = np.clip(p, 0.02, 0.98)
    return (rng.random(len(X)) < p).astype(np.int32)


# ---------------------------------------------------------------------------
# Training pipeline
# ---------------------------------------------------------------------------

def build_dataset(rng: np.random.Generator) -> tuple[np.ndarray, np.ndarray]:
    Xs: List[np.ndarray] = []
    ys: List[np.ndarray] = []
    for idx, cat in enumerate(CATEGORIES_ORDERED):
        X = _sample_features(rng, ROWS_PER_CATEGORY, idx)
        y = _label(rng, X, cat)
        Xs.append(X)
        ys.append(y)
    X = np.vstack(Xs).astype(np.float32)
    y = np.concatenate(ys).astype(np.int32)
    return X, y


def train() -> Dict:
    rng = np.random.default_rng(RANDOM_SEED)
    X, y = build_dataset(rng)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=RANDOM_SEED, stratify=y
    )

    model = xgb.XGBClassifier(
        n_estimators=300,
        max_depth=5,
        learning_rate=0.08,
        subsample=0.9,
        colsample_bytree=0.9,
        objective="binary:logistic",
        eval_metric="auc",
        tree_method="hist",
        n_jobs=-1,
        random_state=RANDOM_SEED,
    )
    model.fit(X_train, y_train)
    # Wrap the underlying booster's feature names so SHAP labels are nice.
    model.get_booster().feature_names = FEATURE_NAMES

    proba = model.predict_proba(X_test)[:, 1]
    preds = (proba >= 0.5).astype(np.int32)
    auroc = float(roc_auc_score(y_test, proba))
    f1 = float(f1_score(y_test, preds))

    # SHAP TreeExplainer is exact, fast, and ships with xgboost's tree
    # output natively — no slow KernelExplainer needed.
    explainer = shap.TreeExplainer(model)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, OUT_DIR / "model.joblib")
    joblib.dump(explainer, OUT_DIR / "explainer.joblib")
    meta = {
        "feature_names": FEATURE_NAMES,
        "categories_ordered": CATEGORIES_ORDERED,
        "category_thresholds": CATEGORY_THRESHOLDS,
        "metrics": {
            "auroc": round(auroc, 4),
            "f1": round(f1, 4),
            "train_rows": int(len(X_train)),
            "test_rows": int(len(X_test)),
            "positive_rate_test": round(float(y_test.mean()), 4),
        },
        "tier_cutoffs": {"low_max": 0.33, "medium_max": 0.66},
        "model_version": "churn-v1",
    }
    (OUT_DIR / "meta.json").write_text(json.dumps(meta, indent=2))
    return meta


if __name__ == "__main__":
    meta = train()
    print(json.dumps(meta["metrics"], indent=2))
    print(f"Artifacts written to: {OUT_DIR}")

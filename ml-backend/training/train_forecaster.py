"""Train the Demand Forecaster (XGBoost global model).

Uses the synthetic shop_sales.csv plus, if present, processed/sales.csv.
Features per (shop, product_type, date):
    lag_1, lag_7, lag_14, lag_28
    rolling mean / std (7d, 28d)
    day-of-week, month, week-of-year
    days_to_next_festival
    product_type one-hot (top-N), shop_type one-hot

Output: artifacts/demand_forecaster.json + artifacts/feature_spec.json
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb

from app.data.festivals import FESTIVALS

ROOT = Path(__file__).resolve().parent.parent
ARTIFACTS = ROOT / "artifacts"
ARTIFACTS.mkdir(exist_ok=True)

FEST_DATES = sorted({pd.to_datetime(f.date).date() for f in FESTIVALS})


def days_to_next_festival(d: pd.Series) -> pd.Series:
    out = []
    for x in pd.to_datetime(d).dt.date:
        future = [(f - x).days for f in FEST_DATES if (f - x).days >= 0]
        out.append(min(future) if future else 365)
    return pd.Series(out)


def build_features(sales: pd.DataFrame) -> pd.DataFrame:
    sales = sales.copy()
    sales["date"] = pd.to_datetime(sales["date"])
    sales = sales.sort_values(["shop_id", "product_type", "date"])

    daily = (sales.groupby(["shop_id", "product_type", "date"], as_index=False)["qty"]
                  .sum()
                  .rename(columns={"qty": "y"}))

    grp = daily.groupby(["shop_id", "product_type"])
    for lag in (1, 7, 14, 28):
        daily[f"lag_{lag}"] = grp["y"].shift(lag)
    daily["roll7_mean"] = grp["y"].shift(1).rolling(7).mean().reset_index(level=[0, 1], drop=True)
    daily["roll28_mean"] = grp["y"].shift(1).rolling(28).mean().reset_index(level=[0, 1], drop=True)
    daily["roll7_std"] = grp["y"].shift(1).rolling(7).std().reset_index(level=[0, 1], drop=True)

    daily["dow"] = daily["date"].dt.dayofweek
    daily["month"] = daily["date"].dt.month
    daily["week"] = daily["date"].dt.isocalendar().week.astype(int)
    daily["days_to_fest"] = days_to_next_festival(daily["date"])

    daily = daily.dropna(subset=["lag_1", "lag_7", "lag_28", "roll7_mean"])
    return daily


def main() -> None:
    synth = ROOT / "datasets" / "synthetic" / "shop_sales.csv"
    if not synth.exists():
        raise SystemExit("synthetic sales not found — run training.generate_synthetic first.")
    sales = pd.read_csv(synth)

    feats = build_features(sales)

    # Encode product_type as a categorical index (saved in feature_spec for inference reuse).
    pt_index = {pt: i for i, pt in enumerate(sorted(feats["product_type"].unique()))}
    feats["product_idx"] = feats["product_type"].map(pt_index)

    feature_cols = ["lag_1", "lag_7", "lag_14", "lag_28",
                    "roll7_mean", "roll28_mean", "roll7_std",
                    "dow", "month", "week", "days_to_fest", "product_idx"]
    X = feats[feature_cols].astype(float).values
    y = feats["y"].astype(float).values

    # Time-aware split: last 14 days for validation.
    cutoff = feats["date"].max() - pd.Timedelta(days=14)
    mask_train = feats["date"] <= cutoff
    dtrain = xgb.DMatrix(X[mask_train], label=y[mask_train], feature_names=feature_cols)
    dval = xgb.DMatrix(X[~mask_train], label=y[~mask_train], feature_names=feature_cols)

    params = {
        "objective": "reg:squarederror", "eta": 0.05, "max_depth": 6,
        "subsample": 0.9, "colsample_bytree": 0.8, "min_child_weight": 5,
        "verbosity": 0,
    }
    booster = xgb.train(
        params, dtrain, num_boost_round=400,
        evals=[(dtrain, "train"), (dval, "val")],
        early_stopping_rounds=25, verbose_eval=False,
    )

    out = ARTIFACTS / "demand_forecaster.json"
    booster.save_model(str(out))
    (ARTIFACTS / "feature_spec.json").write_text(json.dumps({
        "features": feature_cols,
        "product_index": pt_index,
        "fest_dates": [f.isoformat() for f in FEST_DATES],
    }, indent=2))
    rmse = float(np.sqrt(((booster.predict(dval) - y[~mask_train]) ** 2).mean()))
    print(f"wrote {out}; val RMSE = {rmse:.3f}")


if __name__ == "__main__":
    main()

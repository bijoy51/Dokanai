"""Train the Shop-Type Classifier.

Combines:
    datasets/synthetic/bd_listings.csv  (always present after generate_synthetic)
    datasets/processed/listings.csv     (Flipkart/Amazon, optional)

Output:
    artifacts/shop_type_clf.joblib  -- {"vectorizer": TfidfVectorizer, "model": LinearSVC}

Run:  python -m training.train_shop_type
"""
from __future__ import annotations

from pathlib import Path

import joblib
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.svm import LinearSVC

ROOT = Path(__file__).resolve().parent.parent
ARTIFACTS = ROOT / "artifacts"
ARTIFACTS.mkdir(exist_ok=True)


def load_dataset() -> pd.DataFrame:
    frames = []
    synth = ROOT / "datasets" / "synthetic" / "bd_listings.csv"
    if synth.exists():
        df = pd.read_csv(synth)
        df = df.rename(columns={"true_shop_type": "label"})
        df["text"] = df["title"].fillna("") + " " + df["description"].fillna("")
        frames.append(df[["text", "label"]])

    public = ROOT / "datasets" / "processed" / "listings.csv"
    if public.exists():
        df = pd.read_csv(public)
        df["text"] = df["title"].fillna("") + " " + df.get("description", pd.Series([""] * len(df))).fillna("")
        # Heuristic: map the public dataset's "category" string to one of our 8 shop types.
        df["label"] = df.get("category", pd.Series([""] * len(df))).astype(str).apply(_map_category)
        df = df.dropna(subset=["label"])
        frames.append(df[["text", "label"]])

    if not frames:
        raise SystemExit("No training data. Run training.generate_synthetic first.")
    return pd.concat(frames, ignore_index=True)


CATEGORY_HINTS = {
    "clothing": ["clothing", "apparel", "fashion", "saree", "kurta", "shirt"],
    "grocery": ["grocery", "staples", "rice", "oil"],
    "electronics": ["electronic", "mobile", "computer", "accessor"],
    "beauty": ["beauty", "cosmetic", "skin", "hair"],
    "home": ["home", "kitchen", "furnishing", "decor"],
    "food": ["food", "beverage", "snack", "sweet"],
    "pharmacy": ["pharma", "health", "medicine", "wellness"],
    "stationery": ["stationery", "office", "school"],
}


def _map_category(s: str):
    s = (s or "").lower()
    for label, hints in CATEGORY_HINTS.items():
        if any(h in s for h in hints):
            return label
    return None


def main() -> None:
    df = load_dataset()
    print(f"training on {len(df)} rows over {df['label'].nunique()} classes")

    X_train, X_test, y_train, y_test = train_test_split(
        df["text"], df["label"], test_size=0.15, random_state=42, stratify=df["label"],
    )

    pipe = Pipeline([
        ("tfidf", TfidfVectorizer(ngram_range=(1, 2), min_df=2, sublinear_tf=True)),
        ("clf", LinearSVC()),
    ])
    pipe.fit(X_train, y_train)

    preds = pipe.predict(X_test)
    print(classification_report(y_test, preds))

    out = ARTIFACTS / "shop_type_clf.joblib"
    joblib.dump({"vectorizer": pipe.named_steps["tfidf"], "model": pipe.named_steps["clf"]}, out)
    print(f"wrote {out}")


if __name__ == "__main__":
    main()

"""Normalise the public datasets into datasets/processed/.

Inputs (you download these into datasets/raw/):
    fashion_images/    -- Fashion Product Images Dataset (Kaggle)
        images/*.jpg
        styles.csv
    flipkart_or_amazon_products.csv  -- Flipkart or Amazon product catalogue
    retail_sales.csv                 -- Rossmann or Store Item Demand Forecasting
    online_retail.xlsx               -- Online Retail (UCI, direct download)

Outputs:
    processed/listings.csv  (title, description, category, price)
    processed/sales.csv     (store_id, date, sales, holiday_flag, product?)
    processed/baskets.csv   (invoice_id, product, qty, date)
    processed/fashion_styles.csv  (image, gender, masterCategory, subCategory,
                                   articleType, baseColour, season, usage)

Run after dropping the raw files in place:  python -m training.data_prep
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "datasets" / "raw"
PROCESSED = ROOT / "datasets" / "processed"
PROCESSED.mkdir(parents=True, exist_ok=True)


def prep_fashion() -> None:
    src = RAW / "fashion_images" / "styles.csv"
    if not src.exists():
        print(f"skip fashion: {src} not found")
        return
    df = pd.read_csv(src, on_bad_lines="skip")
    keep = ["id", "gender", "masterCategory", "subCategory", "articleType",
            "baseColour", "season", "year", "usage", "productDisplayName"]
    df = df[[c for c in keep if c in df.columns]]
    df = df.dropna(subset=["articleType"])
    df.rename(columns={"id": "image"}, inplace=True)
    df["image"] = df["image"].astype(str) + ".jpg"
    df.to_csv(PROCESSED / "fashion_styles.csv", index=False)
    print(f"fashion: {len(df)} rows")


def prep_products() -> None:
    candidates = [
        RAW / "flipkart_products.csv",
        RAW / "amazon_products.csv",
    ]
    src = next((p for p in candidates if p.exists()), None)
    if not src:
        print("skip products: no flipkart/amazon CSV in datasets/raw/")
        return
    df = pd.read_csv(src, on_bad_lines="skip")
    rename = {}
    for c in df.columns:
        cl = c.lower()
        if "product_name" in cl or cl in ("title", "name"):
            rename[c] = "title"
        elif "description" in cl:
            rename[c] = "description"
        elif "category" in cl and "tree" in cl:
            rename[c] = "category"
        elif cl == "category" and "category" not in rename.values():
            rename[c] = "category"
        elif cl in ("price", "discounted_price", "selling_price"):
            rename[c] = "price"
    df.rename(columns=rename, inplace=True)
    cols = [c for c in ("title", "description", "category", "price") if c in df.columns]
    df = df[cols].dropna(subset=["title"])
    df.to_csv(PROCESSED / "listings.csv", index=False)
    print(f"listings: {len(df)} rows")


def prep_sales() -> None:
    src = RAW / "retail_sales.csv"
    if not src.exists():
        print(f"skip sales: {src} not found")
        return
    df = pd.read_csv(src, on_bad_lines="skip")
    rename = {}
    for c in df.columns:
        cl = c.lower()
        if cl == "store":
            rename[c] = "store_id"
        elif cl == "date":
            rename[c] = "date"
        elif cl == "sales":
            rename[c] = "sales"
        elif "holiday" in cl:
            rename[c] = "holiday_flag"
    df.rename(columns=rename, inplace=True)
    cols = [c for c in ("store_id", "date", "sales", "holiday_flag") if c in df.columns]
    df = df[cols].dropna(subset=["date"])
    df.to_csv(PROCESSED / "sales.csv", index=False)
    print(f"sales: {len(df)} rows")


def prep_baskets() -> None:
    src = RAW / "online_retail.xlsx"
    if not src.exists():
        print(f"skip baskets: {src} not found")
        return
    df = pd.read_excel(src)
    df.columns = [c.lower() for c in df.columns]
    keep = {"invoiceno": "invoice_id", "description": "product",
            "quantity": "qty", "invoicedate": "date"}
    df = df.rename(columns=keep)[list(keep.values())]
    df = df.dropna(subset=["invoice_id", "product"])
    df["date"] = pd.to_datetime(df["date"]).dt.date.astype(str)
    df.to_csv(PROCESSED / "baskets.csv", index=False)
    print(f"baskets: {len(df)} rows")


def main() -> None:
    if not RAW.exists():
        RAW.mkdir(parents=True)
        print(f"created {RAW} — drop the downloaded datasets here and re-run.")
        return
    prep_fashion()
    prep_products()
    prep_sales()
    prep_baskets()


if __name__ == "__main__":
    main()

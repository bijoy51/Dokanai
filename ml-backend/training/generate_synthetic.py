"""Generate Bangladesh-flavoured synthetic training data.

Outputs CSVs under datasets/synthetic/ used by the training scripts:
    shops.csv          shop_id, shop_type, region
    shop_catalogs.csv  shop_id, product_type
    shop_sales.csv     shop_id, date, product_type, qty, unit_price
    festival_calendar.csv (mirrors app/data/festivals.py)
    bd_listings.csv    title, description, price, true_shop_type

Run:  python -m training.generate_synthetic
"""
from __future__ import annotations

import csv
import math
import random
from datetime import date, timedelta
from pathlib import Path

from app.data.festivals import FESTIVALS, festival_boost

OUT = Path(__file__).resolve().parent.parent / "datasets" / "synthetic"
OUT.mkdir(parents=True, exist_ok=True)

REGIONS = ["Dhaka", "Chattogram", "Khulna", "Sylhet", "Rajshahi", "Barishal",
           "Cumilla", "Mymensingh", "Narayanganj", "Gazipur"]

SHOP_TYPES = ["clothing", "grocery", "electronics", "beauty",
              "home", "food", "pharmacy", "stationery"]

# Per shop type, a pool of product_types (the "universe") and rough price bands.
CATALOG_POOLS = {
    "clothing": [
        ("cotton saree", 1500, 2500), ("silk saree", 3500, 6000), ("designer panjabi", 1800, 3500),
        ("cotton three-piece", 1300, 2200), ("embroidered blouse", 500, 1200),
        ("casual shirt", 800, 1500), ("kids eid frock", 900, 1800), ("winter jacket", 1800, 3500),
        ("woolen shawl", 700, 1400), ("hijab", 250, 500), ("kurti", 900, 1900),
        ("petticoat", 200, 400), ("anarkali kurti", 1500, 3000),
        ("graphic t-shirt", 400, 900), ("formal trouser", 1000, 2200),
        ("matching blouse", 400, 900), ("bridal lehenga", 6000, 15000),
        ("winter cap", 250, 500), ("scarf", 200, 500), ("salwar set", 1100, 2200),
    ],
    "grocery": [
        ("fragrant rice 5kg", 750, 1100), ("soybean oil 1l", 160, 220),
        ("masoor dal 1kg", 130, 180), ("sugar 1kg", 110, 140),
        ("atta 2kg", 110, 160), ("salt 1kg", 30, 50),
        ("onion 1kg", 50, 110), ("potato 1kg", 25, 50),
        ("powder milk 500g", 320, 480), ("egg dozen", 110, 160),
        ("biscuit pack", 30, 70), ("instant noodles", 25, 60),
        ("dish soap", 35, 80), ("laundry detergent", 95, 200),
    ],
    "electronics": [
        ("usb cable", 150, 280), ("phone charger", 350, 600),
        ("bluetooth earbuds", 1500, 3000), ("power bank", 1200, 2500),
        ("led bulb", 130, 220), ("smartwatch", 2200, 4500),
        ("phone case", 200, 500), ("screen protector", 100, 250),
        ("speaker", 1100, 2800), ("memory card 32gb", 450, 750),
    ],
    "beauty": [
        ("attar perfume", 700, 1100), ("lipstick", 350, 600),
        ("face serum", 900, 1500), ("hair oil", 250, 400),
        ("moisturizer", 500, 800), ("kajal", 150, 300),
        ("henna cone", 30, 80), ("body spray", 400, 700),
        ("foundation", 600, 1200), ("compact powder", 350, 700),
        ("sunscreen", 500, 900), ("nail polish", 120, 280),
    ],
    "home": [
        ("bedsheet double", 1200, 2000), ("blanket", 1100, 1800),
        ("pillow pack", 550, 850), ("kitchen knife set", 800, 1300),
        ("freezer bag roll", 250, 400), ("wall clock", 450, 800),
        ("curtain set", 1500, 2400), ("prayer mat", 350, 600),
        ("doormat", 200, 400), ("kitchen container set", 700, 1300),
    ],
    "food": [
        ("premium dates 1kg", 900, 1300), ("chickpea 1kg", 110, 170),
        ("sweet box", 600, 950), ("hilsa fish 1kg", 1500, 2200),
        ("premium tea 500g", 350, 500), ("honey 500g", 480, 700),
        ("spice mix pack", 220, 350), ("dry fruit mix 500g", 700, 1100),
        ("iftar snack box", 350, 700),
    ],
    "pharmacy": [
        ("paracetamol", 15, 40), ("antiseptic liquid", 80, 150),
        ("bandage roll", 30, 80), ("thermometer", 250, 500),
        ("face mask", 30, 80), ("hand sanitizer", 90, 200),
        ("vitamin tablets", 200, 500), ("baby diaper pack", 400, 900),
        ("blood pressure monitor", 1500, 3500),
    ],
    "stationery": [
        ("ball pen pack", 30, 80), ("pencil pack", 25, 70),
        ("exercise book", 40, 90), ("eraser", 5, 15),
        ("ruler set", 25, 60), ("marker", 25, 60),
        ("file folder", 60, 150), ("glue stick", 20, 50),
        ("color box", 100, 250), ("calculator", 350, 800),
    ],
}

# Map product types into the festival-boost categories used by app.data.festivals.
TYPE_BOOST_CAT = {
    "clothing": "clothing", "grocery": "food", "food": "food",
    "beauty": "beauty", "home": "home", "electronics": "electronics",
    "pharmacy": "food", "stationery": "clothing",
}


def write_csv(name: str, header, rows) -> Path:
    p = OUT / name
    with p.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(header)
        w.writerows(rows)
    return p


def main(n_shops_per_type: int = 30, days: int = 365, seed: int = 20260612) -> None:
    rng = random.Random(seed)

    # --- shops ---
    shops = []
    shop_id = 1
    for st in SHOP_TYPES:
        for _ in range(n_shops_per_type):
            shops.append((f"s{shop_id:05d}", st, rng.choice(REGIONS)))
            shop_id += 1

    write_csv("shops.csv", ["shop_id", "shop_type", "region"], shops)

    # --- shop catalogs (each shop carries a subset of its type's pool) ---
    catalog_rows = []
    catalog_by_shop: dict[str, list[str]] = {}
    for (sid, st, _region) in shops:
        pool = CATALOG_POOLS[st]
        size = rng.randint(max(5, len(pool) // 2), len(pool))
        picked = rng.sample(pool, size)
        catalog_by_shop[sid] = [p[0] for p in picked]
        for (pt, _lo, _hi) in picked:
            catalog_rows.append((sid, pt))

    write_csv("shop_catalogs.csv", ["shop_id", "product_type"], catalog_rows)

    # --- shop sales (per shop, daily over `days`, with festival spikes) ---
    sales_rows = []
    today = date.today()
    for (sid, st, _region) in shops:
        catalog = catalog_by_shop[sid]
        # baseline daily orders for this shop type
        baseline = {"clothing": 4, "grocery": 9, "electronics": 2, "beauty": 3,
                    "home": 3, "food": 5, "pharmacy": 4, "stationery": 3}[st]
        boost_cat = TYPE_BOOST_CAT[st]
        for d in range(days):
            day = today - timedelta(days=days - 1 - d)
            mul, _ = festival_boost(day, boost_cat)
            n_orders = max(0, int(round(rng.gauss(baseline * (0.5 + 0.5 * mul), 1.5))))
            for _ in range(n_orders):
                pt = rng.choice(catalog)
                lo, hi = next((p[1], p[2]) for p in CATALOG_POOLS[st] if p[0] == pt)
                qty = 1 + (1 if rng.random() < 0.12 else 0)
                sales_rows.append((sid, day.isoformat(), pt, qty, rng.randint(lo, hi)))

    write_csv("shop_sales.csv",
              ["shop_id", "date", "product_type", "qty", "unit_price"],
              sales_rows)

    # --- festival calendar (export of the in-code constants) ---
    fest_rows = [
        (f.id, f.name, f.name_bn, f.date, f.lead_days, f.peak_boost, ",".join(f.categories), f.advice)
        for f in FESTIVALS
    ]
    write_csv("festival_calendar.csv",
              ["id", "name", "name_bn", "date", "lead_days", "peak_boost", "categories", "advice"],
              fest_rows)

    # --- bd_listings (synthetic titles + descriptions labelled with shop type) ---
    listings_rows = []
    adjectives = ["premium", "cotton", "silk", "designer", "festive", "exclusive",
                  "soft", "warm", "lightweight", "embroidered", "handmade", "fresh"]
    for st, pool in CATALOG_POOLS.items():
        for (pt, lo, hi) in pool:
            for _ in range(8):  # ~ 8 listings per product_type per shop_type
                adj = rng.choice(adjectives)
                price = rng.randint(lo, hi)
                title = f"{adj.title()} {pt}"
                desc = f"High-quality {pt} suited for everyday and festive use. Price: BDT {price}."
                listings_rows.append((title, desc, price, st))

    write_csv("bd_listings.csv",
              ["title", "description", "price", "true_shop_type"],
              listings_rows)

    print(f"Wrote {len(shops)} shops, {len(catalog_rows)} catalog rows, "
          f"{len(sales_rows)} sales rows, {len(listings_rows)} listings to {OUT}")


if __name__ == "__main__":
    main()

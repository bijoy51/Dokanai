"""Generate Bangladesh-flavoured synthetic training data.

Default scale: 20 shop types, ~2000 shops, 2 years of daily activity.
Output: ~1.5 M sales rows, ~5 k catalog rows, ~5 k listings.

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

REGIONS = [
    "Dhaka", "Chattogram", "Khulna", "Sylhet", "Rajshahi", "Barishal",
    "Cumilla", "Mymensingh", "Narayanganj", "Gazipur",
    "Rangpur", "Jessore", "Bogra", "Cox's Bazar", "Faridpur",
]

SHOP_TYPES = [
    "clothing", "grocery", "electronics", "beauty",
    "home", "food", "pharmacy", "stationery",
    "jewellery", "footwear", "toys", "books",
    "sports", "baby", "mobile_accessories", "gifts",
    "kitchen", "pet", "religious", "bakery",
]

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
        ("denim jeans", 1200, 2500), ("cardigan", 900, 1800),
        ("nightwear set", 600, 1200), ("lungi", 350, 700),
    ],
    "grocery": [
        ("fragrant rice 5kg", 750, 1100), ("soybean oil 1l", 160, 220),
        ("masoor dal 1kg", 130, 180), ("sugar 1kg", 110, 140),
        ("atta 2kg", 110, 160), ("salt 1kg", 30, 50),
        ("onion 1kg", 50, 110), ("potato 1kg", 25, 50),
        ("powder milk 500g", 320, 480), ("egg dozen", 110, 160),
        ("biscuit pack", 30, 70), ("instant noodles", 25, 60),
        ("dish soap", 35, 80), ("laundry detergent", 95, 200),
        ("mustard oil 1l", 180, 240), ("packaged spices", 75, 180),
        ("tomato sauce", 90, 150), ("ginger garlic paste", 60, 110),
    ],
    "electronics": [
        ("usb cable", 150, 280), ("phone charger", 350, 600),
        ("bluetooth earbuds", 1500, 3000), ("power bank", 1200, 2500),
        ("led bulb", 130, 220), ("smartwatch", 2200, 4500),
        ("speaker bluetooth", 1100, 2800), ("memory card 32gb", 450, 750),
        ("usb hub", 400, 900), ("hdmi cable", 250, 500),
        ("router wifi", 1800, 3500), ("portable hard drive", 3500, 6500),
        ("table lamp led", 600, 1500), ("desk fan small", 800, 1800),
    ],
    "beauty": [
        ("attar perfume", 700, 1100), ("lipstick", 350, 600),
        ("face serum", 900, 1500), ("hair oil", 250, 400),
        ("moisturizer", 500, 800), ("kajal", 150, 300),
        ("henna cone", 30, 80), ("body spray", 400, 700),
        ("foundation", 600, 1200), ("compact powder", 350, 700),
        ("sunscreen", 500, 900), ("nail polish", 120, 280),
        ("shampoo 250ml", 220, 400), ("conditioner 250ml", 250, 450),
        ("face wash", 200, 400), ("eyeliner", 220, 450),
        ("mascara", 350, 650), ("makeup remover", 280, 500),
    ],
    "home": [
        ("bedsheet double", 1200, 2000), ("blanket", 1100, 1800),
        ("pillow pack", 550, 850), ("kitchen knife set", 800, 1300),
        ("freezer bag roll", 250, 400), ("wall clock", 450, 800),
        ("curtain set", 1500, 2400), ("prayer mat", 350, 600),
        ("doormat", 200, 400), ("kitchen container set", 700, 1300),
        ("hanger pack", 180, 400), ("dustbin", 250, 600),
        ("clothes drying rack", 700, 1400), ("ironing board", 1200, 2200),
    ],
    "food": [
        ("premium dates 1kg", 900, 1300), ("chickpea 1kg", 110, 170),
        ("sweet box", 600, 950), ("hilsa fish 1kg", 1500, 2200),
        ("premium tea 500g", 350, 500), ("honey 500g", 480, 700),
        ("spice mix pack", 220, 350), ("dry fruit mix 500g", 700, 1100),
        ("iftar snack box", 350, 700),
        ("instant coffee 100g", 200, 380), ("packaged ghee 500g", 600, 1000),
        ("organic honey 250g", 320, 550), ("cashew nuts 250g", 400, 700),
    ],
    "pharmacy": [
        ("paracetamol", 15, 40), ("antiseptic liquid", 80, 150),
        ("bandage roll", 30, 80), ("thermometer", 250, 500),
        ("face mask", 30, 80), ("hand sanitizer", 90, 200),
        ("vitamin tablets", 200, 500), ("baby diaper pack", 400, 900),
        ("blood pressure monitor", 1500, 3500),
        ("cough syrup", 60, 140), ("antacid", 25, 70),
        ("ors sachet", 10, 25), ("nasal spray", 150, 300),
    ],
    "stationery": [
        ("ball pen pack", 30, 80), ("pencil pack", 25, 70),
        ("exercise book", 40, 90), ("eraser", 5, 15),
        ("ruler set", 25, 60), ("marker", 25, 60),
        ("file folder", 60, 150), ("glue stick", 20, 50),
        ("color box", 100, 250), ("calculator", 350, 800),
        ("pencil case", 120, 280), ("a4 paper ream", 350, 600),
    ],
    "jewellery": [
        ("gold chain 22k", 35000, 90000), ("silver bracelet", 1800, 4500),
        ("imitation jewellery set", 800, 2200), ("bangles set", 600, 1800),
        ("nose ring", 200, 800), ("anklet pair", 350, 1200),
        ("mangalsutra", 3500, 12000), ("pendant", 600, 2500),
        ("toe ring pair", 150, 500), ("ear cuff", 250, 700),
        ("bridal jewellery set", 8000, 35000), ("pearl necklace", 1500, 5000),
        ("kundan choker", 1200, 4500), ("ring imitation", 200, 700),
    ],
    "footwear": [
        ("women heels", 1200, 2500), ("women sandals", 800, 1800),
        ("men formal shoes", 1800, 3500), ("men casual shoes", 1400, 2800),
        ("sneakers", 1500, 3500), ("kids school shoes", 650, 1200),
        ("flip flops", 200, 500), ("sports shoes", 1500, 3500),
        ("running shoes", 2000, 4500), ("leather shoes", 2500, 4500),
        ("canvas shoes", 900, 1800), ("ankle boots", 1800, 3500),
        ("ballet flats", 700, 1500), ("loafers men", 1400, 2800),
    ],
    "toys": [
        ("soft toy teddy bear", 350, 1200), ("educational blocks", 500, 1500),
        ("remote control car", 1200, 3000), ("doll set", 600, 1800),
        ("puzzle game", 300, 800), ("rubik cube", 200, 500),
        ("learning tablet kids", 1500, 3500), ("toy kitchen set", 900, 2500),
        ("action figure", 400, 1200), ("baby rattle", 150, 400),
        ("play doh set", 250, 700), ("toy car set", 350, 900),
        ("musical toy", 450, 1200), ("magnetic board", 600, 1500),
    ],
    "books": [
        ("school textbook", 150, 350), ("novel bangla", 300, 700),
        ("religious book", 200, 500), ("kids storybook", 150, 400),
        ("cookbook", 400, 900), ("biography", 350, 800),
        ("self help book", 280, 600), ("science reference", 400, 1000),
        ("english grammar", 250, 500), ("bengali literature", 300, 700),
        ("exam guide hsc", 350, 700), ("comic book", 100, 300),
        ("dictionary", 400, 900), ("magazine monthly", 80, 150),
    ],
    "sports": [
        ("cricket bat", 1500, 4500), ("cricket ball", 200, 500),
        ("football", 800, 2200), ("yoga mat", 600, 1400),
        ("dumbbells pair", 800, 2200), ("skipping rope", 200, 500),
        ("badminton racket", 700, 1800), ("table tennis racket", 600, 1400),
        ("bicycle helmet", 900, 2000), ("gym gloves", 350, 800),
        ("sports water bottle", 250, 600), ("sports towel", 300, 700),
        ("basketball", 900, 2200), ("running shorts", 500, 1200),
    ],
    "baby": [
        ("diapers pack newborn", 400, 800), ("baby formula", 800, 1800),
        ("baby food jar", 120, 280), ("baby clothes 0-3m", 400, 900),
        ("baby clothes 6-12m", 500, 1100), ("baby blanket", 600, 1400),
        ("baby stroller", 5500, 12000), ("baby car seat", 4500, 9000),
        ("baby bath set", 700, 1500), ("baby shampoo", 200, 400),
        ("baby lotion", 250, 500), ("pacifier", 150, 400),
        ("feeding bottle", 300, 700), ("baby walker", 2200, 4500),
        ("teether toy", 200, 500),
    ],
    "mobile_accessories": [
        ("phone case clear", 200, 500), ("phone case designer", 400, 1000),
        ("screen protector tempered", 150, 400), ("car phone holder", 350, 800),
        ("selfie stick", 400, 900), ("bluetooth car kit", 700, 1500),
        ("otg cable", 150, 350), ("phone stand", 250, 600),
        ("ring holder phone", 100, 300), ("airpods case", 250, 600),
        ("waterproof phone pouch", 200, 500), ("magnetic phone mount", 350, 900),
        ("popsocket", 150, 400), ("phone lens kit", 600, 1500),
    ],
    "gifts": [
        ("gift hamper deluxe", 1500, 4500), ("birthday gift basket", 800, 2200),
        ("corporate gift set", 1200, 3500), ("wedding gift box", 1500, 4500),
        ("chocolate gift box", 600, 1800), ("gift card", 500, 5000),
        ("personalized mug", 300, 700), ("photo frame gift", 350, 900),
        ("gift wrapping paper", 50, 150), ("gift ribbon set", 80, 200),
        ("scented candle gift", 400, 1000), ("greeting card pack", 60, 200),
    ],
    "kitchen": [
        ("non stick pan", 800, 2000), ("pressure cooker", 1800, 4500),
        ("mixer grinder", 2500, 6000), ("food processor", 3500, 8000),
        ("gas stove burner", 2200, 5000), ("cutting board", 250, 600),
        ("measuring cups set", 300, 700), ("chopping knife set", 600, 1500),
        ("water filter pitcher", 800, 2200), ("glass jar set", 500, 1200),
        ("rice cooker", 2000, 4500), ("electric kettle", 1200, 2800),
        ("toaster two slice", 1500, 3500), ("microwave bowl", 250, 600),
        ("silicone spatula set", 300, 700),
    ],
    "pet": [
        ("dog food pack", 600, 1800), ("cat food pack", 700, 1500),
        ("pet shampoo", 250, 600), ("pet collar", 300, 800),
        ("pet leash", 350, 900), ("cat litter", 500, 1200),
        ("pet bed", 1200, 3000), ("pet toy", 200, 600),
        ("pet feeding bowl", 250, 600), ("fish food pack", 150, 400),
        ("bird cage", 1500, 4500), ("dog chew bone", 200, 500),
    ],
    "religious": [
        ("quran shareef", 400, 1200), ("gita book", 350, 900),
        ("bible bangla", 350, 800), ("tasbih beads", 100, 400),
        ("prayer rug", 350, 900), ("topi", 100, 350),
        ("attar bottle", 300, 1000), ("agarbati pack", 50, 200),
        ("diya lamp set", 150, 500), ("puja thali", 600, 1500),
        ("religious calendar", 80, 200), ("hajj kit", 1500, 4000),
        ("janamaz mat", 250, 700),
    ],
    "bakery": [
        ("chocolate cake 1kg", 600, 1400), ("birthday cake custom", 1200, 3500),
        ("fruit cake 500g", 450, 900), ("bread loaf", 60, 140),
        ("bun pack", 50, 120), ("pastry box", 300, 700),
        ("cookies pack", 100, 300), ("donut box", 250, 600),
        ("cupcake set", 350, 800), ("patty pack", 80, 200),
        ("samosa pack", 80, 200), ("rasgulla box", 350, 750),
        ("cheesecake slice", 250, 500), ("muffin pack", 150, 350),
    ],
}

# Map product types into the festival-boost categories used by app.data.festivals.
TYPE_BOOST_CAT = {
    "clothing": "clothing", "grocery": "food", "food": "food",
    "beauty": "beauty", "home": "home", "electronics": "electronics",
    "pharmacy": "food", "stationery": "clothing",
    "jewellery": "clothing", "footwear": "clothing", "toys": "clothing",
    "books": "clothing", "sports": "clothing", "baby": "clothing",
    "mobile_accessories": "electronics", "gifts": "clothing",
    "kitchen": "home", "pet": "home", "religious": "food", "bakery": "food",
}

# Rough daily baseline orders per shop_type (used by sales generator).
BASELINE_PER_SHOP = {
    "clothing": 4, "grocery": 9, "electronics": 2, "beauty": 3,
    "home": 3, "food": 5, "pharmacy": 4, "stationery": 3,
    "jewellery": 1, "footwear": 3, "toys": 2, "books": 2,
    "sports": 2, "baby": 3, "mobile_accessories": 4, "gifts": 2,
    "kitchen": 3, "pet": 2, "religious": 2, "bakery": 5,
}


def write_csv(name: str, header, rows) -> Path:
    p = OUT / name
    with p.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(header)
        w.writerows(rows)
    return p


def main(n_shops_per_type: int = 100, days: int = 730, seed: int = 20260612, listings_per_product: int = 20) -> None:
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
        baseline = BASELINE_PER_SHOP[st]
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
    adjectives = [
        "premium", "cotton", "silk", "designer", "festive", "exclusive",
        "soft", "warm", "lightweight", "embroidered", "handmade", "fresh",
        "organic", "imported", "branded", "stylish", "modern", "traditional",
        "elegant", "casual", "luxury", "everyday", "limited edition", "bestseller",
    ]
    for st, pool in CATALOG_POOLS.items():
        for (pt, lo, hi) in pool:
            for _ in range(listings_per_product):
                adj = rng.choice(adjectives)
                price = rng.randint(lo, hi)
                title = f"{adj.title()} {pt}"
                desc = f"High-quality {pt} suited for everyday and festive use. Price: BDT {price}."
                listings_rows.append((title, desc, price, st))

    write_csv("bd_listings.csv",
              ["title", "description", "price", "true_shop_type"],
              listings_rows)

    print(f"Wrote {len(shops)} shops across {len(SHOP_TYPES)} types, "
          f"{len(catalog_rows)} catalog rows, "
          f"{len(sales_rows)} sales rows, "
          f"{len(listings_rows)} listings to {OUT}")


if __name__ == "__main__":
    main()

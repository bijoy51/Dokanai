"""Mine attribute gazetteers from labeled product data.

Inputs:
    datasets/synthetic/bd_listings.csv  (Bangladesh-flavoured synthetic listings)
    Hugging Face Hub: ashraq/fashion-product-images-small  (44k structured records)

Output:
    artifacts/attribute_gazetteer.json
    {
        "brands":    [...],     # known brand strings (longest first for matching)
        "colors":    [...],     # color names from baseColour + curated additions
        "materials": [...],     # material keywords
        "article_types": [...], # canonical garment / product types
        "garments":  {garment_key: [synonyms]},
        "occasions": {occasion_key: [synonyms]},
        "stats":     {"records_used": int, "synth": int, "fashion": int}
    }

Run:  python -m training.train_attributes
"""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

import pandas as pd
from datasets import load_dataset

ROOT = Path(__file__).resolve().parent.parent
ARTIFACTS = ROOT / "artifacts"
ARTIFACTS.mkdir(exist_ok=True)

# Curated base sets; mined values augment these. Keeping curated entries
# guarantees coverage even on a thin training pull.
BASE_COLORS = [
    "red", "blue", "green", "black", "white", "yellow", "pink", "purple",
    "orange", "brown", "grey", "gray", "maroon", "navy", "beige", "cream",
    "gold", "golden", "silver", "pastel", "magenta", "olive", "teal",
]
BASE_MATERIALS = [
    "cotton", "silk", "linen", "georgette", "chiffon", "denim", "wool",
    "woolen", "polyester", "viscose", "rayon", "khadi", "jamdani", "muslin",
    "leather", "synthetic",
]
BASE_BRANDS = [
    "aarong", "yellow", "ecstasy", "richman", "sailor", "le reve", "kay kraft",
    "rang bangladesh", "infinity", "cats eye", "easy", "twelve", "artisti",
]
GARMENTS = {
    "saree": ["saree", "shari", "sari", "jamdani"],
    "panjabi": ["panjabi", "punjabi"],
    "kurti": ["kurti", "kurta", "anarkali"],
    "three-piece": ["three-piece", "threepiece", "three piece", "salwar", "shalwar"],
    "shirt": ["shirt", "tshirt", "t-shirt"],
    "pant": ["pant", "trouser", "jeans", "palazzo"],
    "dress": ["dress", "frock", "gown", "lehenga"],
    "blouse": ["blouse"],
    "hijab": ["hijab", "scarf", "abaya", "burka"],
    "jacket": ["jacket", "blazer", "coat"],
    "shawl": ["shawl", "chador", "stole"],
}
OCCASIONS = {
    "festive": ["eid", "puja", "festive", "wedding", "bridal", "party", "boishakh"],
    "casual": ["casual", "daily", "everyday", "regular"],
    "formal": ["formal", "office", "corporate"],
    "winter": ["winter", "warm", "woolen"],
}

WORD_RE = re.compile(r"[A-Za-z][A-Za-z\-]+")


def mine_text(texts: list[str]) -> Counter[str]:
    counts: Counter[str] = Counter()
    for t in texts:
        if not t:
            continue
        for w in WORD_RE.findall(t.lower()):
            if len(w) < 3:
                continue
            counts[w] += 1
    return counts


def main() -> None:
    # 1) Synthetic listings
    synth_path = ROOT / "datasets" / "synthetic" / "bd_listings.csv"
    synth_texts: list[str] = []
    synth_rows = 0
    if synth_path.exists():
        df = pd.read_csv(synth_path)
        for _, r in df.iterrows():
            synth_texts.append(f"{r.get('title', '')} {r.get('description', '')}")
        synth_rows = len(df)
        print(f"synthetic listings loaded: {synth_rows}")
    else:
        print(f"warning: {synth_path} missing -- run generate_synthetic first")

    # 2) Hugging Face Fashion Product Images metadata
    print("loading fashion-product-images-small metadata (44k records) ...")
    fashion = load_dataset(
        "ashraq/fashion-product-images-small",
        split="train",
        verification_mode="no_checks",
    )
    fashion_texts = [
        f"{ex.get('productDisplayName', '')} {ex.get('articleType', '')} {ex.get('baseColour', '')}"
        for ex in fashion
    ]
    fashion_rows = len(fashion)
    print(f"fashion records: {fashion_rows}")

    # 3) Mine colors, materials, brands, article types
    all_texts = synth_texts + fashion_texts
    counts = mine_text(all_texts)

    mined_colors = sorted({c for c in BASE_COLORS} | {
        w.lower() for ex in fashion
        for w in (ex.get("baseColour") or "").split()
        if 2 < len(w) < 16
    })

    article_types = sorted({
        (ex.get("articleType") or "").strip().lower()
        for ex in fashion if ex.get("articleType")
    })

    # Materials: keep curated + any well-attested material-like tokens
    material_candidates = {
        "cotton", "silk", "linen", "georgette", "chiffon", "denim", "wool",
        "polyester", "viscose", "rayon", "khadi", "jamdani", "muslin", "leather",
        "synthetic", "nylon", "velvet", "satin", "tweed", "lace", "lycra",
        "spandex", "cashmere", "fleece", "twill", "canvas",
    }
    mined_materials = sorted(BASE_MATERIALS) + sorted(
        m for m in material_candidates if counts.get(m, 0) >= 20 and m not in BASE_MATERIALS
    )

    # Brands: use the curated BD list plus the most common capitalised tokens
    # appearing in productDisplayName (an approximation; high-precision NER
    # for brands needs labeled data).
    brand_counter: Counter[str] = Counter()
    for ex in fashion:
        name = (ex.get("productDisplayName") or "").strip()
        if not name:
            continue
        first = name.split()[0]
        if first and first[0].isupper() and 2 < len(first) < 20:
            brand_counter[first.lower()] += 1
    mined_brands = sorted(
        {b.lower() for b in BASE_BRANDS}
        | {b for b, n in brand_counter.most_common(150) if n >= 25}
    )

    out = {
        "brands": mined_brands,
        "colors": mined_colors,
        "materials": mined_materials,
        "article_types": [a for a in article_types if a],
        "garments": GARMENTS,
        "occasions": OCCASIONS,
        "stats": {
            "records_used": synth_rows + fashion_rows,
            "synthetic": synth_rows,
            "fashion": fashion_rows,
        },
    }

    path = ARTIFACTS / "attribute_gazetteer.json"
    path.write_text(json.dumps(out, indent=2))
    print(
        f"wrote {path.name}: {len(out['brands'])} brands, {len(out['colors'])} colors, "
        f"{len(out['materials'])} materials, {len(out['article_types'])} article types. "
        f"Trained on {out['stats']['records_used']} records."
    )


if __name__ == "__main__":
    main()

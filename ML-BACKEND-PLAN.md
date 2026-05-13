# DokanAI ML Backend, Architecture Design

This document specifies the machine learning backend for DokanAI: the models, the data, the training pipeline, the API contract, and how it connects to the existing Next.js app on Vercel.

Decided so far:
- Backend language: **Python** (FastAPI).
- Frontend stays **Next.js on Vercel** and calls the Python backend over HTTPS.
- Models are **trained offline** (Colab / a GPU box you control) and shipped to the backend as artifact files. The backend only does inference.

No implementation code is included here. This is the blueprint.

---

## 1. System Overview

```
┌──────────────────────────┐        HTTPS / JSON          ┌────────────────────────────────────┐
│  Next.js app (Vercel)    │ ───────────────────────────▶ │  ML Backend, FastAPI (Render/HF)    │
│  - dashboard UI          │                              │                                     │
│  - "Analyze my shop"     │ ◀─────────────────────────── │  POST /analyze-shop                 │
│    upload (CSV + photos) │       insights bundle        │  POST /classify-image               │
│  - renders insights      │                              │  GET  /trends?shop_type=...         │
└──────────────────────────┘                              │  GET  /health                       │
                                                           │                                     │
                                                           │  Loaded artifacts:                  │
                                                           │   • shop_type_clf.onnx              │
                                                           │   • attribute_extractor (spaCy/onnx)│
                                                           │   • demand_forecaster.json (XGBoost)│
                                                           │   • festival_uplift.json            │
                                                           │   • catalog_gap_rules.pkl           │
                                                           │   • fashion_style_clf.onnx          │
                                                           │   • style_index.faiss               │
                                                           │   • image_library/ (tagged photos)  │
                                                           └────────────────────────────────────┘
                                                                          ▲
                                                                          │ artifacts uploaded after each training run
                                                           ┌──────────────┴──────────────────────┐
                                                           │  Offline training (Colab, free GPU)  │
                                                           │  training/ notebooks + scripts       │
                                                           │  reads:  datasets/ (Kaggle + synth)  │
                                                           │  writes: artifacts/*.onnx / .json    │
                                                           └──────────────────────────────────────┘
```

Two repos (or two folders in one repo):
- `web/` — the existing Next.js app (already built and deployed).
- `ml-backend/` — the new Python service (this document).

---

## 2. The Model Suite

"The model" is really a suite of seven components. Four are genuinely trained models; two are fitted lightweight models; one is a scheduled analytics job. This is the right split, the hard parts (classification, extraction, forecasting, vision) are model-driven; the parts where statistics is the better tool are computed and cached.

### 2.1 Shop-Type Classifier  (trained)
- **Task:** multiclass text classification.
- **Input:** the concatenated titles + descriptions of the uploaded product listings.
- **Output:** shop category (clothing/fashion, grocery, electronics, cosmetics/beauty, home & lifestyle, food, pharmacy, stationery, ...) with a confidence score. Each listing is classified, then a confidence-weighted vote gives the shop type.
- **Algorithm:** baseline TF-IDF + Linear SVM (fast, tiny artifact). Upgrade path: fine-tuned DistilBERT or a sentence-transformer + a small classifier head, exported to ONNX.
- **Training data:** public product catalogs (Flipkart / Amazon products: title + description + category tree), augmented with synthetic Bangladesh-flavored listings (Bangla + English mixed text, BDT prices, local product names).
- **Artifact:** `shop_type_clf.onnx` + `vocab.json` (or the transformer tokenizer).

### 2.2 Attribute Extractor  (trained, per category)
- **Task:** structured field extraction / sequence labeling on a single listing.
- **Input:** one product listing (title + description).
- **Output:** structured fields: `brand`, `product_type`, `color`, `size`, `material`, `gender`, `price_band`; for fashion shops also `garment_type` (saree / panjabi / kurti / three-piece / shirt / ...), `pattern`, `occasion`.
- **Algorithm:** hybrid. High-precision regex + gazetteers (color list, size patterns, known brands) for the easy fields; a lightweight token-classification model (spaCy NER or a small fine-tuned token classifier) for the rest. Weak supervision from catalogs that already carry attribute columns.
- **Training data:** Fashion Product Images Dataset metadata (`styles.csv` already has structured attributes), plus the public product catalogs, plus rule-generated weak labels.
- **Artifact:** `attribute_extractor/` (spaCy model dir) or `attr_ner.onnx` + `gazetteers.json`.

### 2.3 Demand Forecaster  (trained)
- **Task:** per (shop, product or product-category) time-series regression.
- **Input:** the shop's uploaded sales history (`date, product_id/category, qty, unit_price`) + the Bangladesh festival calendar + the product's category.
- **Output:** forecasted units for the next 7 and 30 days per product/category; derived flags: `restock_soon`, `slow_mover`, `dead_stock`; "days of stock left" estimate.
- **Algorithm:** gradient-boosted trees (XGBoost or LightGBM) as a single global model over all series, with engineered features: lag values (1, 7, 14, 28 days), rolling means/std, day-of-week, week-of-year, days-to-next-festival, festival type one-hot, category one-hot, recent trend slope. Global model handles cold-start products/categories. Optional per-series Prophet for shops with long histories.
- **Training data:** public retail sales datasets (Rossmann Store Sales, or the Store Item Demand Forecasting set), with their holiday flags remapped to Bangladesh festivals; plus synthetic Bangladesh shop sales with festival spikes baked in (generated from the festival-boost logic already in the Next.js app).
- **Artifact:** `demand_forecaster.json` (XGBoost native format) + `feature_spec.json`.

### 2.4 Festival Demand Model  (fitted, lightweight)
- **Task:** quantify and surface per-category demand lift around each festival.
- **Input:** the same sales corpus + festival calendar.
- **Output:** an uplift table — for each `(shop_type, product_category, festival)`, the expected demand multiplier and lead time; turned into plain advice ("Ramadan in 14 days: increase dates, perfumes, prayer mats by about 2.4x; restock now").
- **Algorithm:** fit uplift coefficients (ratio of festival-window demand to baseline) from the sales data; cross-check against the forecaster's partial-dependence on `days_to_festival`. Not a heavy model, but data-driven, not hand-coded.
- **Artifact:** `festival_uplift.json`.

### 2.5 Catalog-Gap / Missing-Goods Recommender  (fitted, lightweight)
- **Task:** find product types that shops like this one carry but this shop does not.
- **Input:** the shop's catalog (set of product types) + its shop type.
- **Output:** a ranked list of missing product types, each with "carried by X% of similar shops" support and a short reason; plus complementary-product suggestions (saree → matching blouse, petticoat; burger → cold drink).
- **Algorithm:** association-rule mining (FP-Growth / Apriori) over a corpus of many shops' catalogs grouped by shop type; for a given shop, surface high-support items absent from its set, ranked by support × lift. Complementary pairs come from co-purchase mining on transaction baskets.
- **Training data:** Online Retail (UCI) transaction baskets for co-purchase; synthetic shop catalogs (one row per shop, the set of product types it stocks), grouped by shop type, for the "what similar shops carry" benchmark.
- **Artifact:** `catalog_gap_rules.pkl` (rules per shop type) + `complementary_pairs.json`.

### 2.6 Trend Detector  (scheduled analytics job, optionally model-flavored)
- **Task:** rank product types and styles by recent momentum.
- **Input:** time-aggregated sales / listing activity across all shops (and across the public datasets' time dimension); optionally Google Trends exports for fashion search terms.
- **Output:** "trending up" and "trending down" lists per shop type, each with a momentum score (recent N-week growth rate vs the prior window) and a confidence/significance value.
- **Algorithm:** rolling growth rate + a trend significance test (Mann-Kendall or a simple regression slope p-value); rank. This is recomputed on a schedule (daily/weekly cron) and the result is cached, so `/trends` is instant. A small "next-period popularity" regressor can be added later if needed.
- **Artifact:** `trends_cache.json` (refreshed by the cron job, served read-only).

### 2.7 Fashion Style Classifier + Visual Recommender  (trained, the heavy one)
- **Task:** image classification + nearest-neighbor retrieval for the "popular dress styles, shown with images" feature.
- **Inputs:**
  - At training time: a fashion image dataset labeled by article type / style / season / usage.
  - At inference time: either a context query (shop type, season, upcoming festival) or an uploaded product photo from the user.
- **Outputs:**
  - For a context: the top popular styles for that context, each with a few representative images pulled from the tagged library, plus concrete suggestions ("Eid is near; embroidered three-piece and pastel sarees are trending in clothing shops; stock more of these").
  - For an uploaded photo: the predicted garment type and style, whether that style is currently trending, and complementary/similar styles to add.
- **How "popularity" is decided:** the image model identifies *what* styles exist and what an image is; the *sales/trend data* (from 2.3 and 2.6) says *which* of those styles are hot right now. The two are joined at response time.
- **Algorithm:** transfer learning — an EfficientNet or ResNet50 backbone fine-tuned on the fashion dataset to predict `articleType` / `season` / `usage`. The penultimate-layer embeddings are indexed with FAISS so we can retrieve "more images of this style" and "visually similar styles". Exported to ONNX to keep the artifact small (roughly 20–100 MB).
- **Image library:** the fashion dataset's own images, which are openly usable, tagged with the same labels. These are the images shown to the user. (We do **not** scrape product photos and do **not** generate images, that would require an external image API, which is out of scope.)
- **Training data:** Fashion Product Images Dataset (~44k labeled images); optionally DeepFashion for richer attribute coverage.
- **Artifacts:** `fashion_style_clf.onnx`, `style_index.faiss`, `image_library/` (folder of tagged jpgs), `style_labels.json`.

### Summary table

| # | Component | Type | Core algorithm | Main training data | Artifact |
|---|---|---|---|---|---|
| 1 | Shop-Type Classifier | trained | TF-IDF+SVM → DistilBERT | product catalogs + synthetic | `shop_type_clf.onnx` |
| 2 | Attribute Extractor | trained | regex+gazetteer + NER | catalogs w/ attrs + weak labels | `attr_ner.onnx` + gazetteers |
| 3 | Demand Forecaster | trained | XGBoost global model | retail sales (holidays→festivals) + synthetic | `demand_forecaster.json` |
| 4 | Festival Demand | fitted | uplift coefficients | same sales corpus | `festival_uplift.json` |
| 5 | Catalog-Gap Recommender | fitted | FP-Growth association rules | baskets + synthetic shop catalogs | `catalog_gap_rules.pkl` |
| 6 | Trend Detector | scheduled job | rolling growth + trend test | aggregated time series | `trends_cache.json` |
| 7 | Fashion Style + Visual Rec | trained | EfficientNet transfer + FAISS | Fashion Product Images Dataset | `fashion_style_clf.onnx` + index + library |

---

## 3. Inference Flow ("Analyze my shop")

1. In the Next.js app, the user opens **Analyze my shop** and uploads:
   - shop info (name, location/region),
   - product listings as CSV (or via the existing Khata-to-Cloud style importer): `title, description, price, stock, category?`,
   - optionally sales history CSV: `date, product_id_or_name, qty, unit_price`,
   - optionally a few product photos.
2. Next.js sends this to `POST {ML_BACKEND_URL}/analyze-shop`.
3. The backend pipeline runs, in order:
   1. **Shop-Type Classifier** → shop category + confidence.
   2. **Attribute Extractor** → a structured catalog (each listing → fields).
   3. **Demand Forecaster** → per-product forecasts, `restock_soon` list, `slow_mover` / `dead_stock` list (uses sales history if provided; otherwise produces category-level estimates from the shop-type priors).
   4. **Festival Demand Model** → upcoming-festival stock advice for this shop type.
   5. **Catalog-Gap Recommender** → missing goods + complementary suggestions.
   6. **Trend Detector** (reads `trends_cache.json`) → trending-up / trending-down product types & styles for this shop type.
   7. **Fashion Style + Visual Rec** (only if the shop is clothing/fashion) → popular styles with images; if photos were uploaded, classify each and flag whether its style is trending.
4. The backend returns one structured **insights bundle** (JSON, see §5).
5. Next.js renders it. UI options: extend the existing dashboard pages, or add a dedicated **Shop Analyzer** page that shows: detected shop type, "selling well", "selling poorly", "restock these", "you're missing these", "trending now", "festival outlook", and (for clothing) a "popular styles" gallery.

---

## 4. Folder Layout (`ml-backend/`)

```
ml-backend/
├── app/
│   ├── main.py              # FastAPI app + route registration + CORS
│   ├── pipeline.py          # orchestrates the 7-step analyze flow
│   ├── schemas.py           # pydantic request/response models
│   ├── settings.py          # config (artifact paths, allowed origins)
│   └── models/
│       ├── shop_type.py     # load + predict
│       ├── attributes.py
│       ├── forecaster.py
│       ├── festival.py
│       ├── catalog_gap.py
│       ├── trends.py
│       └── fashion_style.py
├── artifacts/               # trained model files (git-lfs or pulled on boot)
│   ├── shop_type_clf.onnx
│   ├── attr_ner.onnx
│   ├── demand_forecaster.json
│   ├── festival_uplift.json
│   ├── catalog_gap_rules.pkl
│   ├── fashion_style_clf.onnx
│   ├── style_index.faiss
│   ├── style_labels.json
│   └── image_library/       # tagged fashion jpgs (served as static files)
├── training/
│   ├── notebooks/           # one Colab notebook per model
│   ├── data_prep.py         # clean + normalize Kaggle datasets
│   ├── generate_synthetic.py# Bangladesh-flavored synthetic tables
│   ├── train_shop_type.py
│   ├── train_attributes.py
│   ├── train_forecaster.py
│   ├── train_festival.py
│   ├── train_catalog_gap.py
│   ├── train_fashion_style.py
│   └── refresh_trends.py     # the cron job
├── datasets/                # downloaded + generated data (gitignored)
│   ├── raw/                 # Kaggle downloads
│   ├── processed/           # cleaned, schema-normalized
│   └── synthetic/
├── requirements.txt
├── Dockerfile               # for Render / Railway / Hugging Face Spaces
└── README.md                # how to train, where to put artifacts, how to deploy
```

---

## 5. API Contract

All JSON. CORS allows the Vercel domain only.

### `GET /health`
```
200 → { "status": "ok", "models_loaded": ["shop_type","forecaster","festival","catalog_gap","trends","fashion_style"], "version": "1.0.0" }
```

### `POST /analyze-shop`
Request:
```
{
  "shop":     { "name": "Rashida's Boutique", "region": "Dhaka" },
  "listings": [ { "title": "...", "description": "...", "price": 1850, "stock": 12, "category": null }, ... ],
  "sales":    [ { "date": "2026-04-12", "product": "Cotton Saree", "qty": 3, "unit_price": 1850 }, ... ],   // optional
  "images":   [ "data:image/jpeg;base64,...", ... ]                                                        // optional
}
```
Response (shape):
```
{
  "shop_type":      { "label": "clothing", "confidence": 0.94, "alternatives": [["beauty",0.04]] },
  "catalog":        [ { "title": "...", "product_type": "saree", "color": "red", "garment_type": "saree", "occasion": "festive", "price_band": "mid" }, ... ],
  "selling_well":   [ { "product_type": "three-piece", "units_30d": 142, "trend": "up" }, ... ],
  "selling_poorly": [ { "product_type": "wall clock", "units_30d": 2, "days_of_stock": 240 }, ... ],
  "restock_soon":   [ { "product_type": "attar perfume", "days_of_stock": 5, "forecast_7d": 26 }, ... ],
  "missing_goods":  [ { "product_type": "matching blouse", "carried_by_similar_pct": 0.78, "reason": "complements sarees you stock" }, ... ],
  "trending":       { "up": [ {"product_type":"pastel saree","momentum":0.31} ], "down": [ {"product_type":"heavy lehenga","momentum":-0.18} ] },
  "festival_outlook":[ { "festival": "Eid-ul-Adha", "date": "2026-05-27", "advice": "increase cooking knives, freezer bags, festive clothing", "expected_uplift": 2.6 }, ... ],
  "popular_styles": [ { "label": "embroidered three-piece", "momentum": 0.27, "sample_images": ["/images/12345.jpg","/images/22890.jpg"] }, ... ],     // clothing shops only
  "uploaded_image_analysis": [ { "image_index": 0, "predicted_style": "anarkali kurti", "confidence": 0.88, "trending": true, "suggestions": ["pair with palazzo","stock pastel variants"] } ]   // only if images sent
}
```

### `POST /classify-image`
```
Request:  { "image": "data:image/jpeg;base64,..." }
Response: { "predicted_style": "panjabi", "confidence": 0.91, "similar_styles": ["short kurta","sherwani"], "trending": false, "suggestions": ["festive embroidered variants are selling well"] }
```

### `GET /trends?shop_type=clothing`
```
200 → { "shop_type": "clothing", "as_of": "2026-05-13", "up": [...], "down": [...] }
```

### `POST /admin/refresh-trends`  (internal; called by the cron job, protected by a shared secret)
```
200 → { "refreshed": true, "rows": 320 }
```

---

## 6. Datasets

### Public (you download, ~3 free Kaggle files + 1 direct download)
| Purpose | Dataset | Key fields |
|---|---|---|
| Fashion images + styles | **Fashion Product Images Dataset** (Kaggle, ~44k images) | `images/*.jpg`, `styles.csv` (id, gender, masterCategory, subCategory, articleType, baseColour, season, year, usage, productDisplayName) |
| Shop-type + attribute training | **Flipkart Products** or **Amazon Products** (Kaggle) | product title, description, category tree, brand, price |
| Demand forecasting | **Rossmann Store Sales** or **Store Item Demand Forecasting** (Kaggle) | store, date, sales, customers, promo, state/holiday flags |
| Market-basket / missing-goods | **Online Retail** (UCI, direct download) | InvoiceNo, StockCode, Description, Quantity, InvoiceDate, CustomerID, Country |
| Trend signal (optional) | Google Trends CSV exports for fashion/retail terms | term, week, interest |

### Synthetic (I generate; `training/generate_synthetic.py`)
| File | Columns | Purpose |
|---|---|---|
| `shops.csv` | shop_id, shop_type, region | population of shops |
| `shop_catalogs.csv` | shop_id, product_type | what each shop stocks (for the catalog-gap benchmark) |
| `shop_sales.csv` | shop_id, date, product_type, qty, unit_price | sales with Bangladesh festival spikes baked in |
| `festival_calendar.csv` | festival, date, lead_days, peak_boost, categories | the BD festival calendar (already exists in the web app) |
| `bd_listings.csv` | title, description, price, true_shop_type | Bangla+English mixed listings to augment the shop-type classifier |

All datasets land under `datasets/raw/` (downloads), `datasets/synthetic/` (generated), then `data_prep.py` normalizes everything into `datasets/processed/` with consistent schemas.

---

## 7. Training Pipeline (offline, run in Colab)

Order of execution; each step writes to `artifacts/`:

1. `data_prep.py` — read `datasets/raw/`, clean, dedupe, normalize column names and category labels, write `datasets/processed/`.
2. `generate_synthetic.py` — produce the Bangladesh-flavored synthetic tables in `datasets/synthetic/`.
3. `train_shop_type.py` — TF-IDF + Linear SVM baseline → (optional) fine-tune DistilBERT → export `shop_type_clf.onnx`.
4. `train_attributes.py` — build gazetteers, train the token classifier on weak labels → export.
5. `train_forecaster.py` — feature engineering (lags, rolling stats, days-to-festival, category one-hot) → train XGBoost global model → export `demand_forecaster.json` + `feature_spec.json`.
6. `train_festival.py` — compute per-(shop_type, category, festival) uplift ratios → save `festival_uplift.json`.
7. `train_catalog_gap.py` — FP-Growth on shop catalogs (per shop type) + co-purchase mining on baskets → save `catalog_gap_rules.pkl` + `complementary_pairs.json`.
8. `train_fashion_style.py` — fine-tune EfficientNet on the fashion images → export `fashion_style_clf.onnx`; compute embeddings, build `style_index.faiss`; assemble the tagged `image_library/`.
9. `refresh_trends.py` — compute the initial `trends_cache.json` (then this runs on a schedule).
10. Upload everything in `artifacts/` to the backend: either committed via **git-lfs**, attached to a **GitHub release** the backend pulls on boot, or stored in a small cloud bucket (S3 / Cloudflare R2 / Hugging Face Hub) the backend downloads at startup. Heavy image artifacts argue for the bucket approach.

**Who does what:** I produce the datasets (synthetic) + the data-prep and training scripts + the notebooks. You run the notebooks in Colab (free GPU), then hand the `artifacts/` back (or let the backend pull them). You also download the ~3 Kaggle files.

---

## 8. Deployment

| Piece | Where | Notes |
|---|---|---|
| Next.js frontend | **Vercel** (already deployed) | add env var `ML_BACKEND_URL`; calls the backend from server routes |
| Python ML backend | **Render** (Docker, cheap/free tier) or **Hugging Face Spaces** (Docker SDK) or **Railway** | 512 MB–1 GB RAM is enough for ONNX inference; the fashion model is the memory constraint, ONNX export keeps it lean; cold starts of ~10–20 s are acceptable, or keep a small always-on instance |
| Artifacts | baked into the Docker image, or pulled on startup from a bucket/release | image artifacts (`image_library/`) can be served by the backend as static files, referenced in the API responses |
| Trend cron | a scheduled job (Render Cron / GitHub Actions / a `cron` in the container) that calls `POST /admin/refresh-trends` daily | keeps `/trends` instant |

CORS on FastAPI restricted to the Vercel domain. The internal `/admin/*` route is protected by a shared secret header.

---

## 9. What's a "Trained Model" vs Computed

Being precise so expectations are right:
- **Genuinely trained:** Shop-Type Classifier, Attribute Extractor, Demand Forecaster, Fashion Style Classifier. These learn weights from data.
- **Fitted lightweight models:** Festival Demand uplift coefficients, Catalog-Gap association rules. Data-driven, but not gradient-trained.
- **Pure analytics, cached:** "selling well / poorly" aggregations, Trend Detector. The right tool here is statistics, not a neural net; dressing these up as "models" would be theater.

The end result is model-driven for everything that genuinely needs learning, and statistically sound for the rest.

---

## 10. Build Phases

**Phase 1 — MVP backend (text + tabular only).** Shop-Type Classifier + Demand Forecaster + Festival Demand + Catalog-Gap + Trend Detector. Small artifacts, fast to train, fits on any free tier. Delivers: detected shop type, selling well/poorly, restock list, missing goods, trending goods, festival outlook. This is most of the listed value with none of the GPU/image complexity.

**Phase 2 — Fashion vision.** Fashion Style Classifier + FAISS retrieval + the tagged image library + the "popular styles with images" UI + uploaded-photo classification. Needs the image dataset and a slightly beefier backend instance.

**Phase 3 — Polish.** Attribute Extractor refinement, scheduled trend refresh in production, model versioning + a `/health` model manifest, basic monitoring (request logs, prediction distributions), and an "upload your real CSV" importer in the web app.

---

## 11. Open Decisions

1. **Artifact delivery:** git-lfs vs GitHub release vs cloud bucket. Recommendation: bucket (R2 / HF Hub) because of the image library size.
2. **Backend host:** Render vs Hugging Face Spaces vs Railway. Recommendation: Render (Docker, predictable, cheap) for Phase 1; revisit for Phase 2 if the image model needs more RAM.
3. **Shop-type classifier model size:** SVM baseline first (ships in days), transformer upgrade later. Recommendation: ship the SVM, keep the transformer as Phase 3.
4. **How the user uploads data:** CSV import vs a guided form vs reuse the Khata-to-Cloud uploader. Recommendation: CSV import for listings + sales (clean, fast), photo upload for a few product images.

---

## 12. Suggested Next Step

Once you approve this design, the order of work is:
1. I scaffold `ml-backend/` (FastAPI skeleton, schemas, route stubs, Dockerfile) — no models yet, just the contract working end to end with stub responses.
2. I write `generate_synthetic.py` and `data_prep.py`, and you download the ~3 Kaggle files.
3. I write `train_*.py` + the Colab notebooks for Phase 1 models; you run them; you return `artifacts/`.
4. The backend loads the real artifacts; I wire the Next.js "Analyze my shop" page to it.
5. Phase 2 (fashion vision) after Phase 1 is live.

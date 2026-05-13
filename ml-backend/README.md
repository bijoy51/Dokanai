# DokanAI ML Backend

FastAPI service that backs the **Analyze my Shop** feature: it detects the shop type, extracts catalogue attributes, forecasts demand, surfaces festival outlook + missing goods + trends, and (for clothing shops) returns popular dress styles with sample images.

See `../ML-BACKEND-PLAN.md` for the full design.

## Quick start (local)

Python 3.11+.

```bash
cd ml-backend
python -m venv .venv && source .venv/Scripts/activate   # or .venv/bin/activate on macOS/Linux
pip install -r requirements.txt
python -m training.generate_synthetic                    # produces datasets/synthetic/
uvicorn app.main:app --reload --port 8000
```

Open http://localhost:8000/docs for the interactive Swagger UI.

The service starts **with no trained models** and uses heuristic fallbacks, so every endpoint works immediately. Train the real models when you're ready (next section); the backend will pick them up the next time it starts.

## Endpoints

| Method | Path | What it does |
|---|---|---|
| GET  | `/health` | Liveness + which models are loaded vs falling back |
| POST | `/analyze-shop` | Full insights bundle from listings + optional sales + optional photos |
| POST | `/classify-image` | Classify a single product photo's style |
| GET  | `/trends?shop_type=clothing` | Cached market-trend lists |
| POST | `/admin/refresh-trends` | Re-read `trends_cache.json` after the cron job rewrites it (header `X-Admin-Secret`) |

The exact request/response schemas live in [`app/schemas.py`](app/schemas.py).

## Training

Each script writes a model file under `artifacts/`. Re-deploying the backend with a new `artifacts/` makes the new model live.

```bash
# Phase 1: lightweight models (CPU is fine; minutes)
python -m training.generate_synthetic        # synthetic Bangladesh-flavoured data
python -m training.data_prep                 # normalise downloaded Kaggle / UCI files (optional)
python -m training.train_shop_type           # -> artifacts/shop_type_clf.joblib
python -m training.train_forecaster          # -> artifacts/demand_forecaster.json
python -m training.train_festival            # -> artifacts/festival_uplift.json
python -m training.train_catalog_gap         # -> artifacts/catalog_gap_rules.pkl
python -m training.refresh_trends            # -> artifacts/trends_cache.json

# Phase 2: fashion vision (needs GPU; run in Colab)
pip install -r requirements-train.txt
python -m training.train_fashion_style       # -> artifacts/fashion_style_clf.onnx + index + image_library/
```

### Datasets you need to download (free)

Drop these into `datasets/raw/` before running `data_prep.py`:

1. **Fashion Product Images Dataset** (Kaggle): `kaggle datasets download paramaggarwal/fashion-product-images-dataset` — unzip so you have `datasets/raw/fashion_images/styles.csv` + `datasets/raw/fashion_images/images/*.jpg`.
2. **Flipkart Products** or **Amazon Products** (Kaggle): any product-catalogue CSV with title / description / category.
3. **Rossmann Store Sales** or **Store Item Demand Forecasting** (Kaggle): `train.csv` renamed to `retail_sales.csv`.
4. **Online Retail** (UCI, direct download): `online_retail.xlsx`.

The synthetic generator already covers everything Phase 1 needs, so the public datasets are optional for the first training pass.

## Deployment

The backend is a stock Docker image — pick any host that runs containers:

- **Render**: New Web Service → "Existing Dockerfile" → set `ALLOWED_ORIGINS=https://dokanai.vercel.app` and (optional) `ADMIN_SECRET`. 512 MB RAM tier is enough for Phase 1; bump for Phase 2.
- **Hugging Face Spaces**: SDK = "Docker", upload the same Dockerfile.
- **Railway / Fly.io**: same flow.

In the Next.js frontend, set `ML_BACKEND_URL` to the deployed URL; the app will call it from a server route. CORS on the backend should allow only the Vercel domain in production.

## How the artifacts ship

For Phase 1, the trained files are small (<10 MB total) — commit them via **git-lfs** or attach to a **GitHub release** that the Dockerfile pulls during build.

For Phase 2, the fashion ONNX + image library are larger (~50–200 MB) — keep them in a cloud bucket (Cloudflare R2 / Hugging Face Hub / S3) and pull them at container startup. Set `ARTIFACTS_DIR` to the mounted path.

## Folder map

```
ml-backend/
├── app/
│   ├── main.py              FastAPI app + routes + CORS + startup
│   ├── pipeline.py          orchestrates the 7-step /analyze-shop flow
│   ├── schemas.py           pydantic request/response models
│   ├── settings.py          env-driven config
│   ├── data/festivals.py    Bangladesh festival calendar (mirrors the web app)
│   └── models/              one module per ML component
│       ├── shop_type.py
│       ├── attributes.py
│       ├── forecaster.py
│       ├── festival.py
│       ├── catalog_gap.py
│       ├── trends.py
│       └── fashion_style.py
├── artifacts/               trained model files (gitignored; ship via git-lfs / bucket)
├── training/                offline training pipeline
│   ├── generate_synthetic.py
│   ├── data_prep.py
│   ├── train_shop_type.py
│   ├── train_forecaster.py
│   ├── train_festival.py
│   ├── train_catalog_gap.py
│   ├── train_fashion_style.py
│   └── refresh_trends.py
├── datasets/                raw + synthetic + processed (gitignored)
├── requirements.txt         inference deps
├── requirements-train.txt   training-only heavy deps (torch, faiss, spacy)
├── Dockerfile
├── .dockerignore
└── .gitignore
```

## Environment variables

| Name | Default | Notes |
|---|---|---|
| `ARTIFACTS_DIR` | `./artifacts` | Where the model files live at runtime |
| `DATASETS_DIR`  | `./datasets`  | Where training data lives (offline) |
| `ALLOWED_ORIGINS` | `*` | Comma-separated; set to your Vercel domain in production |
| `ADMIN_SECRET` | `dev-admin-secret-change-me` | Required header for `/admin/*` routes |
| `PORT` | `8000` | Honoured by the Docker `CMD` |

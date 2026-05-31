---
title: DokanAI ML Backend
emoji: 🛍️
colorFrom: green
colorTo: yellow
sdk: docker
app_port: 7860
pinned: false
---

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

## Churn predictor — Windows quickstart (PowerShell)

The `/predict/churn` endpoint serves an XGBoost classifier with SHAP
explanations. To train it locally on Windows and verify it end-to-end:

```powershell
cd ml-backend

# 1) Create + activate a venv (one-time)
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# 2) Install runtime + training deps
pip install -r requirements.txt -r requirements-train.txt

# 3) Train the model. Writes artifacts/churn/{model,explainer,meta}.* (~few seconds)
python -m training.churn_train

# 4) Run the backend
$env:ADMIN_SECRET = "local-dev-secret"
uvicorn app.main:app --reload --port 7860

# 5) In a NEW PowerShell window, smoke-test the predict endpoint
$body = @{
  category = "clothing"
  features = @{
    recency_days       = 90
    frequency_90d      = 1
    monetary           = 1500
    avg_order_gap_days = 60
    tenure_days        = 200
    cancel_rate        = 0.0
  }
} | ConvertTo-Json
Invoke-RestMethod `
  -Uri  http://localhost:7860/predict/churn `
  -Method POST `
  -Headers @{ "x-admin-secret" = "local-dev-secret" } `
  -ContentType "application/json" `
  -Body $body
```

You should see a response with `churn_probability`, `risk_tier`, and a
`top_drivers` list explaining which features pushed the prediction.

### Wiring it to the Next.js frontend

The frontend's Pilot agent has a tool `predict_churn_for_customer`
([lib/agent/tools.ts](../lib/agent/tools.ts)) that calls this endpoint.
For it to work, the Next.js app needs the same two env vars it already
uses for the `/kv` store:

| Env var (Next.js) | Value |
|---|---|
| `ML_BACKEND_URL` | `http://localhost:7860` for local, or your HF Space URL |
| `ML_ADMIN_SECRET` | must equal this backend's `ADMIN_SECRET` |

If either is missing, the Pilot tool gracefully returns
`available: false` with a friendly reason — every other Pilot feature
continues to work.

### Deploying the model to the HF Space

The artifact files in `artifacts/churn/` are needed at runtime. Options:

1. **Commit + push** (simplest for hackathon scale; artifacts are
   ~few MB):
   ```powershell
   git add artifacts/churn/*
   git commit -m "Train churn-v1"
   git subtree push --prefix ml-backend space main
   ```

2. **Train inside the Space** on startup by adding
   `python -m training.churn_train` to `Dockerfile`'s CMD chain
   (slower cold start, no LFS needed).

Until artifacts exist on the Space, `/predict/churn` returns
`{ready: false, error: "...run training/churn_train..."}` and the
Pilot tool surfaces it as a friendly "not configured" message —
nothing crashes.

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

The backend is a stock Docker image — pick any host that runs containers.

**Important: don't try to put this on Vercel's serverless runtime.** Vercel's AWS Lambda layer caps ephemeral storage at 500 MB and the inference stack (scikit-learn + scipy + xgboost + onnxruntime + Pillow) needs ~860 MB at install time. Use a real container host instead.

### Hugging Face Spaces (recommended; fastest free path)

1. Sign in at https://huggingface.co and click **New Space**.
2. Owner = you · Name = `dokanai-ml` · Space SDK = **Docker** · Visibility = Public · Hardware = CPU basic (free).
3. After creation, the Space gives you a `git remote add space …` command. Add it to this `ml-backend/` folder and `git push space main`. The Space builds from `Dockerfile`.
4. In the Space's *Settings → Repository secrets*: add `ALLOWED_ORIGINS=https://dokanai.vercel.app` and (optional) `ADMIN_SECRET=<random>`.
5. The public URL is `https://<your-username>-dokanai-ml.hf.space`.

### Render

1. Sign in at https://render.com → **New Web Service** → connect this repo.
2. Root directory: `ml-backend`. Environment: **Docker**. Plan: free tier is fine for Phase 1; bump for Phase 2.
3. Env vars: same as above.

### Railway / Fly.io

Same flow; both auto-detect the Dockerfile.

### Wiring it into the Next.js app

Once you have the backend URL, set `ML_BACKEND_URL=https://<your-backend-host>` in the Vercel project settings (Environment Variables → Production). Redeploy the frontend. The Analyze page will switch from the heuristic banner to "Powered by the trained ML backend" on the next request.

## How the artifacts ship

All trained artifacts (5 Phase 1 models + the 16 MB fashion ONNX + 130-image library) total ~17 MB and are **committed directly to the repo** under `artifacts/`. No git-lfs and no separate bucket needed. The Dockerfile copies them into the image at build time. To re-train, run the training scripts and commit the new files.

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

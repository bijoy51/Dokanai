"""FastAPI entry point. Loads all models at startup and exposes the API."""
from __future__ import annotations

import os
from datetime import date
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .pipeline import pipeline
from .schemas import (
    AnalyzeShopRequest,
    AnalyzeShopResponse,
    ClassifyImageRequest,
    ClassifyImageResponse,
    HealthResponse,
    TrendItem,
    TrendsResponse,
)
from .settings import ADMIN_SECRET, ALLOWED_ORIGINS, APP_VERSION, ARTIFACTS_DIR


app = FastAPI(
    title="DokanAI ML Backend",
    version=APP_VERSION,
    description="Shop-type detection, demand forecasting, catalog gap analysis, trends and fashion-style insights.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS or ["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup() -> None:
    pipeline.load_all()
    # Serve the fashion image library if it exists, so the frontend can fetch /images/<filename>.
    library = ARTIFACTS_DIR / "image_library"
    if library.exists() and library.is_dir():
        app.mount("/images", StaticFiles(directory=str(library)), name="images")


# ---------- public routes ----------

@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    loaded, missing = pipeline.loaded_status()
    return HealthResponse(
        status="ok",
        version=APP_VERSION,
        models_loaded=loaded,
        models_missing=missing,
    )


@app.post("/analyze-shop", response_model=AnalyzeShopResponse)
def analyze_shop(req: AnalyzeShopRequest) -> AnalyzeShopResponse:
    if not req.listings:
        raise HTTPException(status_code=400, detail="At least one listing is required.")
    return pipeline.analyze(req)


@app.post("/classify-image", response_model=ClassifyImageResponse)
def classify_image(req: ClassifyImageRequest) -> ClassifyImageResponse:
    if not req.image:
        raise HTTPException(status_code=400, detail="image (base64) is required.")
    result = pipeline.fashion.classify(req.image)
    return ClassifyImageResponse(**result)


@app.get("/trends", response_model=TrendsResponse)
def trends(shop_type: str = "clothing") -> TrendsResponse:
    data = pipeline.trends.for_shop_type(shop_type)
    return TrendsResponse(
        shop_type=shop_type,
        as_of=data.get("as_of", date.today().isoformat()),
        up=[TrendItem(**t) for t in data.get("up", [])],
        down=[TrendItem(**t) for t in data.get("down", [])],
    )


# ---------- internal routes ----------

@app.post("/admin/refresh-trends")
def admin_refresh_trends(x_admin_secret: str = Header(default="")) -> dict:
    if x_admin_secret != ADMIN_SECRET:
        raise HTTPException(status_code=401, detail="invalid admin secret")
    # Re-read the trends cache from disk (the cron job rewrites the file).
    pipeline.trends.load()
    loaded = pipeline.trends.loaded
    return {"refreshed": True, "cache_loaded": loaded}


@app.exception_handler(Exception)
async def _unhandled(_: Request, exc: Exception):
    # Never leak a stack trace; surface a clean error to the frontend.
    return JSONResponse(status_code=500, content={"detail": f"Internal error: {type(exc).__name__}"})

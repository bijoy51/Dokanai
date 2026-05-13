"""Pydantic request/response models for the API contract (see ML-BACKEND-PLAN.md §5)."""
from __future__ import annotations

from typing import List, Optional, Tuple
from pydantic import BaseModel, Field


# ---------- requests ----------

class ShopInfo(BaseModel):
    name: Optional[str] = None
    region: Optional[str] = None


class Listing(BaseModel):
    title: str
    description: Optional[str] = ""
    price: Optional[float] = None
    stock: Optional[int] = None
    category: Optional[str] = None


class SaleRow(BaseModel):
    date: str  # YYYY-MM-DD
    product: str
    qty: int = 1
    unit_price: Optional[float] = None


class AnalyzeShopRequest(BaseModel):
    shop: ShopInfo = Field(default_factory=ShopInfo)
    listings: List[Listing] = Field(default_factory=list)
    sales: List[SaleRow] = Field(default_factory=list)
    images: List[str] = Field(default_factory=list)  # base64 data URLs


class ClassifyImageRequest(BaseModel):
    image: str  # base64 data URL or raw base64


# ---------- response pieces ----------

class ShopTypeResult(BaseModel):
    label: str
    confidence: float
    alternatives: List[Tuple[str, float]] = []
    method: str = "model"  # "model" | "heuristic"


class CatalogItem(BaseModel):
    title: str
    product_type: Optional[str] = None
    brand: Optional[str] = None
    color: Optional[str] = None
    size: Optional[str] = None
    material: Optional[str] = None
    gender: Optional[str] = None
    garment_type: Optional[str] = None
    occasion: Optional[str] = None
    price_band: Optional[str] = None


class SellingItem(BaseModel):
    product_type: str
    units_30d: int
    trend: str = "flat"  # "up" | "down" | "flat"


class PoorItem(BaseModel):
    product_type: str
    units_30d: int
    days_of_stock: float


class RestockItem(BaseModel):
    product_type: str
    days_of_stock: float
    forecast_7d: int


class MissingItem(BaseModel):
    product_type: str
    carried_by_similar_pct: float
    reason: str


class TrendItem(BaseModel):
    product_type: str
    momentum: float


class Trending(BaseModel):
    up: List[TrendItem] = []
    down: List[TrendItem] = []


class FestivalOutlookItem(BaseModel):
    festival: str
    date: str
    advice: str
    expected_uplift: float
    categories: List[str] = []


class PopularStyle(BaseModel):
    label: str
    momentum: float
    note: str = ""
    emoji: str = ""
    sample_images: List[str] = []


class UploadedImageAnalysis(BaseModel):
    image_index: int
    predicted_style: str
    confidence: float
    trending: bool = False
    suggestions: List[str] = []


class AnalyzeShopResponse(BaseModel):
    source: str  # "ml-backend" | "heuristic-fallback"
    shop_type: ShopTypeResult
    catalog: List[CatalogItem] = []
    selling_well: List[SellingItem] = []
    selling_poorly: List[PoorItem] = []
    restock_soon: List[RestockItem] = []
    missing_goods: List[MissingItem] = []
    trending: Trending = Field(default_factory=Trending)
    festival_outlook: List[FestivalOutlookItem] = []
    popular_styles: List[PopularStyle] = []
    uploaded_image_analysis: List[UploadedImageAnalysis] = []
    notes: List[str] = []


class ClassifyImageResponse(BaseModel):
    predicted_style: str
    confidence: float
    similar_styles: List[str] = []
    trending: bool = False
    suggestions: List[str] = []
    method: str = "model"


class TrendsResponse(BaseModel):
    shop_type: str
    as_of: str
    up: List[TrendItem] = []
    down: List[TrendItem] = []


class HealthResponse(BaseModel):
    status: str
    version: str
    models_loaded: List[str]
    models_missing: List[str]
    model_versions: dict = {}  # {model_name: artifact_filename or "heuristic"}

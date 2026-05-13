"""Orchestrates the seven-step /analyze-shop pipeline."""
from __future__ import annotations

from typing import List

from .schemas import (
    AnalyzeShopRequest,
    AnalyzeShopResponse,
    CatalogItem,
    FestivalOutlookItem,
    MissingItem,
    PoorItem,
    PopularStyle,
    RestockItem,
    SellingItem,
    ShopTypeResult,
    TrendItem,
    Trending,
    UploadedImageAnalysis,
)
from .models.shop_type import ShopTypeClassifier
from .models.attributes import AttributeExtractor
from .models.forecaster import DemandForecaster
from .models.festival import FestivalDemandModel
from .models.catalog_gap import CatalogGapRecommender
from .models.trends import TrendDetector
from .models.fashion_style import FashionStyleModel


class Pipeline:
    """Singleton bundle of all seven components, instantiated once at startup."""

    def __init__(self) -> None:
        self.shop_type = ShopTypeClassifier()
        self.attributes = AttributeExtractor()
        self.forecaster = DemandForecaster()
        self.festival = FestivalDemandModel()
        self.catalog_gap = CatalogGapRecommender()
        self.trends = TrendDetector()
        self.fashion = FashionStyleModel()
        self._components = [
            self.shop_type, self.attributes, self.forecaster,
            self.festival, self.catalog_gap, self.trends, self.fashion,
        ]

    def load_all(self) -> None:
        for c in self._components:
            c.load()

    def loaded_status(self) -> tuple[List[str], List[str]]:
        loaded, missing = [], []
        for c in self._components:
            (loaded if c.loaded else missing).append(c.name)
        return loaded, missing

    # ----- main entry point -----

    def analyze(self, req: AnalyzeShopRequest) -> AnalyzeShopResponse:
        listings = [l.model_dump() for l in req.listings]
        sales = [s.model_dump() for s in req.sales]

        # 1. Shop type
        label, conf, alts, method = self.shop_type.predict(listings)
        shop_type = ShopTypeResult(label=label, confidence=conf, alternatives=alts, method=method)

        # 2. Attribute extraction (per listing)
        catalog = [self.attributes.extract(l) for l in listings]

        # 3-4. Forecaster -> selling well/poorly, restock
        selling_well, selling_poorly, restock_soon = self.forecaster.forecast(
            listings, catalog, sales, label
        )

        # 5. Festival outlook
        festival_outlook = self.festival.outlook(label)

        # 6. Missing goods
        missing = self.catalog_gap.recommend(label, catalog)

        # 7. Trends (from sales if we have them, else cache, else seasonal default)
        trends = self.trends.from_sales(label, sales) if sales else self.trends.for_shop_type(label)

        # 8. Popular styles + uploaded-image analysis (clothing shops only)
        popular_styles = self.fashion.popular_styles(label) if label == "clothing" else []
        uploaded = self.fashion.analyze_uploaded(req.images) if req.images and label == "clothing" else []

        loaded, missing_models = self.loaded_status()
        source = "ml-backend" if all(c.loaded for c in [self.shop_type, self.forecaster]) else "heuristic-fallback"
        notes = []
        if missing_models:
            notes.append(f"Models using heuristic fallback: {', '.join(missing_models)}.")
        if not sales:
            notes.append("No sales history uploaded — forecasts use category priors.")

        return AnalyzeShopResponse(
            source=source,
            shop_type=shop_type,
            catalog=[CatalogItem(**c) for c in catalog],
            selling_well=[SellingItem(**s) for s in selling_well],
            selling_poorly=[PoorItem(**p) for p in selling_poorly],
            restock_soon=[RestockItem(**r) for r in restock_soon],
            missing_goods=[MissingItem(**m) for m in missing],
            trending=Trending(
                up=[TrendItem(**t) for t in trends.get("up", [])],
                down=[TrendItem(**t) for t in trends.get("down", [])],
            ),
            festival_outlook=[FestivalOutlookItem(**f) for f in festival_outlook],
            popular_styles=[PopularStyle(**s) for s in popular_styles],
            uploaded_image_analysis=[UploadedImageAnalysis(**u) for u in uploaded],
            notes=notes,
        )


pipeline = Pipeline()

"""Runtime configuration, read from environment variables."""
from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
ARTIFACTS_DIR = Path(os.getenv("ARTIFACTS_DIR", BASE_DIR / "artifacts"))
DATASETS_DIR = Path(os.getenv("DATASETS_DIR", BASE_DIR / "datasets"))

# CORS: comma-separated list of allowed origins (the Vercel domain).
# "*" allows everything (fine for local dev; lock it down in production).
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv("ALLOWED_ORIGINS", "*").split(",")
    if o.strip()
]

# Shared secret for the internal /admin/* routes.
ADMIN_SECRET = os.getenv("ADMIN_SECRET", "dev-admin-secret-change-me")

APP_VERSION = "1.0.0"

"""Rebuild artifacts/image_library/ with higher-resolution photos.

The fashion classifier was trained on 60x80 thumbnails from
ashraq/fashion-product-images-small. Those thumbnails look blurry when
shown in the dashboard cards (~370x280). The model only needs 60x80
input, but the IMAGE LIBRARY we show to users can be any resolution.

This script streams benitomartin/fashion-product-images-small-384x512
(same 44k items, ~6x higher resolution) and saves 5 representative
images per articleType into artifacts/image_library/, then writes
artifacts/image_library_index.json. The fashion classifier model and
labels are untouched.

Run:  python -m training.refresh_image_library
"""
from __future__ import annotations

import io
import json
from collections import defaultdict
from pathlib import Path

from datasets import load_dataset
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ARTIFACTS = ROOT / "artifacts"
LIB = ARTIFACTS / "image_library"

# Use the labels the classifier was trained on so the keys match exactly.
LABELS = json.loads((ARTIFACTS / "style_labels.json").read_text())
LABEL_SET = set(LABELS)


def main(images_per_label: int = 5) -> None:
    LIB.mkdir(parents=True, exist_ok=True)
    # Clear old low-res library
    for old in LIB.glob("*.jpg"):
        old.unlink()

    chosen: dict[str, list[str]] = defaultdict(list)
    needed = {l: images_per_label for l in LABELS}
    print(f"target: {images_per_label} images x {len(LABELS)} classes = {images_per_label * len(LABELS)} total")

    # Stream the dataset so we don't have to download everything to disk.
    print("streaming benitomartin/fashion-product-images-small-384x512 ...")
    ds = load_dataset(
        "benitomartin/fashion-product-images-small-384x512",
        split="train",
        streaming=True,
    )

    total_seen = 0
    saved = 0
    for ex in ds:
        total_seen += 1
        if total_seen % 2000 == 0:
            done = sum(1 for l in LABELS if needed[l] == 0)
            print(f"  scanned {total_seen}, classes filled: {done}/{len(LABELS)}, images saved: {saved}")
        label = ex.get("articleType")
        if not label or label not in LABEL_SET or needed[label] == 0:
            continue
        img = ex.get("image")
        if img is None:
            continue
        # Some entries deliver bytes, some PIL.Image, depending on cast.
        if isinstance(img, dict) and "bytes" in img:
            try:
                img = Image.open(io.BytesIO(img["bytes"])).convert("RGB")
            except Exception:
                continue
        elif hasattr(img, "convert"):
            img = img.convert("RGB")
        else:
            continue
        sid = ex.get("id")
        if sid is None:
            sid = f"{label.replace(' ', '_')}_{images_per_label - needed[label]}"
        fname = f"{sid}.jpg"
        try:
            img.save(LIB / fname, "JPEG", quality=85)
        except Exception:
            continue
        chosen[label].append(fname)
        needed[label] -= 1
        saved += 1
        if all(n == 0 for n in needed.values()):
            break

    (ARTIFACTS / "image_library_index.json").write_text(json.dumps(chosen, indent=2))
    missing = [l for l, n in needed.items() if n > 0]
    print(f"done. saved {saved} high-res images for {len(chosen)} classes")
    if missing:
        print(f"  warning: {len(missing)} classes did not reach full quota:")
        for l in missing[:5]:
            print(f"    {l}: have {images_per_label - needed[l]} / {images_per_label}")


if __name__ == "__main__":
    main()

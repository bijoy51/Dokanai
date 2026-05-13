"""Fine-tune the Fashion Style Classifier (EfficientNet) on the Fashion Product
Images Dataset, export to ONNX, build the FAISS retrieval index, and assemble
the tagged image library.

Phase 2 of the build. Run after datasets/processed/fashion_styles.csv is in
place and you've installed the optional training deps (torch, torchvision, faiss-cpu).

This script is parameterised but intentionally minimal so it fits in a Colab
notebook; copy each section into cells for interactive runs.
"""
from __future__ import annotations

import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ARTIFACTS = ROOT / "artifacts"
ARTIFACTS.mkdir(exist_ok=True)
LIBRARY_DIR = ARTIFACTS / "image_library"
LIBRARY_DIR.mkdir(exist_ok=True)


def main(epochs: int = 5, image_size: int = 224, batch_size: int = 64) -> None:
    try:
        import torch
        import torch.nn as nn
        from torch.utils.data import DataLoader, Dataset
        from torchvision import transforms
        from torchvision.models import efficientnet_b0, EfficientNet_B0_Weights
        from PIL import Image
        import pandas as pd
        import numpy as np
    except ImportError as e:
        raise SystemExit(
            f"This script needs torch / torchvision / Pillow / pandas / numpy. "
            f"Install requirements-train.txt first. Missing: {e}"
        )

    styles_csv = ROOT / "datasets" / "processed" / "fashion_styles.csv"
    images_dir = ROOT / "datasets" / "raw" / "fashion_images" / "images"
    if not styles_csv.exists() or not images_dir.exists():
        raise SystemExit("fashion dataset missing — run training.data_prep after dropping the Kaggle files in.")

    df = pd.read_csv(styles_csv)
    # Predict articleType (e.g. "Saree", "Kurtis", "Shirts", ...).
    label_col = "articleType"
    df = df.dropna(subset=[label_col])
    labels = sorted(df[label_col].unique().tolist())
    lbl2idx = {l: i for i, l in enumerate(labels)}
    df["y"] = df[label_col].map(lbl2idx)

    class StyleDataset(Dataset):
        def __init__(self, frame, tfm):
            self.frame = frame.reset_index(drop=True)
            self.tfm = tfm

        def __len__(self):
            return len(self.frame)

        def __getitem__(self, i):
            row = self.frame.iloc[i]
            img = Image.open(images_dir / row["image"]).convert("RGB")
            return self.tfm(img), int(row["y"])

    tfm = transforms.Compose([
        transforms.Resize((image_size, image_size)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])

    # 90/10 train/val split.
    df = df.sample(frac=1, random_state=42).reset_index(drop=True)
    cut = int(len(df) * 0.9)
    train_ds = StyleDataset(df.iloc[:cut], tfm)
    val_ds = StyleDataset(df.iloc[cut:], tfm)
    train_dl = DataLoader(train_ds, batch_size=batch_size, shuffle=True, num_workers=2)
    val_dl = DataLoader(val_ds, batch_size=batch_size, shuffle=False, num_workers=2)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = efficientnet_b0(weights=EfficientNet_B0_Weights.IMAGENET1K_V1)
    model.classifier[1] = nn.Linear(model.classifier[1].in_features, len(labels))
    model.to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=3e-4, weight_decay=1e-4)
    crit = nn.CrossEntropyLoss()

    for ep in range(epochs):
        model.train()
        for xb, yb in train_dl:
            xb, yb = xb.to(device), yb.to(device)
            opt.zero_grad()
            loss = crit(model(xb), yb)
            loss.backward()
            opt.step()

        model.eval()
        correct, total = 0, 0
        with torch.no_grad():
            for xb, yb in val_dl:
                xb, yb = xb.to(device), yb.to(device)
                preds = model(xb).argmax(1)
                correct += (preds == yb).sum().item()
                total += yb.numel()
        print(f"epoch {ep + 1}/{epochs}  val_acc={correct / total:.3f}")

    # Export to ONNX.
    model.eval()
    dummy = torch.randn(1, 3, image_size, image_size, device=device)
    onnx_path = ARTIFACTS / "fashion_style_clf.onnx"
    torch.onnx.export(model, dummy, str(onnx_path), input_names=["input"], output_names=["logits"], opset_version=13)
    (ARTIFACTS / "style_labels.json").write_text(json.dumps(labels))
    print(f"wrote {onnx_path} and style_labels.json")

    # Build FAISS index of penultimate-layer embeddings + tagged image library.
    try:
        import faiss
    except ImportError:
        print("faiss not installed — skipping retrieval index.")
        return

    backbone = nn.Sequential(*list(model.children())[:-1])
    backbone.eval()

    embs = []
    chosen_per_label: dict = {l: [] for l in labels}
    with torch.no_grad():
        for i, row in df.iterrows():
            try:
                img = Image.open(images_dir / row["image"]).convert("RGB")
            except Exception:
                continue
            x = tfm(img).unsqueeze(0).to(device)
            v = backbone(x).flatten(1).cpu().numpy()
            embs.append(v[0])
            lbl = row[label_col]
            if len(chosen_per_label[lbl]) < 6:
                # Copy this image into the tagged library and remember the filename.
                dst = LIBRARY_DIR / row["image"]
                if not dst.exists():
                    dst.write_bytes((images_dir / row["image"]).read_bytes())
                chosen_per_label[lbl].append(row["image"])

    arr = np.vstack(embs).astype("float32")
    index = faiss.IndexFlatL2(arr.shape[1])
    index.add(arr)
    faiss.write_index(index, str(ARTIFACTS / "style_index.faiss"))
    (ARTIFACTS / "image_library_index.json").write_text(json.dumps(chosen_per_label, indent=2))
    print(f"wrote FAISS index with {len(embs)} embeddings and image_library_index.json")


if __name__ == "__main__":
    main()

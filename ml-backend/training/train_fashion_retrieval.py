"""Phase 2 Fashion Style Classifier, CPU-friendly retrieval variant.

Strategy:
    1. Frozen pre-trained EfficientNet-B0 (ImageNet weights) acts as a feature
       extractor on ~4000 samples from the Fashion Product Images dataset
       (downloaded from Hugging Face Hub, no Kaggle login required).
    2. A scikit-learn Logistic Regression is trained on those embeddings to
       map them to articleType labels (saree, kurti, shirt, ...).
    3. The LogReg weights are baked into the final Linear layer of the
       PyTorch model and the whole thing is exported as a single
       fashion_style_clf.onnx — same artifact name and semantics the
       inference module already expects (image -> class logits).
    4. A few representative images per class are copied into
       artifacts/image_library/ so the API can serve them.

Tradeoff vs full fine-tuning: ~65-80% top-1 accuracy instead of ~85-90%.
Same artifact filename means we can swap in the fine-tuned version later
without touching the backend code.

Run:  python -m training.train_fashion_retrieval
"""
from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torchvision import transforms
from torchvision.models import EfficientNet_B0_Weights, efficientnet_b0
from datasets import load_dataset
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score
from sklearn.model_selection import train_test_split

ROOT = Path(__file__).resolve().parent.parent
ARTIFACTS = ROOT / "artifacts"
LIB = ARTIFACTS / "image_library"
LIB.mkdir(parents=True, exist_ok=True)


def main(n_samples: int = 4000, min_per_class: int = 40, batch_size: int = 32) -> None:
    print(f"loading {n_samples} samples from ashraq/fashion-product-images-small ...")
    ds = load_dataset(
        "ashraq/fashion-product-images-small",
        split=f"train[:{n_samples}]",
        verification_mode="no_checks",
    )

    counts = Counter(ex["articleType"] for ex in ds if ex["articleType"])
    keep = {t for t, n in counts.items() if n >= min_per_class}
    filtered = [ex for ex in ds if ex["articleType"] in keep]
    labels = sorted(keep)
    lbl2idx = {l: i for i, l in enumerate(labels)}
    print(f"keeping {len(labels)} classes ({min_per_class}+ per class), {len(filtered)} samples total")

    cache_x = ARTIFACTS / "_embeddings_cache.npz"

    tfm = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])

    print("loading frozen EfficientNet-B0 ...")
    backbone = efficientnet_b0(weights=EfficientNet_B0_Weights.IMAGENET1K_V1)
    embed_dim = backbone.classifier[1].in_features
    backbone.classifier = nn.Identity()
    backbone.eval()

    def embed(images):
        with torch.no_grad():
            t = torch.stack([tfm(img.convert("RGB")) for img in images])
            return backbone(t).numpy()

    samples_per_label: dict = defaultdict(list)

    if cache_x.exists():
        print(f"loading cached embeddings from {cache_x.name} ...")
        npz = np.load(cache_x)
        X = npz["X"]
        y = npz["y"]
        # rebuild the image-library samples (just iterate the filtered list)
        for ex in filtered:
            if len(samples_per_label[ex["articleType"]]) < 5:
                samples_per_label[ex["articleType"]].append((ex["id"], ex["image"]))
    else:
        print("computing embeddings on CPU ...")
        X = np.zeros((len(filtered), embed_dim), dtype=np.float32)
        y = np.zeros(len(filtered), dtype=np.int64)
        for start in range(0, len(filtered), batch_size):
            batch = filtered[start:start + batch_size]
            X[start:start + len(batch)] = embed([b["image"] for b in batch])
            for i, ex in enumerate(batch):
                y[start + i] = lbl2idx[ex["articleType"]]
                if len(samples_per_label[ex["articleType"]]) < 5:
                    samples_per_label[ex["articleType"]].append((ex["id"], ex["image"]))
            if (start // batch_size) % 10 == 0:
                print(f"  embeddings {start}/{len(filtered)}")
        np.savez(cache_x, X=X, y=y)
        print(f"  embeddings done: {X.shape}  (cached to {cache_x.name})")

    print("training logistic regression on embeddings ...")
    X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.15, random_state=42, stratify=y)
    clf = LogisticRegression(max_iter=300, C=1.0)
    clf.fit(X_train, y_train)
    acc = accuracy_score(y_val, clf.predict(X_val))
    print(f"  val accuracy: {acc:.3f}")

    print("baking LogReg into the PyTorch model ...")
    model = efficientnet_b0(weights=EfficientNet_B0_Weights.IMAGENET1K_V1)
    model.classifier[1] = nn.Linear(embed_dim, len(labels))
    with torch.no_grad():
        model.classifier[1].weight.copy_(torch.from_numpy(clf.coef_.astype(np.float32)))
        model.classifier[1].bias.copy_(torch.from_numpy(clf.intercept_.astype(np.float32)))
    model.eval()

    onnx_path = ARTIFACTS / "fashion_style_clf.onnx"
    print(f"exporting -> {onnx_path}")
    dummy = torch.randn(1, 3, 224, 224)
    try:
        torch.onnx.export(
            model, dummy, str(onnx_path),
            input_names=["input"], output_names=["logits"],
            opset_version=13, dynamo=False,
        )
    except TypeError:
        # torch < 2.5 doesn't have the dynamo kwarg
        torch.onnx.export(
            model, dummy, str(onnx_path),
            input_names=["input"], output_names=["logits"], opset_version=13,
        )
    (ARTIFACTS / "style_labels.json").write_text(json.dumps(labels))

    print("curating image library ...")
    lib_index: dict = {}
    for label, samples in samples_per_label.items():
        files = []
        for sid, img in samples:
            fname = f"{sid}.jpg"
            img.convert("RGB").save(LIB / fname, "JPEG", quality=80)
            files.append(fname)
        lib_index[label] = files
    (ARTIFACTS / "image_library_index.json").write_text(json.dumps(lib_index, indent=2))

    print("Phase 2 artifacts written:")
    print(f"  fashion_style_clf.onnx        ({onnx_path.stat().st_size // 1024} KB)")
    print(f"  style_labels.json             ({len(labels)} classes)")
    print(f"  image_library_index.json      ({sum(len(v) for v in lib_index.values())} images)")
    print(f"  image_library/                ({sum(len(v) for v in lib_index.values())} jpgs)")


if __name__ == "__main__":
    main()

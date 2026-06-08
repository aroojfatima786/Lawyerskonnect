#!/usr/bin/env python3
"""Return base64 PNG crops of the CNIC number band for OCR (stdout: one JSON line)."""
import base64
import json
import sys
from pathlib import Path

try:
    import cv2
    import numpy as np
except ImportError:
    print(json.dumps({"error": "opencv_missing", "crops_b64": []}))
    sys.exit(0)


def emit(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload))
    sys.stdout.flush()


def _enhance(gray: np.ndarray) -> np.ndarray:
    clahe = cv2.createCLAHE(clipLimit=2.2, tileGridSize=(8, 8))
    g = clahe.apply(gray)
    g = cv2.resize(g, None, fx=2.5, fy=2.5, interpolation=cv2.INTER_CUBIC)
    g = cv2.GaussianBlur(g, (3, 3), 0)
    _, th = cv2.threshold(g, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return th


def _encode_png(img: np.ndarray) -> str:
    ok, buf = cv2.imencode(".png", img)
    if not ok:
        return ""
    return base64.b64encode(buf.tobytes()).decode("ascii")


def cnic_number_crops(img: np.ndarray) -> list[np.ndarray]:
    h, w = img.shape[:2]
    if h < 40 or w < 40:
        return [img]

    bands = [
        (0.52, 0.96, 0.04, 0.96),
        (0.58, 0.98, 0.02, 0.98),
        (0.45, 0.88, 0.08, 0.92),
        (0.62, 1.0, 0.05, 0.95),
    ]
    crops: list[np.ndarray] = []
    for y1f, y2f, x1f, x2f in bands:
        y1, y2 = int(h * y1f), min(h, int(h * y2f))
        x1, x2 = int(w * x1f), min(w, int(w * x2f))
        if y2 - y1 < 20 or x2 - x1 < 80:
            continue
        crop = img[y1:y2, x1:x2]
        if crop.size == 0:
            continue
        crops.append(crop)
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if len(crop.shape) == 3 else crop
        crops.append(_enhance(gray))
    return crops


def main() -> None:
    if len(sys.argv) < 2:
        emit({"error": "usage", "crops_b64": []})
        return
    path = Path(sys.argv[1])
    if not path.exists():
        emit({"error": "file_not_found", "crops_b64": []})
        return
    img = cv2.imread(str(path))
    if img is None:
        emit({"error": "read_failed", "crops_b64": []})
        return
    encoded: list[str] = []
    for crop in cnic_number_crops(img):
        b64 = _encode_png(crop if len(crop.shape) == 3 else cv2.cvtColor(crop, cv2.COLOR_GRAY2BGR))
        if b64:
            encoded.append(b64)
    emit({"crops_b64": encoded})


if __name__ == "__main__":
    main()

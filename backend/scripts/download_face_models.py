#!/usr/bin/env python3
"""Download OpenCV YuNet + SFace models for KYC face match (one-time setup)."""
import sys
import urllib.request
from pathlib import Path

MODEL_DIR = Path(__file__).resolve().parent.parent / "models" / "face"
FILES = {
    "face_detection_yunet_2023mar.onnx": (
        "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
        200_000,
    ),
    "face_recognition_sface_2021dec.onnx": (
        "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx",
        30_000_000,
    ),
}


def download(url: str, dest: Path) -> None:
    print(f"Downloading {dest.name}...")
    urllib.request.urlretrieve(url, dest)
    size = dest.stat().st_size
    print(f"  -> {size:,} bytes")


def main() -> int:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    ok = True
    for name, (url, min_size) in FILES.items():
        path = MODEL_DIR / name
        if path.exists() and path.stat().st_size >= min_size:
            print(f"OK {name} ({path.stat().st_size:,} bytes)")
            continue
        if path.exists():
            path.unlink()
        try:
            download(url, path)
            if path.stat().st_size < min_size:
                print(f"FAIL {name}: file too small ({path.stat().st_size})")
                ok = False
            else:
                print(f"OK {name}")
        except Exception as exc:
            print(f"FAIL {name}: {exc}")
            ok = False
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())

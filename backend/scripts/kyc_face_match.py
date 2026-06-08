#!/usr/bin/env python3
"""Compare face on CNIC front with live selfie. Prints a single JSON line to stdout."""
import json
import sys
import urllib.request
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
MODEL_DIR = SCRIPT_DIR.parent / "models" / "face"
YUNET = MODEL_DIR / "face_detection_yunet_2023mar.onnx"
SFACE = MODEL_DIR / "face_recognition_sface_2021dec.onnx"
YUNET_URL = "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
SFACE_URL = "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx"
# Cosine similarity — same person usually >0.5; keep strict to block different faces.
SFACE_MATCH_THRESHOLD = 0.50


def emit(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload))
    sys.stdout.flush()


MIN_YUNET = 200_000
MIN_SFACE = 30_000_000


def ensure_models() -> bool:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    specs = ((YUNET, YUNET_URL, MIN_YUNET), (SFACE, SFACE_URL, MIN_SFACE))
    for path, url, min_size in specs:
        if path.exists() and path.stat().st_size >= min_size:
            continue
        if path.exists():
            path.unlink(missing_ok=True)
        try:
            urllib.request.urlretrieve(url, path)
        except Exception:
            return False
        if not path.exists() or path.stat().st_size < min_size:
            return False
    return True


def _enhance_gray(gray):
    import cv2

    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    return clahe.apply(gray)


def _cnic_crops(img):
    """NADRA CNIC portrait is on the left; try several crops + full frame."""
    import cv2

    h, w = img.shape[:2]
    crops = []
    for frac in (0.38, 0.48, 0.58, 0.72, 1.0):
        x2 = max(120, int(w * frac))
        crops.append(img[:, :x2])
    # Portrait band (typical vertical placement)
    y1, y2 = int(h * 0.05), int(h * 0.92)
    left = img[y1:y2, : max(120, int(w * 0.55))]
    if left.size > 0:
        crops.append(left)
    out = []
    for c in crops:
        out.append(c)
        for scale in (1.5, 2.0, 2.5):
            if min(c.shape[:2]) < 500:
                out.append(
                    cv2.resize(c, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
                )
    return out


def _rotate_variants(img):
    import cv2

    variants = [img]
    for code in (cv2.ROTATE_90_CLOCKWISE, cv2.ROTATE_180, cv2.ROTATE_90_COUNTERCLOCKWISE):
        variants.append(cv2.rotate(img, code))
    return variants


def _make_detectors():
    import cv2

    configs = [
        (0.55, 0.3, 5000),
        (0.35, 0.4, 8000),
        (0.22, 0.45, 12000),
        (0.15, 0.5, 15000),
    ]
    out = []
    for score, nms, top_k in configs:
        det = cv2.FaceDetectorYN.create(str(YUNET), "", (320, 320), score, nms, top_k)
        out.append(det)
    return out


def _collect_sface_features(img, detectors, recognizer, is_cnic: bool):
    import cv2

    sources = []
    for base in _rotate_variants(img) if is_cnic else [img]:
        gray = cv2.cvtColor(base, cv2.COLOR_BGR2GRAY) if len(base.shape) == 3 else base
        enhanced = _enhance_gray(gray)
        color = cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)
        sources.extend(_cnic_crops(color) if is_cnic else [color])

    features = []
    for src in sources:
        h, w = src.shape[:2]
        if w < 40 or h < 40:
            continue
        for detector in detectors:
            detector.setInputSize((w, h))
            ok, faces = detector.detect(src)
            if not ok or faces is None or len(faces) == 0:
                continue
            for face in faces:
                try:
                    aligned = recognizer.alignCrop(src, face)
                    feat = recognizer.feature(aligned)
                    if feat is not None:
                        features.append(feat)
                except cv2.error:
                    continue
    return features


def match_with_sface(cnic_path: str, selfie_path: str) -> dict:
    import cv2

    if not ensure_models():
        return {"score": 0, "passed": False, "error": "models_missing_run_setup_kyc"}

    cnic_img = cv2.imread(cnic_path)
    selfie_img = cv2.imread(selfie_path)
    if cnic_img is None or selfie_img is None:
        return {"score": 0, "passed": False, "error": "image_unreadable"}

    detectors = _make_detectors()
    recognizer = cv2.FaceRecognizerSF.create(str(SFACE), "")

    cnic_feats = _collect_sface_features(cnic_img, detectors, recognizer, True)
    selfie_feats = _collect_sface_features(selfie_img, detectors, recognizer, False)

    meta = {
        "cnic_size": [int(cnic_img.shape[1]), int(cnic_img.shape[0])],
        "selfie_size": [int(selfie_img.shape[1]), int(selfie_img.shape[0])],
    }

    if not cnic_feats:
        return {**meta, "score": 0, "passed": False, "error": "face_not_detected_on_cnic"}
    if not selfie_feats:
        return {**meta, "score": 0, "passed": False, "error": "face_not_detected_in_selfie"}

    best_sim = 0.0
    for cf in cnic_feats:
        for sf in selfie_feats:
            sim = float(recognizer.match(cf, sf, cv2.FaceRecognizerSF_FR_COSINE))
            best_sim = max(best_sim, sim)

    score = max(0.0, min(100.0, best_sim * 100.0))
    passed = best_sim >= SFACE_MATCH_THRESHOLD
    return {
        **meta,
        "score": round(score, 2),
        "passed": passed,
        "method": "sface",
        "similarity": round(best_sim, 4),
    }


def match_with_haar(cnic_path: str, selfie_path: str) -> dict:
    import cv2

    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    if cascade.empty():
        return {"score": 0, "passed": False, "error": "opencv_cascade_unavailable"}

    def rois_from_gray(gray, min_size, max_faces=8):
        faces = cascade.detectMultiScale(gray, 1.03, 3, minSize=min_size)
        faces = sorted(faces, key=lambda f: f[2] * f[3], reverse=True)[:max_faces]
        out = []
        for x, y, w, h in faces:
            aspect = w / max(h, 1)
            if aspect < 0.5 or aspect > 1.65:
                continue
            roi = gray[y : y + h, x : x + w]
            if roi.size > 80:
                out.append(cv2.resize(roi, (200, 200)))
        return out

    cnic = cv2.imread(cnic_path)
    selfie = cv2.imread(selfie_path, cv2.IMREAD_GRAYSCALE)
    if cnic is None or selfie is None:
        return {"score": 0, "passed": False, "error": "image_unreadable"}

    cnic_gray = _enhance_gray(cv2.cvtColor(cnic, cv2.COLOR_BGR2GRAY))
    cnic_rois = []
    for variant in _rotate_variants(cnic_gray):
        for crop in _cnic_crops(cv2.cvtColor(variant, cv2.COLOR_GRAY2BGR)):
            g = crop if len(crop.shape) == 2 else cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
            g = _enhance_gray(g)
            cnic_rois.extend(rois_from_gray(g, (18, 18)))
    selfie_gray = _enhance_gray(selfie)
    selfie_rois = rois_from_gray(selfie_gray, (48, 48))

    if not cnic_rois:
        return {"score": 0, "passed": False, "error": "face_not_detected_on_cnic"}
    if not selfie_rois:
        return {"score": 0, "passed": False, "error": "face_not_detected_in_selfie"}

    best = 0.0
    for a in cnic_rois:
        for b in selfie_rois:
            ha = cv2.calcHist([a], [0], None, [64], [0, 256])
            hb = cv2.calcHist([b], [0], None, [64], [0, 256])
            cv2.normalize(ha, ha)
            cv2.normalize(hb, hb)
            best = max(best, float(cv2.compareHist(ha, hb, cv2.HISTCMP_CORREL)))

    score = max(0.0, min(100.0, max(0.0, best) * 100.0))
    return {"score": round(score, 2), "passed": score >= 48.0, "method": "haar_hist"}


def main() -> None:
    if len(sys.argv) < 3:
        emit({"score": 0, "passed": False, "error": "usage: kyc_face_match.py <cnic_front> <selfie>"})
        sys.exit(1)

    cnic_path, selfie_path = sys.argv[1], sys.argv[2]

    try:
        import cv2  # noqa: F401
    except ImportError:
        emit({"score": 0, "passed": False, "error": "pip install opencv-python-headless"})
        sys.exit(0)

    try:
        sface = match_with_sface(cnic_path, selfie_path)
        # Only SFace may pass — Haar histogram often false-matches different people.
        if not sface.get("passed"):
            sface = {
                **sface,
                "passed": False,
                "error": sface.get("error") or "face_match_below_threshold",
            }
        emit(sface)
    except Exception as exc:  # noqa: BLE001
        emit({"score": 0, "passed": False, "error": str(exc)})


if __name__ == "__main__":
    main()

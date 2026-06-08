"""
Legal RAG — Pakistan Code ingestion, chunking, FAISS index (offline only).

Primary source (project root):
  law download/   — ~343 Pakistan Code PDFs (recursive)

Fallback:
  backend/law-download/
  backend/data/laws/

Usage:
  python scripts/legal_rag.py index
  python scripts/legal_rag.py export-embeddings
  python scripts/legal_rag.py status
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

import faiss
import numpy as np
from pypdf import PdfReader
from sentence_transformers import SentenceTransformer

BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BASE_DIR.parent
RAG_DIR = BASE_DIR / "data" / "rag"
INDEX_PATH = RAG_DIR / "faiss.index"
META_PATH = RAG_DIR / "chunks_meta.json"
MODEL_NAME = os.environ.get("LEGAL_RAG_MODEL", "all-MiniLM-L6-v2")
SOURCE_LABEL = "Pakistan Code"
CHUNK_MIN_TOKENS = int(os.environ.get("LEGAL_RAG_CHUNK_MIN_TOKENS", "500"))
CHUNK_MAX_TOKENS = int(os.environ.get("LEGAL_RAG_CHUNK_MAX_TOKENS", "1000"))
CHUNK_OVERLAP_TOKENS = int(os.environ.get("LEGAL_RAG_CHUNK_OVERLAP_TOKENS", "100"))

# Root law-download folder(s) — searched recursively for PDF/TXT/DOC
LAW_SOURCE_DIRS = [
    PROJECT_ROOT / "law download",
    PROJECT_ROOT / "law-download",
    BASE_DIR / "law-download",
    BASE_DIR / "data" / "laws",
]


def _approx_tokens(text: str) -> int:
    return max(1, len(re.findall(r"\S+", text)))


def _clean_text(text: str) -> str:
    """Remove headers, page numbers, and noise from law text."""
    t = text.replace("\r\n", "\n").replace("\r", "\n")
    t = re.sub(r"(?m)^\s*Page\s+\d+\s*(?:of\s+\d+)?\s*$", " ", t, flags=re.I)
    t = re.sub(r"(?m)^\s*\d+\s*/\s*\d+\s*$", " ", t)
    t = re.sub(r"(?m)^\s*-\s*\d+\s*-\s*$", " ", t)
    t = re.sub(r"\bPakistan\s+Code\b", " ", t, flags=re.I)
    t = re.sub(r"(?m)^\s*\d{1,4}\s*$", " ", t)
    t = re.sub(r"\s+", " ", t)
    return t.strip()


def _detect_category(filename: str, text: str, parent_folder: str = "") -> str:
    blob = f"{parent_folder} {filename} {text[:4000]}".lower()
    rules = [
        ("Criminal Law", r"criminal|penal|fir|ppc|police|bail|arrest|جرم|گرفتار|ضمانت|prosecution"),
        ("Civil Law", r"civil|suit|injunction|decree|دیوانی|specific relief"),
        ("Family Law", r"family|marriage|divorce|custody|khula|talaq|نکاح|طلاق|وراثت|guardian|welfare"),
        ("Service Law", r"service|civil servant|government servant|employment of|deputation"),
        ("Labour Law", r"labour|labor|worker|factory|wages|نوکری|ملازمت|industrial relations"),
        ("Police Law", r"police|thana|constabulary|investigation"),
        ("Business Law", r"company|companies|corporate|securities|partnership|کاروبار"),
        ("Property Law", r"property|land|registry|mutation|transfer|زمین|جائیداد|land acquisition|revenue"),
        ("Islamic Law", r"islamic|sharia|zakat|ushr|religious|madrasa"),
        ("Banking Law", r"bank|finance|loan|interest|قرض|بینک|financial institution"),
        ("Evidence Law", r"evidence|qanun.?e.?shahadat|witness|testimony"),
        ("Rent Law", r"rent|tenant|landlord|evict|kiraya|کرایہ|premises"),
        ("International Law", r"international|treaty|extradition|diplomatic|consular"),
        ("Tenancy Law", r"tenancy|tenant|lease"),
        ("Tax Law", r"tax|fbr|income tax|excise|customs|ٹیکس|sales tax|withholding"),
        ("Military Law", r"military|army|navy|air force|defence|court.?martial"),
        ("Health Law", r"health|medical|hospital|drug|pharmacy|patient"),
        ("Media Law", r"media|press|newspaper|broadcast|pemra|defamation"),
        ("Election Law", r"election|electoral|vote|ballot|commission"),
        ("General Law", r"general|administration|procedure|rules|regulation"),
    ]
    pf = parent_folder.lower()
    folder_map = {
        "criminal": "Criminal Law",
        "civil": "Civil Law",
        "family": "Family Law",
        "service": "Service Law",
        "labour": "Labour Law",
        "labor": "Labour Law",
        "police": "Police Law",
        "companies": "Business Law",
        "land": "Property Law",
        "property": "Property Law",
        "banking": "Banking Law",
        "rent": "Rent Law",
        "tax": "Tax Law",
        "excise": "Tax Law",
        "military": "Military Law",
        "health": "Health Law",
        "media": "Media Law",
        "election": "Election Law",
        "international": "International Law",
    }
    for key, cat in folder_map.items():
        if key in pf:
            return cat
    for category, pattern in rules:
        if re.search(pattern, blob, re.I):
            return category
    return "General Law"


def _act_name_from_text(filename: str, text: str) -> str:
    head = text[:5000]
    patterns = [
        r"(THE\s+[A-Z0-9][A-Z0-9\s,\.\-\(\)&'/]+?(?:ACT|ORDINANCE|REGULATION|CODE|RULES|ORDER)\s*,?\s*\d{4})",
        r"((?:ACT|ORDINANCE|REGULATION|CODE|RULES)\s+(?:NO\.?\s*)?[IVXLC\d\-]+\s+OF\s+\d{4})",
    ]
    for pat in patterns:
        m = re.search(pat, head, re.I)
        if m:
            name = re.sub(r"\s+", " ", m.group(1)).strip()
            if len(name) > 12:
                return name.upper()
    name = Path(filename).stem
    if name.lower().startswith("administrator"):
        return "Pakistan Code Act"
    name = re.sub(r"[_\-]+", " ", name)
    return re.sub(r"\s+", " ", name).strip().title() or "Pakistan Code Act"


def _guess_section(text: str) -> str:
    m = re.search(r"(?:Section|Article|Sec\.?|Art\.?)\s*([0-9A-Za-z\-]+)", text, re.I)
    return m.group(1) if m else ""


def _read_pdf(path: Path) -> str:
    try:
        reader = PdfReader(str(path))
        return "\n".join((page.extract_text() or "") for page in reader.pages)
    except Exception as exc:
        print(f"[WARN] Could not read PDF {path.name}: {exc}", file=sys.stderr)
        return ""


def _read_txt(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="ignore")
    except Exception as exc:
        print(f"[WARN] Could not read TXT {path.name}: {exc}", file=sys.stderr)
        return ""


def _read_docx(path: Path) -> str:
    try:
        from docx import Document

        doc = Document(str(path))
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    except ImportError:
        print("[WARN] python-docx not installed; skipping DOCX files", file=sys.stderr)
        return ""
    except Exception as exc:
        print(f"[WARN] Could not read DOCX {path.name}: {exc}", file=sys.stderr)
        return ""


def _read_file(path: Path) -> str:
    ext = path.suffix.lower()
    if ext == ".pdf":
        return _read_pdf(path)
    if ext == ".txt":
        return _read_txt(path)
    if ext in (".docx", ".doc"):
        return _read_docx(path)
    return ""


def _collect_law_files() -> list[Path]:
    files: list[Path] = []
    seen: set[str] = set()
    extensions = {".pdf", ".txt", ".docx", ".doc"}
    for directory in LAW_SOURCE_DIRS:
        if not directory.exists():
            continue
        for path in sorted(directory.rglob("*")):
            if not path.is_file() or path.suffix.lower() not in extensions:
                continue
            if re.search(r"\(\d+\)\.", path.name):
                continue
            key = path.resolve().as_posix().lower()
            if key in seen:
                continue
            seen.add(key)
            files.append(path)
    return files


def _chunk_text(text: str, filename: str, parent_folder: str = "") -> list[dict[str, Any]]:
    cleaned = _clean_text(text)
    if not cleaned:
        return []

    words = cleaned.split()
    if not words:
        return []

    category = _detect_category(filename, cleaned, parent_folder)
    act = _act_name_from_text(filename, cleaned)
    chunks: list[dict[str, Any]] = []
    idx = 0

    if len(words) <= CHUNK_MAX_TOKENS:
        piece = " ".join(words).strip()
        if _approx_tokens(piece) >= 20:
            chunks.append(
                {
                    "id": f"{filename}::chunk-{idx}",
                    "source": SOURCE_LABEL,
                    "title": act,
                    "actName": act,
                    "category": category,
                    "content": piece,
                    "sectionNumber": _guess_section(piece),
                }
            )
        return chunks

    start = 0
    while start < len(words):
        end = min(len(words), start + CHUNK_MAX_TOKENS)
        if end - start < CHUNK_MIN_TOKENS and end < len(words):
            end = min(len(words), start + CHUNK_MIN_TOKENS)
        piece_words = words[start:end]
        piece = " ".join(piece_words).strip()
        min_tok = min(CHUNK_MIN_TOKENS, 80)
        if piece and _approx_tokens(piece) >= min_tok:
            chunks.append(
                {
                    "id": f"{filename}::chunk-{idx}",
                    "source": SOURCE_LABEL,
                    "title": act,
                    "actName": act,
                    "category": category,
                    "content": piece,
                    "sectionNumber": _guess_section(piece),
                }
            )
            idx += 1
        if end >= len(words):
            break
        start = max(0, end - CHUNK_OVERLAP_TOKENS)

    return chunks


def _load_model() -> SentenceTransformer:
    return SentenceTransformer(MODEL_NAME)


def cmd_index() -> int:
    RAG_DIR.mkdir(parents=True, exist_ok=True)

    law_files = _collect_law_files()
    if not law_files:
        print(
            json.dumps(
                {
                    "success": False,
                    "message": "No law files found. Add PDFs to project root: law download/",
                    "chunks": 0,
                    "searchedDirs": [str(d) for d in LAW_SOURCE_DIRS],
                }
            )
        )
        return 1

    all_chunks: list[dict[str, Any]] = []
    for i, path in enumerate(law_files, 1):
        parent = path.parent.name if path.parent.name not in ("law download", "laws", "law-download") else ""
        raw = _read_file(path)
        file_chunks = _chunk_text(raw, path.name, parent)
        all_chunks.extend(file_chunks)
        if i % 25 == 0 or i == len(law_files):
            print(f"[INFO] Processed {i}/{len(law_files)} files, {len(all_chunks)} chunks so far", file=sys.stderr)

    if not all_chunks:
        print(json.dumps({"success": False, "message": "No text extracted from law files", "chunks": 0}))
        return 1

    model = _load_model()
    texts = [c["content"] for c in all_chunks]
    embeddings = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
    vectors = np.asarray(embeddings, dtype="float32")
    dim = vectors.shape[1]

    index = faiss.IndexFlatIP(dim)
    index.add(vectors)
    faiss.write_index(index, str(INDEX_PATH))
    vectors.tofile(RAG_DIR / "embeddings.f32.bin")

    meta = {
        "model": MODEL_NAME,
        "embeddingDim": dim,
        "chunkMinTokens": CHUNK_MIN_TOKENS,
        "chunkMaxTokens": CHUNK_MAX_TOKENS,
        "chunkOverlapTokens": CHUNK_OVERLAP_TOKENS,
        "totalChunks": len(all_chunks),
        "sources": sorted({c["actName"] for c in all_chunks}),
        "sourceLabel": SOURCE_LABEL,
        "lawDirs": [str(d) for d in LAW_SOURCE_DIRS if d.exists()],
        "categories": sorted({c["category"] for c in all_chunks}),
        "chunks": all_chunks,
    }
    META_PATH.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    print(
        json.dumps(
            {
                "success": True,
                "chunks": len(all_chunks),
                "files": len(law_files),
                "indexPath": str(INDEX_PATH),
                "source": SOURCE_LABEL,
            }
        )
    )
    return 0


def cmd_export_embeddings() -> int:
    if not INDEX_PATH.exists() or not META_PATH.exists():
        print(json.dumps({"success": False, "message": "Run index first"}))
        return 1
    meta = json.loads(META_PATH.read_text(encoding="utf-8"))
    chunks = meta.get("chunks") or []
    dim = int(meta.get("embeddingDim") or 384)
    index = faiss.read_index(str(INDEX_PATH))
    n = index.ntotal
    if n != len(chunks):
        print(json.dumps({"success": False, "message": f"Index/chunk mismatch: {n} vs {len(chunks)}"}))
        return 1
    vectors = faiss.rev_swig_ptr(index.get_xb(), n * dim).reshape(n, dim).astype("float32")
    out = RAG_DIR / "embeddings.f32.bin"
    vectors.tofile(out)
    print(json.dumps({"success": True, "vectors": n, "dim": dim, "path": str(out)}))
    return 0


def cmd_search(query: str, top_k: int) -> int:
    if not INDEX_PATH.exists() or not META_PATH.exists():
        print(json.dumps({"success": True, "results": [], "indexed": False}))
        return 0

    meta = json.loads(META_PATH.read_text(encoding="utf-8"))
    chunks = meta.get("chunks") or []
    if not chunks:
        print(json.dumps({"success": True, "results": [], "indexed": True}))
        return 0

    model = _load_model()
    q_vec = model.encode([query], normalize_embeddings=True, show_progress_bar=False)
    q = np.asarray(q_vec, dtype="float32")

    index = faiss.read_index(str(INDEX_PATH))
    k = min(max(1, top_k), len(chunks))
    scores, indices = index.search(q, k)

    results = []
    for score, idx in zip(scores[0].tolist(), indices[0].tolist()):
        if idx < 0 or idx >= len(chunks):
            continue
        row = dict(chunks[idx])
        row["score"] = round(float(score), 4)
        row["summary"] = row.get("content", "")[:400]
        results.append(row)

    print(json.dumps({"success": True, "results": results, "indexed": True}))
    return 0


def cmd_status() -> int:
    indexed = INDEX_PATH.exists() and META_PATH.exists()
    law_files = _collect_law_files()
    payload: dict[str, Any] = {
        "success": True,
        "indexed": indexed,
        "lawDirs": [str(d) for d in LAW_SOURCE_DIRS if d.exists()],
        "fileCount": len(law_files),
    }
    if indexed:
        meta = json.loads(META_PATH.read_text(encoding="utf-8"))
        payload["totalChunks"] = meta.get("totalChunks", 0)
        payload["model"] = meta.get("model", MODEL_NAME)
        payload["sources"] = meta.get("sources", [])
        payload["sourceLabel"] = meta.get("sourceLabel", SOURCE_LABEL)
    print(json.dumps(payload))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="LawyersKonnect Legal RAG (Pakistan Code / FAISS)")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("index")
    sub.add_parser("status")
    sub.add_parser("export-embeddings")

    search_p = sub.add_parser("search")
    search_p.add_argument("--query", required=True)
    search_p.add_argument("--top-k", type=int, default=5)

    args = parser.parse_args()
    if args.command == "index":
        return cmd_index()
    if args.command == "export-embeddings":
        return cmd_export_embeddings()
    if args.command == "search":
        return cmd_search(args.query, args.top_k)
    if args.command == "status":
        return cmd_status()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

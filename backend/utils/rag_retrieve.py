"""RAG retriever — cari potongan pengetahuan paling relevan untuk sebuah query.

Cache embedding per-worker (numpy) dibangun dari tabel RagChunk (SQLite = sumber bersama antar 5
worker); refresh otomatis saat isi tabel berubah (signature = jumlah baris + max updated_at).
Cosine similarity (dot, karena embedding ternormalisasi) + filter RBAC (owner_role).
"""
from __future__ import annotations

import logging
import threading
from typing import Dict, List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# Default konfigurasi (override via config/ai.yaml)
RAG_TOP_K = 5
RAG_MIN_SCORE = 0.30


def _load_cfg():
    global RAG_TOP_K, RAG_MIN_SCORE
    try:
        import yaml
        from pathlib import Path
        cfg = yaml.safe_load((Path(__file__).resolve().parents[1] / "config" / "ai.yaml").read_text())
        if cfg:
            RAG_TOP_K = int(cfg.get("rag_top_k", RAG_TOP_K))
            RAG_MIN_SCORE = float(cfg.get("rag_min_score", RAG_MIN_SCORE))
    except Exception:
        pass


_load_cfg()

_lock = threading.Lock()
_cache = {
    "sig": None,        # (count, max_updated_iso)
    "matrix": None,     # np.ndarray [N,384]
    "meta": [],         # list of dict per baris
}


def _current_sig(db: Session):
    from models import RagChunk
    row = db.query(func.count(RagChunk.id), func.max(RagChunk.updated_at)).first()
    cnt = row[0] or 0
    mx = row[1]
    return (cnt, mx.isoformat() if mx else None)


def _rebuild_cache(db: Session):
    import numpy as np
    from models import RagChunk
    from utils.rag_index import decode_embedding

    rows = db.query(RagChunk).all()
    vecs, meta = [], []
    for r in rows:
        if not r.embedding:
            continue
        try:
            vecs.append(decode_embedding(r.embedding))
        except Exception:
            continue
        meta.append({
            "text": r.text, "title": r.title, "source_type": r.source_type,
            "source_ref": r.source_ref, "module": r.module, "owner_role": r.owner_role,
        })
    _cache["matrix"] = np.vstack(vecs) if vecs else None
    _cache["meta"] = meta


def _ensure_cache(db: Session):
    sig = _current_sig(db)
    if _cache["sig"] == sig and _cache["matrix"] is not None:
        return
    with _lock:
        if _cache["sig"] == sig and _cache["matrix"] is not None:
            return
        _rebuild_cache(db)
        _cache["sig"] = sig


def _visible(owner_role: Optional[str], role: str) -> bool:
    if role == "superadmin":
        return True
    if owner_role is None:
        return True   # docs/manifest/document-library = pengetahuan umum internal
    return owner_role == role


def search(db: Session, query: str, k: Optional[int] = None, role: str = "user",
           accessible_modules: Optional[List[str]] = None, min_score: Optional[float] = None) -> List[dict]:
    """Kembalikan hingga k potongan paling relevan (lolos RBAC) di atas min_score."""
    import numpy as np
    k = RAG_TOP_K if k is None else k
    min_score = RAG_MIN_SCORE if min_score is None else min_score
    if not query or not query.strip():
        return []
    try:
        _ensure_cache(db)
    except Exception as e:
        logger.warning("RAG cache build failed: %s", e)
        return []
    if _cache["matrix"] is None or not _cache["meta"]:
        return []

    from utils.ai_embedder import _embed_batch
    try:
        qvec = np.asarray(_embed_batch([query])[0], dtype="float32")
    except Exception as e:
        logger.warning("RAG query embed failed: %s", e)
        return []

    scores = _cache["matrix"] @ qvec          # cosine (ternormalisasi)
    order = np.argsort(-scores)
    out: List[dict] = []
    for idx in order:
        s = float(scores[idx])
        if s < min_score:
            break
        m = _cache["meta"][idx]
        if not _visible(m.get("owner_role"), role):
            continue
        out.append({**m, "score": round(s, 3)})
        if len(out) >= k:
            break
    return out


def build_context_block(chunks: List[dict], max_chars: int = 3000) -> str:
    """Rakit potongan jadi blok konteks bersitasi untuk prompt."""
    if not chunks:
        return ""
    parts, total = [], 0
    for i, c in enumerate(chunks, 1):
        src = c.get("source_ref") or c.get("source_type") or "sumber"
        title = c.get("title") or src
        body = (c.get("text") or "").strip()
        entry = f"[{i}] {title} ({src}):\n{body}"
        if total + len(entry) > max_chars:
            entry = entry[: max(0, max_chars - total)]
        parts.append(entry)
        total += len(entry)
        if total >= max_chars:
            break
    return "\n\n".join(parts)


def rag_status(db: Session) -> dict:
    from models import RagChunk
    total = db.query(func.count(RagChunk.id)).scalar() or 0
    by_type = dict(db.query(RagChunk.source_type, func.count(RagChunk.id))
                   .group_by(RagChunk.source_type).all())
    return {"total_chunks": int(total), "by_source_type": {k: int(v) for k, v in by_type.items()},
            "cache_loaded": _cache["matrix"] is not None}

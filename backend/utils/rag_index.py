"""RAG indexer — auto-ingest pengetahuan super-apps ke tabel RagChunk.

Sumber (semua otomatis, tanpa KB manual per-fitur):
- docs/*.md, data/ai/app_knowledge.md
- manifest modul (parse frontend/lib/modules.ts) → menu baru otomatis dikenal
- Document Library (content_html/summary)
- narasi operasional (incident/worklog/risk/task notes) — dengan owner_role utk RBAC

Inkremental per-sumber via content_hash (hanya sumber berubah yang di-embed ulang).
Embedding via model-server /v1/embeddings (reuse ai_embedder._embed_batch), disimpan base64 float32.
"""
from __future__ import annotations

import base64
import hashlib
import logging
import re
from pathlib import Path
from typing import Dict, List, Optional

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

_BACKEND_DIR = Path(__file__).resolve().parents[1]
_REPO_ROOT = _BACKEND_DIR.parent
_DOCS_DIR = _REPO_ROOT / "docs"
_KB_FILE = _BACKEND_DIR / "data" / "ai" / "app_knowledge.md"
_MODULES_TS = _REPO_ROOT / "frontend" / "lib" / "modules.ts"

CHUNK_TOKENS = 600      # ~kata per chunk
CHUNK_OVERLAP = 80
EMBED_BATCH = 32
OP_ROW_LIMIT = 400      # batasi baris narasi operasional per tabel

try:
    import yaml as _yaml
    _cfg = _yaml.safe_load((_BACKEND_DIR / "config" / "ai.yaml").read_text()) or {}
    CHUNK_TOKENS = int(_cfg.get("rag_chunk_tokens", CHUNK_TOKENS))
    CHUNK_OVERLAP = int(_cfg.get("rag_overlap", CHUNK_OVERLAP))
except Exception:
    pass


# ------------------------------------------------------------------ util
def _sha1(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8", "ignore")).hexdigest()


def encode_embedding(vec) -> str:
    import numpy as np
    return base64.b64encode(np.asarray(vec, dtype="float32").tobytes()).decode("ascii")


def decode_embedding(s: str):
    import numpy as np
    return np.frombuffer(base64.b64decode(s), dtype="float32")


def _strip_html(html: str) -> str:
    if not html:
        return ""
    text = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", html, flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _chunk(text: str) -> List[str]:
    words = text.split()
    if not words:
        return []
    if len(words) <= CHUNK_TOKENS:
        return [text.strip()]
    out, i = [], 0
    step = CHUNK_TOKENS - CHUNK_OVERLAP
    while i < len(words):
        out.append(" ".join(words[i:i + CHUNK_TOKENS]))
        i += step
    return out


# ------------------------------------------------------------------ sumber
def _src_docs() -> List[dict]:
    items = []
    if _DOCS_DIR.is_dir():
        for p in sorted(_DOCS_DIR.glob("*.md")):
            try:
                txt = p.read_text(encoding="utf-8", errors="ignore").strip()
            except Exception:
                continue
            if txt:
                items.append({"source_type": "docs", "source_ref": f"docs/{p.name}",
                              "title": p.stem, "module": None, "owner_role": None, "text": txt})
    return items


def _src_knowledge() -> List[dict]:
    if _KB_FILE.is_file():
        txt = _KB_FILE.read_text(encoding="utf-8", errors="ignore").strip()
        if txt:
            return [{"source_type": "knowledge", "source_ref": "app_knowledge.md",
                     "title": "App Knowledge Base", "module": None, "owner_role": None, "text": txt}]
    return []


def _src_modules() -> List[dict]:
    """Manifest menu/modul dari frontend/lib/modules.ts + backend ALL_MODULES."""
    lines = []
    if _MODULES_TS.is_file():
        raw = _MODULES_TS.read_text(encoding="utf-8", errors="ignore")
        for m in re.finditer(r'key:\s*"([^"]+)"\s*,\s*label:\s*"([^"]+)"\s*,\s*icon:\s*"[^"]*"\s*,\s*href:\s*"([^"]+)"', raw):
            lines.append(f"- {m.group(2)} (key: {m.group(1)}, href: {m.group(3)})")
    try:
        from api.dependencies import ALL_MODULES
        lines.append("Kunci modul backend (RBAC): " + ", ".join(ALL_MODULES))
    except Exception:
        pass
    if not lines:
        return []
    text = ("Daftar menu/modul aplikasi super-apps yang tersedia saat ini:\n" + "\n".join(lines))
    return [{"source_type": "module", "source_ref": "module_manifest",
             "title": "Daftar Menu & Modul super-apps", "module": None, "owner_role": None, "text": text}]


def _src_document_library(db: Session) -> List[dict]:
    items = []
    try:
        from models import DocumentLibrary
        rows = db.query(DocumentLibrary).limit(OP_ROW_LIMIT).all()
        for r in rows:
            body = " ".join(filter(None, [r.summary or "", _strip_html(r.content_html or "")])).strip()
            if not body:
                continue
            items.append({"source_type": "document_library", "source_ref": f"doclib:{r.id}",
                          "title": r.title, "module": "documentation", "owner_role": None,
                          "text": f"{r.title} [{r.category}]\n{body}"})
    except Exception as e:
        logger.debug("doclib source skip: %s", e)
    return items


def _src_operational(db: Session) -> List[dict]:
    """Narasi operasional dengan owner_role untuk RBAC."""
    items = []

    def add(model_attr, source_type, title_fn, text_fn, module):
        try:
            from models import __dict__ as M
        except Exception:
            return
        model = M.get(model_attr)
        if model is None:
            return
        try:
            rows = db.query(model).order_by(model.id.desc()).limit(OP_ROW_LIMIT).all()
        except Exception:
            return
        for r in rows:
            body = (text_fn(r) or "").strip()
            if not body:
                continue
            items.append({"source_type": source_type, "source_ref": f"{source_type}:{r.id}",
                          "title": title_fn(r), "module": module,
                          "owner_role": getattr(r, "owner_role", None), "text": body})

    add("IncidentReport", "incident", lambda r: f"Insiden {getattr(r,'server_name','')}",
        lambda r: f"{getattr(r,'incident_type','')} — {getattr(r,'description','')} (status {getattr(r,'status','')})", "incident")
    add("WorkLog", "worklog", lambda r: f"Worklog {getattr(r,'id','')}",
        lambda r: getattr(r, "description", "") or getattr(r, "activity", ""), "worklog")
    add("PenilaianRisiko", "risk", lambda r: f"Risiko {getattr(r,'nama_asset','')}",
        lambda r: getattr(r, "deskripsi_risiko", "") or getattr(r, "deskripsi", ""), "risk")
    return items


def collect_sources(db: Session, sources: Optional[List[str]] = None) -> List[dict]:
    all_items: List[dict] = []
    all_items += _src_docs()
    all_items += _src_knowledge()
    all_items += _src_modules()
    all_items += _src_document_library(db)
    all_items += _src_operational(db)
    if sources:
        all_items = [i for i in all_items if i["source_type"] in sources]
    return all_items


# ------------------------------------------------------------------ reindex
def reindex(db: Session, sources: Optional[List[str]] = None, full: bool = False) -> dict:
    """Inkremental per-sumber (content_hash). full=True paksa embed ulang semua."""
    from models import RagChunk

    items = collect_sources(db, sources)
    desired_refs = {(i["source_type"], i["source_ref"]) for i in items}
    stype_scope = sources or list({i["source_type"] for i in items})

    # hash tersimpan per source_ref (ambil satu chunk mewakili)
    stored: Dict[tuple, str] = {}
    for st, sr, ch in db.query(RagChunk.source_type, RagChunk.source_ref, RagChunk.content_hash) \
            .filter(RagChunk.source_type.in_(stype_scope)).all():
        stored.setdefault((st, sr), ch)

    to_embed: List[dict] = []   # {meta..., chunk_text}
    changed_refs = []
    skipped = 0
    for it in items:
        h = _sha1(it["text"])
        key = (it["source_type"], it["source_ref"])
        if not full and stored.get(key) == h:
            skipped += 1
            continue
        changed_refs.append(key)
        for idx, ck in enumerate(_chunk(it["text"])):
            to_embed.append({**it, "chunk_index": idx, "chunk_text": ck, "content_hash": h})

    # hapus chunk lama utk ref yang berubah + ref yang hilang
    removed_refs = [k for k in stored if k not in desired_refs] if (sources or full or True) else []
    for st, sr in set(changed_refs) | set(removed_refs):
        db.query(RagChunk).filter(RagChunk.source_type == st, RagChunk.source_ref == sr) \
            .delete(synchronize_session=False)

    # embed batch + insert
    from utils.ai_embedder import _embed_batch
    inserted = 0
    for i in range(0, len(to_embed), EMBED_BATCH):
        batch = to_embed[i:i + EMBED_BATCH]
        vecs = _embed_batch([b["chunk_text"] for b in batch])
        for b, v in zip(batch, vecs):
            db.add(RagChunk(
                source_type=b["source_type"], source_ref=b["source_ref"], title=b.get("title"),
                module=b.get("module"), chunk_index=b["chunk_index"], text=b["chunk_text"],
                embedding=encode_embedding(v), token_count=len(b["chunk_text"].split()),
                content_hash=b["content_hash"], owner_role=b.get("owner_role"),
            ))
            inserted += 1
    db.commit()
    result = {"sources": len(items), "changed": len(changed_refs), "skipped_unchanged": skipped,
              "removed": len(removed_refs), "chunks_inserted": inserted,
              "total_chunks": db.query(RagChunk).count()}
    logger.info("[RAG] reindex: %s", result)
    return result

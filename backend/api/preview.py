"""Office file preview — normalizes legacy Office formats for inline browser viewing.

Converts .xls -> .xlsx and .doc -> .docx via the bundled LibreOffice so the
frontend can render the file inline (exceljs / docx-preview). Modern formats
(.xlsx, .docx) are NOT converted and are served directly by the frontend.
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import Optional
import hashlib
import os
import shutil
import subprocess
import tempfile

from database import get_db
from models import User
from api.dependencies import get_current_user, log_activity

router = APIRouter(tags=["Preview"])

# Project root: super-apps/libreoffice/program/soffice.bin (bundled distribution)
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(BACKEND_DIR, "..", ".."))
# Use the launcher script (not soffice.bin) — it sets up the runtime environment
# correctly; soffice.bin exits with code 81 when invoked directly.
SOFFICE_BIN = os.path.join(PROJECT_ROOT, "libreoffice", "program", "soffice")
UPLOADS_ROOT = os.path.join(BACKEND_DIR, "..", "uploads")
CACHE_ROOT = os.path.join(BACKEND_DIR, "..", "data", "preview-cache")

# Legacy formats that need normalization before inline rendering.
LEGACY_FORMATS = {
    ".xls": ("xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    ".doc": ("docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
}


def _soffice_available() -> bool:
    return os.path.isfile(SOFFICE_BIN)


def _safe_abs_path(file_path: str) -> str:
    """Resolve file_path to an absolute path and ensure it stays inside uploads/.

    file_path follows the static-mount convention and already contains the
    "uploads/" prefix, e.g. "uploads/forms/uuid_name.xls".
    """
    if not file_path:
        raise HTTPException(status_code=400, detail="file_path is required")
    uploads_abs = os.path.abspath(UPLOADS_ROOT)
    rel = file_path
    if rel.startswith("uploads/"):
        rel = rel[len("uploads/"):]
    rel = rel.lstrip("/")
    abs_path = os.path.abspath(os.path.join(uploads_abs, rel))
    if not abs_path.startswith(uploads_abs + os.sep):
        raise HTTPException(status_code=403, detail="Access denied")
    if not os.path.isfile(abs_path):
        raise HTTPException(status_code=404, detail="File not found on disk")
    return abs_path


def _convert_with_libreoffice(src_abs: str, target_ext: str) -> bytes:
    """Convert src_abs to target_ext using the bundled LibreOffice and return bytes."""
    if not _soffice_available():
        raise HTTPException(
            status_code=503,
            detail="Office converter not available. Bundled LibreOffice is missing.",
        )

    tmp_dir = tempfile.mkdtemp(prefix="office_preview_")
    try:
        # Unique per-call user installation dir avoids profile lock conflicts
        # between the 5 backend workers running concurrently. The dir must exist
        # before LibreOffice starts (it refuses to launch otherwise).
        profile_dir = os.path.join(tmp_dir, "lo_profile")
        os.makedirs(profile_dir, exist_ok=True)
        cmd = [
            SOFFICE_BIN,
            "--headless",
            "--norestore",
            "--nolockcheck",
            f"-env:UserInstallation=file://{profile_dir}",
            "--convert-to", target_ext,
            "--outdir", tmp_dir,
            src_abs,
        ]
        proc = subprocess.run(
            cmd,
            capture_output=True,
            timeout=120,
        )
        if proc.returncode != 0:
            stderr_tail = (proc.stderr or b"").decode("utf-8", "replace")[-500:]
            raise HTTPException(
                status_code=500,
                detail=f"Conversion failed: {stderr_tail or 'unknown error'}",
            )

        base = os.path.splitext(os.path.basename(src_abs))[0]
        converted = os.path.join(tmp_dir, f"{base}.{target_ext}")
        if not os.path.isfile(converted):
            raise HTTPException(status_code=500, detail="Conversion produced no output")
        with open(converted, "rb") as fh:
            return fh.read()
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Conversion timed out")
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def _cache_key(src_abs: str) -> str:
    mtime = os.path.getmtime(src_abs)
    return hashlib.sha1(f"{src_abs}:{mtime}".encode("utf-8")).hexdigest()


@router.get("/preview/office")
async def preview_office(
    file_path: str = Query(..., description="Path under uploads/, e.g. documents/uuid_name.xls"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return a normalized xlsx/docx for inline preview of legacy .xls/.doc files."""
    ext = os.path.splitext(file_path)[1].lower()
    if ext not in LEGACY_FORMATS:
        raise HTTPException(status_code=400, detail="Only .xls and .doc need server conversion")

    target_ext, media_type = LEGACY_FORMATS[ext]
    src_abs = _safe_abs_path(file_path)

    os.makedirs(CACHE_ROOT, exist_ok=True)
    key = _cache_key(src_abs)
    cached = os.path.join(CACHE_ROOT, f"{key}.{target_ext}")
    if os.path.isfile(cached):
        with open(cached, "rb") as fh:
            content = fh.read()
    else:
        content = _convert_with_libreoffice(src_abs, target_ext)
        # Write cache atomically so concurrent workers never see partial files.
        tmp_cache = cached + f".{os.getpid()}.tmp"
        with open(tmp_cache, "wb") as fh:
            fh.write(content)
        os.replace(tmp_cache, cached)

    log_activity(db, current_user.id, "VIEW", "preview",
                 f"Previewed office file: {file_path}")

    return StreamingResponse(
        iter([content]),
        media_type=media_type,
        headers={"Content-Disposition": f"inline; filename={os.path.basename(file_path)}.{target_ext}"},
    )

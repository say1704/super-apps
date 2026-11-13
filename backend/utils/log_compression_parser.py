"""Parser untuk output Log Compressor (file log_compression-DD-MM-YYYY.log).

Satu file bisa memuat BANYAK run (dipisah trailer '# SELESAI RUN <id>'). Tiap run
diparse jadi header (server/folder/mode/periode/ringkasan/ukuran/hemat) + detail per-arsip.
Tangguh ke-2 format: mode SAFE/TEST (arsip dibuat) dan DELETE AFTER VERIFY (source dihapus).
"""
from __future__ import annotations

import hashlib
import re
from datetime import datetime
from typing import Any, Dict, List, Optional


def parse_size(s: Optional[str]) -> Optional[int]:
    """'4.5 MB' / '233.9 KB' / '-' -> bytes (int) atau None."""
    if s is None:
        return None
    s = str(s).strip()
    if not s or s == "-":
        return None
    m = re.match(r"([\d.,]+)\s*(B|KB|MB|GB|TB)\b", s, re.IGNORECASE)
    if not m:
        return None
    try:
        val = float(m.group(1).replace(",", ""))
    except ValueError:
        return None
    mult = {"B": 1, "KB": 1024, "MB": 1024 ** 2, "GB": 1024 ** 3, "TB": 1024 ** 4}[m.group(2).upper()]
    return int(val * mult)


def _map_mode(raw: str) -> str:
    u = (raw or "").upper()
    if "DELETE AFTER VERIFY" in u or "DIHAPUS SETELAH" in u:
        return "DELETE_AFTER_VERIFY"
    if "SAFE" in u or "TEST" in u:
        return "SAFE"
    return "OTHER"


def _parse_dt(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    s = s.strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


def _first(pattern: str, text: str, group: int = 1) -> Optional[str]:
    m = re.search(pattern, text, re.MULTILINE)
    return m.group(group).strip() if m else None


def _int(pattern: str, text: str) -> Optional[int]:
    v = _first(pattern, text)
    try:
        return int(v) if v is not None else None
    except ValueError:
        return None


def _split_runs(content: str) -> List[str]:
    """Pisah file jadi segmen per-run. Trailer '# SELESAI RUN' menandai akhir satu run;
    blok tanpa trailer (mis. truncated / verify tanpa footer) tetap diambil bila mirip run."""
    runs: List[str] = []
    cur: List[str] = []
    for ln in content.splitlines():
        cur.append(ln)
        if ln.strip().startswith("# SELESAI RUN"):
            runs.append("\n".join(cur))
            cur = []
    tail = "\n".join(cur).strip()
    if tail and (re.search(r"^Server\s*:", tail, re.MULTILINE)
                 or "LOG COMPRESSOR" in tail or "diverifikasi" in tail):
        runs.append(tail)
    return [r for r in runs if r.strip()]


_ARCHIVE_ROW = re.compile(
    r"^\s*\|\s*(\S+\.tbz2)\s*\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*$",
    re.MULTILINE,
)


def _parse_archives(text: str) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for m in _ARCHIVE_ROW.finditer(text):
        archive_path = m.group(1).strip()
        ym = None
        ym_m = re.search(r"_(\d{6})\.tbz2$", archive_path)
        if ym_m:
            ym = ym_m.group(1)
        out.append({
            "archive_path": archive_path,
            "year_month": ym,
            "file_count": int(m.group(2)),
            "size_original_bytes": parse_size(m.group(3)),
            "size_archive_bytes": parse_size(m.group(4)),
            "keterangan": m.group(5).strip() or None,
        })
    return out


def _parse_run(segment: str) -> Optional[Dict[str, Any]]:
    server = _first(r"^Server\s*:\s*(.+?)\s*$", segment)
    folder = _first(r"^Folder\s*:\s*(.+?)\s*$", segment)
    if not server and not folder:
        return None  # bukan blok run yang valid

    mode_raw = _first(r"^Mode\s*:\s*(.+?)\s*$", segment) or ""
    period_from = period_to = None
    pm = re.search(r"Periode dipilih\s*:\s*(\d{6})\s*s/d\s*(\d{6})", segment)
    if pm:
        period_from, period_to = pm.group(1), pm.group(2)

    # Ukuran (arsip baru): '4.5 MB -> 233.9 KB (hemat 94%)'
    size_original = size_archive = savings_pct = None
    um = re.search(r"Ukuran[^|]*\|\s*([\d.,]+\s*\w+)\s*->\s*([\d.,]+\s*\w+)\s*\(hemat\s*(\d+)\s*%\)", segment)
    if not um:  # fallback ke baris ringkasan atas
        um = re.search(r"ukuran\s*([\d.,]+\s*\w+)\s*menjadi\s*([\d.,]+\s*\w+)\s*\(hemat\s*(\d+)\s*%\)", segment, re.IGNORECASE)
    if um:
        size_original = parse_size(um.group(1))
        size_archive = parse_size(um.group(2))
        savings_pct = float(um.group(3))

    archives = _parse_archives(segment)
    app_name = archives[0]["archive_path"].split("/")[0] if archives else None

    run_id = _first(r"#\s*SELESAI RUN\s+(\S+)", segment)
    started_at = _parse_dt(_first(r"^Mulai\s*:\s*([0-9:\- ]+?)\s*$", segment))
    finished_at = _parse_dt(_first(r"^Selesai\s*:\s*([0-9:\- ]+?)\s*$", segment))
    status = _first(r"^STATUS\s*:\s*(\w+)", segment) or _first(r"STATUS:\s*(\w+)", segment)

    run = {
        "run_id": run_id,
        "server": server,
        "folder": folder,
        "app_name": app_name,
        "mode": _map_mode(mode_raw),
        "period_from": period_from,
        "period_to": period_to,
        "status": status,
        "apps_checked": _int(r"Aplikasi diperiksa\s*\|\s*(\d+)", segment),
        "archives_created": _int(r"Arsip baru dibuat\s*\|\s*(\d+)", segment),
        "archives_verified": _int(r"Arsip lama diverifikasi\s*\|\s*(\d+)", segment),
        "failed": _int(r"Gagal\s*\|\s*(\d+)", segment),
        "files_in_archive": _int(r"File log di dalam arsip\s*\|\s*(\d+)", segment),
        "files_deleted": _int(r"File log asli dihapus\s*\|\s*(\d+)", segment),
        "size_original_bytes": size_original,
        "size_archive_bytes": size_archive,
        "savings_pct": savings_pct,
        "started_at": started_at,
        "finished_at": finished_at,
        "log_filename": _first(r"^File log\s*:\s*(.+?)\s*$", segment),
        "archives": archives,
    }
    # fingerprint: pakai run_id bila ada, else hash stabil dari identitas run
    if run_id:
        run["fingerprint"] = run_id
    else:
        raw = f"{server}|{folder}|{run['mode']}|{started_at}|{finished_at}|{run['files_deleted']}"
        run["fingerprint"] = "fp-" + hashlib.sha1(raw.encode()).hexdigest()[:20]
    return run


def parse_compression_log(content: str) -> List[Dict[str, Any]]:
    """Parse seluruh isi file log compressor -> daftar run (header + detail archives)."""
    if not content:
        return []
    out: List[Dict[str, Any]] = []
    for seg in _split_runs(content):
        run = _parse_run(seg)
        if run:
            out.append(run)
    return out

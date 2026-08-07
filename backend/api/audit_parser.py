"""Audit file activity report parser for audit-email-*.txt format."""
import re
import logging
from datetime import date, datetime
from typing import Optional

logger = logging.getLogger("audit_parser")

HEADER_RE = re.compile(
    r"Server\s+:\s+(.+?)\s*$", re.MULTILINE
)
DATE_RE = re.compile(
    r"Tanggal Aktivitas\s+:\s+(\d{4}-\d{2}-\d{2})", re.MULTILINE
)
DIR_RE = re.compile(
    r"Direktori Pantau\s+:\s+(.+?)\s*$", re.MULTILINE
)
NO_CHANGE_RE = re.compile(
    r"TIDAK ADA AKSI PERUBAHAN FILE"
)
SUMMARY_ACTION_RE = re.compile(
    r"Total Aksi Terdeteksi\s+:\s+(\d+)", re.MULTILINE
)
SUMMARY_FILE_RE = re.compile(
    r"Total File Terdampak\s+:\s+(\d+)", re.MULTILINE
)

BLOCK_USER_RE = re.compile(r"PENGGUNA\s+:\s+(.+?)\s*$", re.MULTILINE)
BLOCK_UID_RE = re.compile(r"\(UID:(\d+)\)")
BLOCK_PROSES_RE = re.compile(r"PROSES\s+:\s+(.+?)\s*$", re.MULTILINE)
BLOCK_AKTIVITAS_RE = re.compile(r"AKTIVITAS\s+:\s+(.+?)\s*$", re.MULTILINE)
BLOCK_LEVEL_RE = re.compile(r"LEVEL\s+:\s+(.+?)\s*$", re.MULTILINE)
BLOCK_FILE_RE = re.compile(r"FILE\s+:\s+(.+?)\s*$", re.MULTILINE)
BLOCK_TOTAL_FILE_RE = re.compile(r"TOTAL FILE\s+:\s+(\d+)")
BLOCK_WAKTU_RE = re.compile(r"WAKTU\s+:\s+(\S+)\s*-\s*(\S+)")
BLOCK_HASIL_RE = re.compile(r"HASIL\s+:\s+(.+?)\s*$", re.MULTILINE)

AUDITD_META_RE = re.compile(
    r'\s+(inode=|dev=|mode=|ouid=|ogid=|rdev=|obj=|nametype=|cap_fp=|cap_fi=|cap_fe=|cap_fver=|cap_frootid=|OUID=)'
)


def _clean_file_path(raw: str) -> Optional[str]:
    path = raw.strip()
    # Strip auditd metadata suffix (inode=..., dev=..., mode=..., etc.)
    path = AUDITD_META_RE.split(path)[0].strip()
    # Remove trailing comma or dot if any
    path = path.rstrip(',.')
    if not path or path == '(null)':
        return None
    return path


def _parse_activity_block(block: str) -> Optional[dict]:
    lines = [l.strip() for l in block.split('\n') if l.strip()]
    if not lines:
        return None

    block_text = '\n'.join(lines)
    user_match = BLOCK_USER_RE.search(block_text)
    if not user_match:
        return None

    user_line = user_match.group(1).strip()
    uid = None
    username = user_line
    uid_match = BLOCK_UID_RE.search(user_line)
    if uid_match:
        uid = int(uid_match.group(1))
        username = re.sub(r'\s*\(UID:\d+\)', '', user_line).strip()

    proses = BLOCK_PROSES_RE.search(block_text)
    aktivitas = BLOCK_AKTIVITAS_RE.search(block_text)
    level = BLOCK_LEVEL_RE.search(block_text)
    total_file = BLOCK_TOTAL_FILE_RE.search(block_text)
    waktu = BLOCK_WAKTU_RE.search(block_text)
    hasil = BLOCK_HASIL_RE.search(block_text)

    files = []
    file_match = BLOCK_FILE_RE.search(block_text)
    if file_match:
        file_start = file_match.start()
        first_path = _clean_file_path(file_match.group(1).strip())
        if first_path:
            files.append(first_path)

        remaining = block_text[file_start + len(file_match.group(0)):]
        for rline in remaining.split('\n'):
            rline = rline.strip()
            if rline and not re.match(r'^(TOTAL FILE|WAKTU|HASIL)', rline):
                cleaned = _clean_file_path(rline)
                if cleaned:
                    files.append(cleaned)

    cleaned_total = len(files)
    declared_total = int(total_file.group(1)) if total_file else cleaned_total

    return {
        'username': username,
        'uid': uid,
        'process_name': proses.group(1).strip() if proses else None,
        'activity_type': aktivitas.group(1).strip() if aktivitas else None,
        'level': level.group(1).strip() if level else None,
        'file_paths': files if files else None,
        'total_files': max(cleaned_total, declared_total),
        'time_start': waktu.group(1) if waktu else None,
        'time_end': waktu.group(2) if waktu else None,
        'result': hasil.group(1).strip() if hasil else None,
        'raw_block': block.strip(),
    }


def parse_audit_report(content: str, hostname: str, ip_address: str, scan_date: date) -> dict:
    # Normalize CRLF to LF early to prevent regex issues
    content = content.replace('\r\n', '\n').replace('\r', '')

    result = {
        'hostname': hostname,
        'ip_address': ip_address,
        'scan_date': str(scan_date),
        'server_summary': None,
        'watched_directory': None,
        'no_changes': False,
        'summary_total': 0,
        'summary_files': 0,
        'activities': [],
    }

    header_match = HEADER_RE.search(content)
    if header_match:
        result['server_summary'] = header_match.group(1).strip()

    dir_match = DIR_RE.search(content)
    if dir_match:
        result['watched_directory'] = dir_match.group(1).strip()

    no_change = NO_CHANGE_RE.search(content)
    if no_change:
        result['no_changes'] = True
        logger.info(f"[AUDIT-PARSE] {hostname}/{scan_date}: no changes detected")
        return result

    sum_action = SUMMARY_ACTION_RE.search(content)
    if sum_action:
        result['summary_total'] = int(sum_action.group(1))

    sum_file = SUMMARY_FILE_RE.search(content)
    if sum_file:
        result['summary_files'] = int(sum_file.group(1))

    blocks = re.split(r'-{68,}', content)
    for block in blocks:
        block = block.strip()
        if not block:
            continue
        if re.search(r'^LAPORAN AKTIVITAS FILE', block):
            continue
        if re.search(r'^RINGKASAN', block):
            continue
        if re.search(r'^RINCIAN AKSI', block):
            continue
        if re.search(r'^PENGGUNA', block, re.MULTILINE):
            parsed = _parse_activity_block(block)
            if parsed:
                result['activities'].append(parsed)

    logger.info(
        f"[AUDIT-PARSE] {hostname}/{scan_date}: "
        f"{len(result['activities'])} activities, "
        f"summary_actions={result['summary_total']}, summary_files={result['summary_files']}, "
        f"no_changes={result['no_changes']}"
    )
    return result

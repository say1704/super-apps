"""Backup Log Parser - Adapted from parser.py"""
import re
import time
import logging
from datetime import datetime, date
from typing import Optional, Dict, List, Any, Callable
from concurrent.futures import ThreadPoolExecutor, as_completed

logger = logging.getLogger(__name__)


# Configuration
MAX_FILES_TO_PROCESS = 10000  # Increased limit (was 500) - process all files
MAX_WORKERS = 10  # Number of parallel threads


def map_filename_to_ip(filename: str) -> Optional[str]:
    """
    Map log filename to IP address
    Adapted from parser.py
    """
    base = filename.replace(".log", "")
    tokens = base.split("_")[:-1]
    name_part = "_".join(tokens)

    # Manual mapping for special cases
    manual_map = {
        "log-192": "192.168.60.192"
    }
    if name_part in manual_map:
        return manual_map[name_part]

    # Pattern: log-dev-{number} -> 10.20.100.{number}
    if name_part.startswith("log-dev-"):
        number = name_part.replace("log-dev-", "")
        if number.isdigit():
            return f"10.20.100.{number}"
    
    # Pattern: log-{num1}_{num2} -> 10.20.{num1}.{num2}
    elif name_part.startswith("log-") and "_" in name_part:
        raw = name_part.replace("log-", "")
        parts = raw.split("_")
        if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
            return f"10.20.{parts[0]}.{parts[1]}"
    
    # Pattern: log-{number} -> 10.20.100.{number}
    elif name_part.startswith("log-"):
        number = name_part.replace("log-", "")
        if number.isdigit():
            return f"10.20.100.{number}"
    
    return None


def parse_log_content(filename: str, content: str) -> Optional[Dict[str, Any]]:
    """
    Parse log file content to extract backup information
    Adapted from parser.py
    
    Returns dict with: server_name, tanggal, jumlah_files, total_size_bytes, total_size_kb, total_size_mb, total_size_gb
    """
    jumlah_files = 0
    total_size_bytes = 0
    total_size_kb = 0.0
    total_size_mb = 0.0
    total_size_gb = 0.0

    for line in content.splitlines():
        line = line.strip()

        # Match "Jumlah Files:" or "Jumlah Files :"
        match_jumlah = re.search(r"Jumlah\s*Files\s*:?\s*(\d+)", line, re.IGNORECASE)
        if match_jumlah:
            jumlah_files = int(match_jumlah.group(1))
            continue

        # Match "Total Size...Bytes"
        match_bytes = re.search(
            r"Total\s*Size\s*(?:Files\s*Yang\s*Di\s*Backup)?\s*:?\s*(\d+)\s*Bytes",
            line,
            re.IGNORECASE,
        )
        if match_bytes:
            total_size_bytes = int(match_bytes.group(1))
            continue

        # Match "Total Size...KB"
        match_kb = re.search(
            r"Total\s*Size\s*(?:Files\s*Yang\s*Di\s*Backup)?\s*:?\s*([\d.]+)\s*KB",
            line,
            re.IGNORECASE,
        )
        if match_kb:
            total_size_kb = float(match_kb.group(1))
            continue

        # Match "Total Size...MB"
        match_mb = re.search(
            r"Total\s*Size\s*(?:Files\s*Yang\s*Di\s*Backup)?\s*:?\s*([\d.]+)\s*MB",
            line,
            re.IGNORECASE,
        )
        if match_mb:
            total_size_mb = float(match_mb.group(1))
            continue

        # Match "Total Size...GB"
        match_gb = re.search(
            r"Total\s*Size\s*(?:Files\s*Yang\s*Di\s*Backup)?\s*:?\s*([\d.]+)\s*GB",
            line,
            re.IGNORECASE,
        )
        if match_gb:
            total_size_gb = float(match_gb.group(1))
            continue

    # Parse date from filename
    try:
        base = filename.replace(".log", "")
        tokens = base.split("_")
        raw_date = tokens[-1]

        # Support multiple date formats
        if re.match(r"\d{2}-\d{2}-\d{4}$", raw_date):
            tanggal = datetime.strptime(raw_date, "%d-%m-%Y").date()
        elif re.match(r"\d{8}$", raw_date):
            tanggal = datetime.strptime(raw_date, "%Y%m%d").date()
        elif re.match(r"\d{2}-\d{2}-\d{4}-\d+$", raw_date):
            tanggal = datetime.strptime("-".join(raw_date.split("-")[:3]), "%d-%m-%Y").date()
        else:
            logger.warning("[SKIP] Unrecognized date format in: %s", filename)
            return None
    except Exception as e:
        logger.error("[ERROR] Failed to parse date from %s: %s", filename, e)
        return None

    # Map filename to IP
    ip_address = map_filename_to_ip(filename)
    if not ip_address:
        logger.warning("[SKIP] Unrecognized filename format: %s", filename)
        return None

    return {
        "server_name": ip_address,
        "tanggal": tanggal,
        "jumlah_files": jumlah_files,
        "total_size_bytes": total_size_bytes,
        "total_size_kb": total_size_kb,
        "total_size_mb": total_size_mb,
        "total_size_gb": total_size_gb,
    }


MAX_FILE_LIST_ENTRIES = 5000  # cap stored file entries per backup to bound blob size


def parse_file_list(content: str, max_entries: int = MAX_FILE_LIST_ENTRIES) -> Dict[str, Any]:
    """
    Extract the list of backed-up files from a backup log.

    Supports two confirmed formats:
      Format 1 (flat): file paths between "Daftar file:" and a blank line /
                       "Jumlah dan Size:" / "Jumlah Files:".
      Format 2 (grouped): file paths inside the "===== FILES BACKED UP ... ====="
                       block, grouped by [LOG] / [APP] / [SCRIPT] section headers,
                       terminated by the "FILES RENAMED" block.

    Returns: {"files": [{"path": str, "section": str|None}, ...], "truncated": bool}
    """
    lines = content.splitlines()
    files: List[Dict[str, Any]] = []
    truncated = False

    def _add(path: str, section: Optional[str]) -> None:
        nonlocal truncated
        path = path.strip()
        if not path:
            return
        if len(files) >= max_entries:
            truncated = True
            return
        files.append({"path": path, "section": section})

    # Format 2 first (more specific marker). Require a banner-style line
    # ("===== FILES BACKED UP ... =====") so prose that merely mentions the
    # phrase does not mis-route a Format 1 log into this branch.
    backed_up_idx = None
    for i, line in enumerate(lines):
        if "FILES BACKED UP" in line.upper() and "=" in line:
            backed_up_idx = i
            break

    if backed_up_idx is not None:
        section: Optional[str] = None
        for line in lines[backed_up_idx + 1:]:
            stripped = line.strip()
            upper = stripped.upper()
            if "FILES RENAMED" in upper:
                break
            if stripped.startswith("===") or upper.startswith("JUMLAH FILES"):
                break
            if not stripped:
                continue
            m = re.match(r"^\[(.+?)\]$", stripped)  # section header e.g. [LOG]
            if m:
                section = m.group(1).strip()
                continue
            if stripped.lower().startswith("(tidak ada file"):  # empty section marker
                continue
            _add(stripped, section)
        if files:
            return {"files": files, "truncated": truncated}
        # Banner matched but nothing captured -> fall through to Format 1.

    # Format 1: flat "Daftar file:" list.
    daftar_idx = None
    for i, line in enumerate(lines):
        if re.match(r"^\s*Daftar\s*file\s*:", line, re.IGNORECASE):
            daftar_idx = i
            break

    if daftar_idx is not None:
        # Any path on the same line as the header (rare), then subsequent lines.
        header_tail = re.sub(r"^\s*Daftar\s*file\s*:", "", lines[daftar_idx], flags=re.IGNORECASE).strip()
        if header_tail:
            _add(header_tail, None)
        for line in lines[daftar_idx + 1:]:
            stripped = line.strip()
            upper = stripped.upper()
            if not stripped:
                continue  # blank lines inside the block are skipped, not a terminator
            if (upper.startswith("JUMLAH DAN SIZE") or upper.startswith("JUMLAH FILES")
                    or upper.startswith("TOTAL SIZE") or "FILES RENAMED" in upper
                    or stripped.startswith("===")):
                break
            _add(stripped, None)
        return {"files": files, "truncated": truncated}

    return {"files": files, "truncated": truncated}


def calculate_status(jumlah_files: int, total_size_bytes: int) -> str:
    """
    Calculate backup status based on files and size
    Returns: "OK", "Warning", or "Critical"
    """
    if jumlah_files == 0 and total_size_bytes == 0:
        return "Critical"
    elif jumlah_files < 1000 or total_size_bytes < 100000000:  # < 100MB
        return "Warning"
    else:
        return "OK"


def format_size(size_bytes: int) -> str:
    """Format bytes to human readable size"""
    if size_bytes == 0:
        return "0 B"
    
    units = ['B', 'KB', 'MB', 'GB', 'TB']
    unit_index = 0
    size = float(size_bytes)
    
    while size >= 1024 and unit_index < len(units) - 1:
        size /= 1024
        unit_index += 1
    
    if unit_index == 0:
        return f"{int(size)} {units[unit_index]}"
    else:
        return f"{size:.2f} {units[unit_index]}"


def parse_all_logs(
    files: List[str], 
    read_file_func: Callable,
    progress_callback: Optional[Callable[[int, int], None]] = None
) -> List[Dict[str, Any]]:
    """
    Parse all log files and return backup status
    
    Args:
        files: List of file paths from SSH
        read_file_func: Function to read file content (returns success, content, message)
        progress_callback: Optional callback function(current, total) for progress updates
    
    Returns:
        List of parsed backup records with status
    """
    # Limit files to process
    total_files = len(files)
    if total_files > MAX_FILES_TO_PROCESS:
        logger.info("[INFO] Limiting from %d to %d files", total_files, MAX_FILES_TO_PROCESS)
        files = files[-MAX_FILES_TO_PROCESS:]  # Take latest files
    
    results = []
    processed = 0
    
    def parse_single_file(filepath: str) -> Optional[Dict[str, Any]]:
        """Parse a single file (for parallel execution)"""
        filename = filepath.split("/")[-1] if "/" in filepath else filepath
        
        success, content, message = read_file_func(filepath)
        if not success:
            logger.error("[ERROR] Failed to read %s: %s", filename, message)
            return None
        
        parsed = parse_log_content(filename, content)
        if not parsed:
            return None
        
        # Calculate status
        status = calculate_status(parsed["jumlah_files"], parsed["total_size_bytes"])
        
        return {
            "server": parsed["server_name"],
            "date": parsed["tanggal"].isoformat(),
            "files": parsed["jumlah_files"],
            "files_formatted": f"{parsed['jumlah_files']:,}",
            "size_bytes": parsed["total_size_bytes"],
            "size_formatted": format_size(parsed["total_size_bytes"]),
            "status": status,
            "filename": filename
        }
    
    # Use parallel processing for large datasets
    if len(files) > 50:
        logger.info("[INFO] Using parallel processing with %d workers for %d files", MAX_WORKERS, len(files))
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            # Submit all tasks
            future_to_file = {executor.submit(parse_single_file, filepath): filepath for filepath in files}
            
            # Collect results as they complete
            for future in as_completed(future_to_file):
                result = future.result()
                if result:
                    results.append(result)
                
                processed += 1
                if progress_callback:
                    progress_callback(processed, len(files))
    else:
        # Sequential processing for small datasets
        for filepath in files:
            result = parse_single_file(filepath)
            if result:
                results.append(result)
            
            processed += 1
            if progress_callback:
                progress_callback(processed, len(files))
    
    # Sort by server and date (newest first)
    results.sort(key=lambda x: (x["server"], x["date"]), reverse=True)
    
    # Keep only the latest record per server
    latest_per_server = {}
    for record in results:
        if record["server"] not in latest_per_server:
            latest_per_server[record["server"]] = record
    
    return list(latest_per_server.values())


def get_summary(records: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Generate summary statistics from backup records
    """
    total = len(records)
    ok = sum(1 for r in records if r["status"] == "OK")
    warning = sum(1 for r in records if r["status"] == "Warning")
    critical = sum(1 for r in records if r["status"] == "Critical")
    
    total_files = sum(r["files"] for r in records)
    total_size = sum(r["size_bytes"] for r in records)
    
    return {
        "total_servers": total,
        "ok_count": ok,
        "warning_count": warning,
        "critical_count": critical,
        "total_files": f"{total_files:,}",
        "total_size": format_size(total_size)
    }

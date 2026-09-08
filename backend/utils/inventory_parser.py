"""Application & Software Inventory log parser.

Mem-parsing log `YYYYMMDD_application-<hostname>.log` yang dihasilkan script server.
Fungsi murni (tanpa DB/SSH) agar mudah di-test. Pola mengikuti `backup_parser.py`.
"""
import re
import logging
from datetime import datetime
from typing import Optional, Dict, Any, List

logger = logging.getLogger(__name__)


def _val_after_colon(segment: str) -> str:
    """Ambil nilai setelah 'Key:' dari satu segmen. '' bila tak ada ':'."""
    if ":" in segment:
        return segment.split(":", 1)[1].strip()
    return segment.strip()


_CP_FLAGS = {"-cp", "-classpath", "--class-path"}


def _extract_jar(command: str) -> tuple[Optional[str], Optional[str]]:
    """Kembalikan (jar_path, jar_name) dari command Java.

    Mendukung dua gaya peluncuran:
    1. `-jar <path>`        -> jar_path=<path>, jar_name=basename.
    2. `-cp <classpath> ... <MainClass>` (juga -classpath/--class-path)
       -> jar_name=<MainClass> (identitas app), jar_path=<classpath> (daftar jar).
    3. Fallback: token pertama berakhiran `.jar`.
    """
    tokens = command.split()

    # 1) -jar <path>
    for i, tok in enumerate(tokens):
        if tok == "-jar" and i + 1 < len(tokens):
            path = tokens[i + 1]
            return path, path.rsplit("/", 1)[-1]

    # 2) -cp / -classpath / --class-path <classpath> ... <MainClass>
    for i, tok in enumerate(tokens):
        if tok in _CP_FLAGS and i + 1 < len(tokens):
            classpath = tokens[i + 1]
            # Main class = token pertama setelah classpath yang bukan opsi (tidak diawali '-').
            main_class = next((t for t in tokens[i + 2:] if not t.startswith("-")), None)
            if main_class:
                return classpath, main_class
            # Tak ada main class terbaca (mis. classpath saja) -> pakai basename entri terakhir.
            return classpath, classpath.rsplit("/", 1)[-1]

    # 3) Fallback: token tunggal berakhiran .jar
    for tok in tokens:
        if tok.endswith(".jar"):
            return tok, tok.rsplit("/", 1)[-1]

    return None, None


def _parse_filename(filename: str) -> tuple[Optional[datetime], Optional[str]]:
    """`YYYYMMDD_application-<hostname>.log` -> (date, hostname). (None, None) bila gagal."""
    base = filename.rsplit("/", 1)[-1]
    if base.endswith(".log"):
        base = base[:-4]
    if "_application-" not in base:
        return None, None
    date_part, host_part = base.split("_application-", 1)
    dt = None
    if re.match(r"^\d{8}$", date_part):
        try:
            dt = datetime.strptime(date_part, "%Y%m%d")
        except ValueError:
            dt = None
    return dt, (host_part or None)


def parse_inventory_log(filename: str, content: str) -> Optional[Dict[str, Any]]:
    """Parse isi log inventory.

    Returns dict `{"snapshot": {...}, "jars": [...], "software": [...]}` atau None
    bila tanggal tak terbaca / tidak ada item sama sekali.
    """
    file_date, file_host = _parse_filename(filename)
    if file_date is None:
        logger.warning("[SKIP] Tanggal tak terbaca dari nama file inventory: %s", filename)
        return None

    hostname = None
    collection_time = None
    log_file = None
    os_package_type = None
    package_manager = None
    total_jars_running = 0
    total_software = 0

    jars: List[Dict[str, Any]] = []
    software: List[Dict[str, Any]] = []

    section = None  # None | "jar" | "software"

    for raw in content.splitlines():
        line = raw.strip()
        if not line or set(line) <= {"-", "=", " "}:
            continue  # baris pemisah / kosong

        # Deteksi section
        if "APPLICATION STATUS" in line:
            section = "jar"
            continue
        if "INSTALLED SOFTWARE INVENTORY" in line:
            section = "software"
            continue

        # Item JAR
        if line.startswith("- User:"):
            segs = line.split("|")
            proc_user = _val_after_colon(segs[0]) if len(segs) > 0 else None
            pid_str = _val_after_colon(segs[1]) if len(segs) > 1 else ""
            start_token = _val_after_colon(segs[2]) if len(segs) > 2 else None
            command = "|".join(segs[3:]).strip() if len(segs) > 3 else ""
            jar_path, jar_name = _extract_jar(command)
            pid = int(pid_str) if pid_str.isdigit() else None
            jars.append({
                "proc_user": proc_user or None,
                "pid": pid,
                "start_token": start_token or None,
                "jar_name": jar_name,
                "jar_path": jar_path,
                "command_raw": command or None,
            })
            continue

        # Item software
        if line.startswith("- Software:"):
            segs = line.split("|")
            name = _val_after_colon(segs[0]) if len(segs) > 0 else None
            version = _val_after_colon(segs[1]) if len(segs) > 1 else None
            arch = _val_after_colon(segs[2]) if len(segs) > 2 else None
            executable = _val_after_colon(segs[3]) if len(segs) > 3 else None
            if name:
                software.append({
                    "name": name,
                    "version": version or None,
                    "arch": arch or None,
                    "executable": executable or None,
                })
            continue

        # Baris header "Key : Value"
        if ":" in line:
            key, value = line.split(":", 1)
            key = key.strip().lower()
            value = value.strip()
            if key == "hostname":
                hostname = value
            elif key == "collection time":
                collection_time = value
            elif key == "log file":
                log_file = value
            elif key.startswith("os package type"):
                os_package_type = value
            elif key.startswith("package manager"):
                package_manager = value
            elif key.startswith("total apps java running"):
                m = re.search(r"\d+", value)
                if m:
                    total_jars_running = int(m.group())
            elif key.startswith("total software detected"):
                m = re.search(r"\d+", value)
                if m:
                    total_software = int(m.group())

    if not jars and not software:
        logger.warning("[SKIP] 0 item pada log inventory: %s", filename)
        return None

    resolved_host = (hostname or file_host or "").strip()
    if not resolved_host:
        logger.warning("[SKIP] Hostname tak terbaca pada log inventory: %s", filename)
        return None

    collection_date = file_date.date()

    snapshot = {
        "hostname": resolved_host,
        "collection_date": collection_date,
        "collection_time": collection_time,
        "os_package_type": os_package_type,
        "package_manager": package_manager,
        # Pakai total dari log bila ada; fallback ke jumlah item ter-parse.
        "total_jars_running": total_jars_running or len(jars),
        "total_software": total_software or len(software),
        "log_file": log_file,
    }

    # Lengkapi hostname/collection_date pada tiap item.
    for j in jars:
        j["hostname"] = resolved_host
        j["collection_date"] = collection_date
    for s in software:
        s["hostname"] = resolved_host
        s["collection_date"] = collection_date

    return {"snapshot": snapshot, "jars": jars, "software": software}

"""Admin UI (sqlite-web) Manager — secure process lifecycle management."""
import os
import re
import signal
import asyncio
import hashlib
import secrets
import threading
import logging
import subprocess
from typing import Optional, Tuple

from utils.config import get_db_path

logger = logging.getLogger(__name__)

PID_FILE = "/tmp/sqlite-web.pid"
PASSWORD_FILE = "/tmp/sqlite-web-password"

ADMIN_UI_PORT = 8082
ADMIN_UI_URL_PREFIX = "/admin-ui"
MIN_PASSWORD_LENGTH = 8


def hash_password(password: str) -> str:
    """Hash password with random salt using SHA-256. Returns 'salt$hash'."""
    salt = secrets.token_hex(16)
    hashed = hashlib.sha256(f"{salt}{password}".encode()).hexdigest()
    return f"{salt}${hashed}"


def verify_password(password: str, stored: str) -> bool:
    """Verify plaintext password against stored 'salt$hash'."""
    if not stored or "$" not in stored:
        return False
    salt, expected_hash = stored.split("$", 1)
    actual_hash = hashlib.sha256(f"{salt}{password}".encode()).hexdigest()
    return actual_hash == expected_hash


def validate_password_strength(password: str) -> Tuple[bool, str]:
    """Validate password meets security requirements. Returns (valid, message)."""
    if len(password) < MIN_PASSWORD_LENGTH:
        return False, f"Password must be at least {MIN_PASSWORD_LENGTH} characters"
    if not re.search(r"[A-Z]", password):
        return False, "Password must contain at least one uppercase letter"
    if not re.search(r"[a-z]", password):
        return False, "Password must contain at least one lowercase letter"
    if not re.search(r"\d", password):
        return False, "Password must contain at least one number"
    return True, ""


def _get_sqlite_web_binary() -> str:
    """Get path to sqlite_web binary in venv."""
    return os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "venv", "bin", "sqlite_web")


def _get_db_path() -> str:
    return get_db_path()


def _get_cert_paths() -> Tuple[Optional[str], Optional[str]]:
    """Return (cert_path, key_path).

    Always (None, None): sqlite-web runs plain HTTP on 127.0.0.1 loopback,
    because the frontend proxy (server.js /admin-ui) talks to it over HTTP.
    """
    return None, None


def _write_password_file(password: str) -> None:
    """Write password to a secure temp file (owner-read only)."""
    fd = os.open(PASSWORD_FILE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        os.write(fd, password.encode())
    finally:
        os.close(fd)


def _cleanup_password_file() -> None:
    """Remove the temp password file if it exists."""
    try:
        os.unlink(PASSWORD_FILE)
    except OSError:
        pass


def _write_pid_file(pid: int) -> None:
    """Write PID to the PID file."""
    with open(PID_FILE, "w") as f:
        f.write(str(pid))


def _read_pid_file() -> Optional[int]:
    """Read PID from the PID file, return None if not found or invalid."""
    try:
        with open(PID_FILE, "r") as f:
            pid = int(f.read().strip())
        return pid
    except (OSError, ValueError):
        return None


def _cleanup_pid_file() -> None:
    """Remove the PID file."""
    try:
        os.unlink(PID_FILE)
    except OSError:
        pass


def _is_process_running(pid: int) -> bool:
    """Check if a process with given PID is running.

    Zombie (defunct) processes still respond to ``kill(pid, 0)``, so also
    treat them as dead and reap them when possible.
    """
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    try:
        with open(f"/proc/{pid}/stat") as f:
            fields = f.read().rsplit(")", 1)[-1].split()
        if fields and fields[0] == "Z":
            try:
                os.waitpid(pid, os.WNOHANG)
            except (ChildProcessError, OSError):
                pass
            return False
    except (OSError, IndexError):
        pass
    return True


def stop_sqlite_web() -> bool:
    """Stop sqlite-web process using PID file. Returns True if stopped or already dead."""
    pid = _read_pid_file()
    if pid and _is_process_running(pid):
        try:
            os.kill(pid, signal.SIGTERM)
            for _ in range(10):
                if not _is_process_running(pid):
                    break
                import time
                time.sleep(0.2)
            if _is_process_running(pid):
                os.kill(pid, signal.SIGKILL)
            logger.info("[ADMIN-UI] Stopped sqlite-web (PID %d)", pid)
        except OSError as e:
            logger.warning("[ADMIN-UI] Failed to stop sqlite-web (PID %d): %s", pid, e)
            return False
    _cleanup_pid_file()
    _cleanup_password_file()
    return True


def start_sqlite_web(password: str) -> Tuple[bool, str]:
    """
    Start sqlite-web with the given password.
    Returns (success, url).
    """
    stop_sqlite_web()

    if not password:
        logger.error("[ADMIN-UI] Empty password — refusing to start sqlite-web")
        return False, ""

    db_path = _get_db_path()
    sqlite_web = _get_sqlite_web_binary()
    cert_path, key_path = _get_cert_paths()

    if not os.path.isfile(sqlite_web):
        logger.error("[ADMIN-UI] sqlite_web binary not found: %s", sqlite_web)
        return False, ""

    if not os.path.isfile(db_path):
        logger.error("[ADMIN-UI] Database not found: %s", db_path)
        return False, ""

    _write_password_file(password)

    cmd = [
        sqlite_web, db_path,
        "-H", "127.0.0.1",
        "-p", str(ADMIN_UI_PORT),
        "-u", ADMIN_UI_URL_PREFIX,
        "-R", "50",
        "-P",
    ]

    if cert_path and key_path:
        cmd.extend(["-c", cert_path, "-k", key_path])
        scheme = "https"
    else:
        scheme = "http"
        logger.warning("[ADMIN-UI] SSL certs not found, running without HTTPS")

    url = f"{scheme}://localhost:{ADMIN_UI_PORT}{ADMIN_UI_URL_PREFIX}"

    log_file_path = "/tmp/sqlite-web.log"
    env = os.environ.copy()
    env["SQLITE_WEB_PASSWORD"] = password
    try:
        with open(log_file_path, "w") as log_file:
            proc = subprocess.Popen(
                cmd,
                env=env,
                stdout=log_file,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
        _write_pid_file(proc.pid)
        logger.info("[ADMIN-UI] Started sqlite-web (PID %d) on %s", proc.pid, url)
        return True, url
    except Exception as e:
        logger.error("[ADMIN-UI] Failed to start sqlite-web: %s", e)
        _cleanup_pid_file()
        _cleanup_password_file()
        return False, ""


def is_sqlite_web_running() -> Tuple[bool, Optional[str]]:
    """Check if sqlite-web is running. Returns (is_running, url)."""
    pid = _read_pid_file()
    if pid and _is_process_running(pid):
        cert_path, _ = _get_cert_paths()
        scheme = "https" if cert_path else "http"
        return True, f"{scheme}://localhost:{ADMIN_UI_PORT}{ADMIN_UI_URL_PREFIX}"
    return False, None


_watchdog_stop = threading.Event()
_watchdog_thread: Optional[threading.Thread] = None


def start_sqlite_web_watchdog(password: str, interval: int = 30) -> None:
    """Periodically ensure sqlite-web stays alive, restarting it if it dies.

    Only meaningful for the single backend instance that owns the Admin UI
    (the one with START_ADMIN_UI set). Runs as a daemon thread.
    """
    global _watchdog_thread
    _watchdog_stop.clear()
    if _watchdog_thread and _watchdog_thread.is_alive():
        return

    def _loop() -> None:
        while not _watchdog_stop.is_set():
            try:
                running, _ = is_sqlite_web_running()
                if not running:
                    logger.warning("[ADMIN-UI] sqlite-web not running — restarting")
                    success, url = start_sqlite_web(password)
                    if success:
                        logger.info("[ADMIN-UI] Watchdog restarted sqlite-web on %s", url)
            except Exception as e:
                logger.warning("[ADMIN-UI] Watchdog check failed: %s", e)
            _watchdog_stop.wait(interval)

    _watchdog_thread = threading.Thread(target=_loop, name="sqlite-web-watchdog", daemon=True)
    _watchdog_thread.start()


def stop_sqlite_web_watchdog() -> None:
    """Signal the watchdog thread to stop."""
    _watchdog_stop.set()

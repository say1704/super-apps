"""Capacity Planning API - SAR-based server monitoring"""
from utils.timezone import utcnow, to_iso
from fastapi import APIRouter, Depends, HTTPException, status, Query, Body
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from datetime import datetime, date, timedelta, timezone
from typing import List, Optional
from pydantic import BaseModel
from collections import defaultdict
import calendar
import re
import shlex
import time
import os
import logging

logger = logging.getLogger("capacity_planning")

# Feature flag — default OFF. When OFF, system behaves exactly as before (root only).
# Treated as experimental — controlled by environment variable.
ENABLE_SUDO_MODE = os.getenv("ENABLE_SUDO_MODE", "false").lower() == "true"

from database import get_db
from models import CapacityMetrics, User, DiskPartition, NetworkInterface
from api.dependencies import get_current_user, log_activity
from utils.ssh_handler import SSHConnection
from utils.progress_tracker import create_progress_tracker, get_progress, cleanup_progress
from utils.capacity_projection import calculate_projection
from api.schemas import MessageResponse

router = APIRouter(prefix="/capacity-planning", tags=["Capacity Planning"])

def _sanitize_path(path: str) -> str:
    """Remove shell metacharacters from paths used in remote commands."""
    return re.sub(r'[^a-zA-Z0-9/_.\-]', '', path)


def _round_pct(value) -> Optional[float]:
    """Round percentage value to 2 decimals; returns None for None/empty."""
    if value is None:
        return None
    try:
        return round(float(value), 2)
    except (TypeError, ValueError):
        return None


def _parse_size_mb(value: Optional[str]) -> float:
    """Return size in MB from strings like '123.45 MB', '2.34 GB', '512 KB', '0.00 MB (note)'.

    Unit-aware: B/KB/MB/GB/TB (and *iB variants) are converted to MB; a bare number is
    assumed to already be MB. Previously this treated every value as MB, so 'x GB' was
    understated ~1000x on high-traffic hosts.
    """
    if not value:
        return 0.0
    tokens = str(value).split()
    if not tokens:
        return 0.0
    try:
        num = float(tokens[0])
    except (ValueError, IndexError):
        return 0.0
    unit = tokens[1] if len(tokens) > 1 else 'MB'
    ukey = ''.join(c for c in unit.upper() if c.isalpha()).replace('IB', 'B')  # MiB->MB, GiB->GB
    factors = {'B': 1 / (1024 * 1024), 'KB': 1 / 1024, 'MB': 1.0, 'GB': 1024.0, 'TB': 1024.0 * 1024.0}
    return num * factors.get(ukey, 1.0)


def _capacity_to_dict(record: CapacityMetrics) -> dict:
    """Convert CapacityMetrics ORM object to dict for JSON serialization."""
    # Fallback: if disk_usr_local_syb_pct is NULL but disk_data_pct holds the
    # /usr/local/syb usage (label matches), surface it in the usr_local_syb column.
    disk_usr_local_syb = record.disk_usr_local_syb_pct
    disk_usr_local_syb_label = record.disk_usr_local_syb_label or '/usr/local/syb'
    if disk_usr_local_syb is None and record.disk_data_pct is not None and (record.disk_data_label or '') == '/usr/local/syb':
        disk_usr_local_syb = record.disk_data_pct
        disk_usr_local_syb_label = record.disk_data_label

    return {
        "id": record.id,
        "tanggal": to_iso(record.tanggal),
        "parsed_at": to_iso(record.parsed_at),
        "hostname": record.hostname,
        "ip_address": record.ip_address,
        "source": record.source,
        "status": record.status,
        "alert_reason": record.alert_reason,
        "cpu_user_avg": _round_pct(record.cpu_user_avg),
        "cpu_system_avg": _round_pct(record.cpu_system_avg),
        "cpu_iowait_avg": _round_pct(record.cpu_iowait_avg),
        "cpu_idle_avg": _round_pct(record.cpu_idle_avg),
        "cpu_peak": _round_pct(record.cpu_peak),
        "cpu_peak_time": record.cpu_peak_time,
        "cpu_peak_max": _round_pct(record.cpu_peak_max),
        "ram_avg": _round_pct(record.ram_avg),
        "ram_peak": _round_pct(record.ram_peak),
        "ram_peak_time": record.ram_peak_time,
        "ram_peak_max": _round_pct(record.ram_peak_max),
        "kbmemfree_avg": record.kbmemfree_avg,
        "kbcommit_avg": record.kbcommit_avg,
        "disk_root_pct": record.disk_root_pct,
        "disk_data_pct": record.disk_data_pct,
        "disk_data_label": record.disk_data_label,
        "disk_usr_local_syb_pct": disk_usr_local_syb,
        "disk_usr_local_syb_label": disk_usr_local_syb_label,
        "net_rx_peak": record.net_rx_peak,
        "net_tx_peak": record.net_tx_peak,
        "net_conn": record.net_conn,
        "peak_description": record.peak_description,
        "log_file": record.log_file,
        "created_by": record.created_by,
    }


# ==================== SUDO WRAPPER (scoped to this module only, experimental) ====================

def _build_command(cmd: str, username: str, password: str) -> tuple:
    """
    Build final command for ssh.ssh.exec_command().
    - root user → bash -c 'cmd' (unchanged existing behavior)
    - non-root + ENABLE_SUDO_MODE → printf '<pw>\\n' | sudo -S -p '' sh -c 'cmd'
    - non-root + sudo OFF → bash -c 'cmd' (same as root)

    The sudo password is PIPED to `sudo -S` via printf (not written to a PTY stdin).
    Delivering the password through a PTY stdin returned empty on some hosts (line-discipline
    echo/timing), which surfaced as a misleading "No log files found"; piping bypasses that.
    Running the binary via `sh` lets sudo's secure_path resolve ls/cat/ip portably (/bin vs
    /usr/bin). Paths are pre-sanitized by _sanitize_path; the password is shell-quoted.
    """
    is_root = (username == 'root')
    use_sudo = (not is_root) and ENABLE_SUDO_MODE

    if use_sudo:
        return (f"printf '%s\\n' {shlex.quote(password or '')} | sudo -S -p '' sh -c '{cmd}'", True)

    # Root or sudo OFF: bash -c for wildcard expansion (existing behavior)
    return (f"bash -c '{cmd}'", False)


def _exec_remote(ssh: SSHConnection, cmd: str, username: str, password: str, timeout: int = 30) -> tuple:
    """
    Execute command with sudo support. Returns (stdout, stderr, context).
    For sudo mode: PTY allocated (for `requiretty` sudoers); password is piped inside the
    command (printf | sudo -S), NOT written to stdin.
    """
    final_cmd, use_sudo = _build_command(cmd, username, password)
    is_root = (username == 'root')
    mode = 'root' if is_root else ('sudo' if use_sudo else 'direct')
    context = {'mode': mode, 'raw_cmd': final_cmd, 'sudo_failed': False}

    try:
        logger.debug(f"mode={mode}, cmd={final_cmd[:200]}")
        use_pty = use_sudo
        # Password (sudo mode) is piped inside final_cmd via printf — do NOT write to stdin.
        stdin, stdout, stderr = ssh.ssh.exec_command(final_cmd, timeout=timeout, get_pty=use_pty)

        out = stdout.read().decode('utf-8', errors='ignore').strip()
        err = stderr.read().decode('utf-8', errors='ignore').strip()

        logger.debug(f"output_len={len(out)}, stderr_len={len(err)}")
        if out:
            logger.debug(f"stdout_preview: {out[:200]}")
        if err:
            logger.warning(f"stderr: {err[:200]}")

        if not out and mode == 'sudo':
            logger.warning("Sudo execution returned empty result")
    except Exception as e:
        out, err = '', str(e)
        logger.error(f"Execution failed: {e}")

    return (out, err, context)


def _fetch_ethernet_interfaces(ssh: SSHConnection, username: str, password: str) -> list:
    """
    Capture interface IP/MAC via `ip addr` over SSH.
    Returns list of {interface_name, ip_address, mac_address}.
    """
    try:
        # Prefer 'ip -o addr' (machine-readable, one interface per line)
        out, err, ctx = _exec_remote(ssh, 'ip -o addr show', username, password, timeout=30)
        if not out:
            # Fallback: plain `ip addr`
            out, err, ctx = _exec_remote(ssh, 'ip addr show', username, password, timeout=30)

        interfaces = []
        current_iface = None
        current_mac = None
        current_ips = []

        # Name from an interface block header: "2: ens160" or "2: ens160:"
        iface_re = re.compile(r'^\d+:\s+([a-zA-Z0-9_.\-@]+)')

        for line in (out or '').split('\n'):
            line = line.strip()
            if not line:
                continue

            # New interface block header — flush previous and set current.
            # NOTE: in `ip -o addr` output the inet/link lines ALSO start with
            # "<num>: <iface>", so after updating current_iface we fall through
            # to the MAC/IP extraction below instead of continuing.
            m = iface_re.match(line)
            if m:
                iface_name = m.group(1).split('@')[0].rstrip(':')
                if current_iface and current_iface != iface_name:
                    interfaces.append({
                        'interface_name': current_iface,
                        'ip_address': ', '.join(current_ips) if current_ips else 'Tidak ada IP',
                        'mac_address': current_mac or 'Tidak ada MAC',
                    })
                    current_iface = iface_name
                    current_mac = None
                    current_ips = []
                elif not current_iface:
                    current_iface = iface_name

            # MAC address line
            if 'link/ether ' in line:
                parts = line.split()
                mac_idx = next((i for i, p in enumerate(parts) if p == 'link/ether'), None)
                if mac_idx is not None and mac_idx + 1 < len(parts):
                    current_mac = parts[mac_idx + 1]

            # IP address line (inet / inet6) — find token containing '/'
            if 'inet ' in line or 'inet6 ' in line:
                for tok in line.split():
                    if '/' in tok:
                        ip = tok.split('/')[0]
                        # Only keep IPv4 addresses (skip loopback, link-local & IPv6)
                        if ip not in ('127.0.0.1', '::1') and ':' not in ip and not ip.startswith('169.254.'):
                            current_ips.append(ip)

        # Flush the last interface
        if current_iface:
            interfaces.append({
                'interface_name': current_iface,
                'ip_address': ', '.join(current_ips) if current_ips else 'Tidak ada IP',
                'mac_address': current_mac or 'Tidak ada MAC',
            })

        return interfaces
    except Exception as e:
        logger.warning(f"Failed to fetch ethernet interfaces: {e}")
        return []


# ==================== SAR LOG PARSER ====================

def _convert_to_24h(time_str: str, ampm: str) -> str:
    """Convert HH:MM:SS AM/PM to 24-hour HH:MM format."""
    try:
        parts = time_str.split(':')
        hour = int(parts[0])
        minute = parts[1]
        if ampm == 'PM' and hour != 12:
            hour += 12
        elif ampm == 'AM' and hour == 12:
            hour = 0
        return f"{hour:02d}:{minute}"
    except (ValueError, IndexError):
        return time_str


def _generate_peak_description(cpu_peak_max, cpu_peak_time, cpu_avg, ram_peak_max, ram_peak_time, ram_avg) -> str:
    """Generate human-readable peak description for the last 24 hours."""
    parts = []

    if cpu_peak_max and cpu_peak_time:
        period = "jam sibuk" if 8 <= int(cpu_peak_time.split(':')[0]) < 18 else "di luar jam sibuk"
        parts.append(f"CPU Peak: {cpu_peak_max:.1f}% pukul {cpu_peak_time} ({period})")

    if ram_peak_max and ram_peak_time:
        period = "jam sibuk" if 8 <= int(ram_peak_time.split(':')[0]) < 18 else "di luar jam sibuk"
        parts.append(f"RAM Peak: {ram_peak_max:.1f}% pukul {ram_peak_time} ({period})")

    if not parts:
        return None

    desc = " | ".join(parts)
    avg_parts = []
    if cpu_avg:
        avg_parts.append(f"Rata-rata CPU: {cpu_avg:.1f}%")
    if ram_avg:
        avg_parts.append(f"RAM: {ram_avg:.1f}%")
    if avg_parts:
        desc += f" — {', '.join(avg_parts)}"
    return desc


def parse_sar_log(log_content: str, hostname: str, ip_address: str, target_date: date) -> dict:
    """
    Parse SAR log content (same pattern as Backup Check parser)

    Expected format:
    ================USAGE CPU hostname==========================
    01:00:01 AM     all      0.15      0.00      0.06      0.09      0.00     99.70
    ...
    ================USAGE RAM hostname==========================
    ...
    ================USAGE DISK hostname=========================
    ...
    """
    metrics = {
        'hostname': hostname,
        'ip_address': ip_address,
        'tanggal': str(target_date),
        'cpu_user_avg': 0, 'cpu_system_avg': 0, 'cpu_iowait_avg': 0, 'cpu_idle_avg': 0, 'cpu_peak': 0,
        'cpu_peak_time': None, 'cpu_peak_max': None,
        'ram_avg': 0, 'ram_peak': 0, 'ram_peak_time': None, 'ram_peak_max': None,
        'kbmemfree_avg': 0, 'kbcommit_avg': 0,
        'disk_root_pct': 0, 'disk_data_pct': 0, 'disk_data_label': '/Backup',
        'net_rx_peak': 0, 'net_tx_peak': 0, 'net_conn': 0,
        'peak_description': None,
        'partitions': [],  # All disk partitions
        'server_date': None,
        'public_ip': None,
        'system_info': {},
        'ethernet_interfaces': [],
        'network_interfaces': []
    }
    
    lines = log_content.strip().split('\n')
    
    # Parse SERVER INFORMATION section
    in_server_info = False
    in_ethernet_section = False
    for line in lines:
        if 'SERVER INFORMATION' in line:
            in_server_info = True
            continue
        if in_server_info:
            if 'ETHERNET & IP LOKAL' in line:
                in_ethernet_section = True
                continue
            if line.strip().startswith('===') and in_ethernet_section:
                break
            if in_ethernet_section and ':' in line:
                # Parse ethernet interface line: "ens160      : 10.150.70.11    (MAC: 00:50:56:ae:96:00)"
                parts = line.split(':')
                if len(parts) >= 2:
                    iface_name = parts[0].strip()
                    ip_part = parts[1].strip().split()[0] if parts[1].strip() else None
                    mac_part = None
                    if 'MAC:' in line:
                        mac_idx = line.find('MAC:')
                        if mac_idx >= 0:
                            mac_part = line[mac_idx+4:].strip().rstrip(')')
                    if iface_name and ip_part:
                        metrics['ethernet_interfaces'].append({
                            'interface_name': iface_name,
                            'ip_address': ip_part,
                            'mac_address': mac_part or 'Tidak ada MAC'
                        })
            elif 'Hostname' in line and ':' in line:
                metrics['hostname'] = line.split(':', 1)[1].strip()
            elif 'Date' in line and ':' in line:
                metrics['server_date'] = line.split(':', 1)[1].strip()
            elif 'Public IP' in line and ':' in line:
                metrics['public_ip'] = line.split(':', 1)[1].strip()
            elif 'Serial Number' in line and ':' in line:
                metrics['system_info']['serial'] = line.split(':', 1)[1].strip()
            elif 'RAM Total' in line and ':' in line:
                metrics['system_info']['ram'] = line.split(':', 1)[1].strip()
            elif 'Hypervisor' in line and ':' in line:
                metrics['system_info']['hypervisor'] = line.split(':', 1)[1].strip()
            elif 'OS' in line and ':' in line:
                metrics['system_info']['os'] = line.split(':', 1)[1].strip()
            elif 'CPU' in line and ':' in line:
                metrics['system_info']['cpu'] = line.split(':', 1)[1].strip()
            elif 'System' in line and ':' in line:
                metrics['system_info']['system'] = line.split(':', 1)[1].strip()
            elif 'Uptime' in line and ':' in line:
                metrics['system_info']['uptime'] = line.split(':', 1)[1].strip()
    
    # Parse USAGE NETWORK section
    in_network_section = False
    current_interface = {}
    for line in lines:
        if 'USAGE NETWORK' in line:
            in_network_section = True
            continue
        if in_network_section:
            if '================END' in line or '===================' in line:
                # Save last interface if exists
                if current_interface:
                    metrics['network_interfaces'].append(current_interface)
                break
            if 'Interface' in line and ':' in line:
                # Save previous interface if exists
                if current_interface:
                    metrics['network_interfaces'].append(current_interface)
                # Start new interface
                iface_name = line.split(':', 1)[1].strip()
                current_interface = {
                    'interface_name': iface_name,
                    'speed': '10000Mb/s',  # Default
                    'total_rx': '0 MB',
                    'total_tx': '0 MB',
                    'total_rx_error': 0,
                    'total_tx_error': 0,
                    'total_packet_drop': 0,
                    'internet_status': 'TIDAK TERHUBUNG'
                }
            elif 'Speed' in line and ':' in line:
                current_interface['speed'] = line.split(':', 1)[1].strip()
            elif 'Total RX (24 Jam)' in line and ':' in line:
                rx_val = line.split(':', 1)[1].strip()
                current_interface['total_rx'] = rx_val
            elif 'Total TX (24 Jam)' in line and ':' in line:
                tx_val = line.split(':', 1)[1].strip()
                current_interface['total_tx'] = tx_val
            elif 'Total RX Error' in line and ':' in line:
                try:
                    current_interface['total_rx_error'] = int(line.split(':', 1)[1].strip())
                except:
                    pass
            elif 'Total TX Error' in line and ':' in line:
                try:
                    current_interface['total_tx_error'] = int(line.split(':', 1)[1].strip())
                except:
                    pass
            elif 'Total Packet Drop' in line and ':' in line:
                try:
                    current_interface['total_packet_drop'] = int(line.split(':', 1)[1].strip())
                except:
                    pass
            elif 'Internet' in line and ':' in line:
                current_interface['internet_status'] = line.split(':', 1)[1].strip()

    # Derive scalar peak RX/TX (MB) from the parsed interfaces so freshly-created records
    # match the backfill path (which computes the same). Without this, new records stored 0.
    if metrics['network_interfaces']:
        metrics['net_rx_peak'] = max(_parse_size_mb(n.get('total_rx')) for n in metrics['network_interfaces'])
        metrics['net_tx_peak'] = max(_parse_size_mb(n.get('total_tx')) for n in metrics['network_interfaces'])

    # Parse CPU
    cpu_values = []
    cpu_max_usage = -1
    cpu_peak_time = None
    in_cpu_section = False
    for line in lines:
        if 'USAGE CPU' in line:
            in_cpu_section = True
            continue
        if 'USAGE RAM' in line:
            break
        if in_cpu_section and ('AM' in line or 'PM' in line) and 'all' in line:
            parts = line.split()
            try:
                all_idx = parts.index('all')
                if len(parts) > all_idx + 6:
                    time_str = parts[0]
                    ampm = parts[1]
                    user = float(parts[all_idx + 1])
                    system = float(parts[all_idx + 3])
                    iowait = float(parts[all_idx + 4])
                    idle = float(parts[all_idx + 6])
                    cpu_values.append({'user': user, 'system': system, 'iowait': iowait, 'idle': idle})
                    cpu_usage = 100 - idle
                    if cpu_usage > cpu_max_usage:
                        cpu_max_usage = cpu_usage
                        cpu_peak_time = _convert_to_24h(time_str, ampm)
            except (ValueError, IndexError):
                continue
    
    if cpu_values:
        metrics['cpu_user_avg'] = sum(v['user'] for v in cpu_values) / len(cpu_values)
        metrics['cpu_system_avg'] = sum(v['system'] for v in cpu_values) / len(cpu_values)
        metrics['cpu_iowait_avg'] = sum(v['iowait'] for v in cpu_values) / len(cpu_values)
        metrics['cpu_idle_avg'] = sum(v['idle'] for v in cpu_values) / len(cpu_values)
        metrics['cpu_peak'] = 100 - metrics['cpu_idle_avg']
        if cpu_max_usage >= 0:
            metrics['cpu_peak_max'] = round(cpu_max_usage, 2)
            metrics['cpu_peak_time'] = cpu_peak_time
    
    # Parse RAM.
    # IMPORTANT: map columns from the sar header rather than fixed positions. Newer
    # sysstat inserts a `kbavail` column (kbmemfree kbavail kbmemused %memused ...),
    # so hardcoding %memused=parts[4] silently reads kbmemused and inflates RAM%.
    # Reading the header keeps both old and new sysstat layouts correct.
    ram_values = []
    ram_max_pct = -1
    ram_peak_time = None
    in_ram_section = False
    ram_cols = None  # header column-name -> index (aligned with data columns)
    for line in lines:
        if 'USAGE RAM' in line:
            in_ram_section = True
            continue
        if 'USAGE DISK' in line:
            break
        if not in_ram_section:
            continue
        # Detect the sar column header, e.g.:
        #   "12:00:01 AM kbmemfree kbavail kbmemused %memused kbbuffers ... kbcommit %commit ..."
        if 'kbmemfree' in line and '%memused' in line:
            ram_cols = {name: i for i, name in enumerate(line.split())}
            continue
        if 'AM' in line or 'PM' in line:
            parts = line.split()
            try:
                if ram_cols:
                    i_free = ram_cols.get('kbmemfree')
                    i_used = ram_cols.get('kbmemused')
                    i_pct = ram_cols.get('%memused')
                    i_commit = ram_cols.get('kbcommit')
                    if i_pct is None or len(parts) <= i_pct or not parts[i_pct].replace('.', '').isdigit():
                        continue
                    kbmemfree = float(parts[i_free]) if i_free is not None and len(parts) > i_free else 0.0
                    kbmemused = float(parts[i_used]) if i_used is not None and len(parts) > i_used else 0.0
                    memused_pct = float(parts[i_pct])
                    kbcommit = float(parts[i_commit]) if i_commit is not None and len(parts) > i_commit else 0.0
                else:
                    # Fallback (no header found): legacy fixed positions (old sysstat w/o kbavail)
                    if len(parts) < 6 or not parts[2].replace('.', '').isdigit():
                        continue
                    kbmemfree = float(parts[2])
                    kbmemused = float(parts[3])
                    memused_pct = float(parts[4])
                    kbcommit = 0.0
                ram_values.append({'time': parts[0], 'ampm': parts[1], 'kbmemfree': kbmemfree,
                                   'kbmemused': kbmemused, 'memused_pct': memused_pct, 'kbcommit': kbcommit})
            except (ValueError, IndexError):
                continue

    if ram_values:
        metrics['kbmemfree_avg'] = sum(v['kbmemfree'] for v in ram_values) / len(ram_values)
        metrics['kbcommit_avg'] = sum(v['kbcommit'] for v in ram_values) / len(ram_values)
        metrics['ram_avg'] = sum(v['memused_pct'] for v in ram_values) / len(ram_values)
        metrics['ram_peak'] = max(v['memused_pct'] for v in ram_values)
        for v in ram_values:
            if v['memused_pct'] > ram_max_pct:
                ram_max_pct = v['memused_pct']
                ram_peak_time = _convert_to_24h(v['time'], v['ampm'])
        if ram_max_pct >= 0:
            metrics['ram_peak_max'] = round(ram_max_pct, 2)
            metrics['ram_peak_time'] = ram_peak_time

    # Parse DISK (df -h output) - ALL partitions
    in_disk_section = False
    physical_persistent_partitions = []  # /dev/sd* only (not tmpfs/devtmpfs)
    for line in lines:
        if 'USAGE DISK' in line:
            in_disk_section = True
            continue
        if in_disk_section and 'END' in line:
            break
        if in_disk_section and '/' in line and '%' in line:
            parts = line.split()
            if len(parts) >= 5:
                try:
                    filesystem = parts[0]
                    size = parts[1]
                    used = parts[2]
                    avail = parts[3]
                    use_pct = int(parts[4].replace('%', ''))
                    mount_point = parts[5] if len(parts) > 5 else ''

                    # Save ALL partitions
                    metrics['partitions'].append({
                        'filesystem': filesystem,
                        'mount_point': mount_point,
                        'size': size,
                        'used': used,
                        'avail': avail,
                        'use_pct': use_pct
                    })

                    # Map / partition usage
                    if mount_point == '/':
                        metrics['disk_root_pct'] = use_pct

                    # Track physical (non-virtual) partitions for secondary disk mapping
                    # Skip tmpfs, devtmpfs, shm, sysfs, proc, cgroup, none, overlay, mqueue
                    # Accept /dev/*, ZFS (poolname/dataset), NFS (host:/share), BTRFS, etc.
                    is_virtual = any(
                        filesystem.startswith(skip)
                        for skip in ('tmpfs', 'devtmpfs', 'shm', 'sysfs', 'proc', 'user/', 'cgroup', 'none',
                                     'overlay', 'mqueue', 'efivarfs', 'squashfs', 'ramfs', 'debugfs',
                                     'tracefs', 'configfs', 'pstore', 'fusectl', 'securityfs', 'autofs',
                                     'hugetlbfs', 'binfmt_misc', 'devpts')
                    ) or mount_point.startswith(('/sys', '/proc', '/run', '/dev', '/boot'))
                    if not is_virtual and mount_point != '/' and mount_point.startswith('/'):
                        physical_persistent_partitions.append((mount_point, use_pct))

                except (ValueError, IndexError):
                    continue

    # Map second disk dynamically: use /Backup or /data if available, else fallback to first /dev/ partition
    secondary_mounts = [m for m in physical_persistent_partitions if m[0] in ('/Backup', '/data')]
    if secondary_mounts:
        metrics['disk_data_pct'] = secondary_mounts[0][1]
        metrics['disk_data_label'] = secondary_mounts[0][0]
    elif physical_persistent_partitions:
        # Prefer /usr/local/syb over other partitions (standard for SYB servers)
        usr_local_syb = [m for m in physical_persistent_partitions if m[0] == '/usr/local/syb']
        if usr_local_syb:
            metrics['disk_data_pct'] = usr_local_syb[0][1]
            metrics['disk_data_label'] = usr_local_syb[0][0]
        else:
            # Fallback: use the first physical partition that's not /
            metrics['disk_data_pct'] = physical_persistent_partitions[0][1]
            metrics['disk_data_label'] = physical_persistent_partitions[0][0]
    
    metrics['peak_description'] = _generate_peak_description(
        metrics.get('cpu_peak_max'), metrics.get('cpu_peak_time'), metrics.get('cpu_peak'),
        metrics.get('ram_peak_max'), metrics.get('ram_peak_time'), metrics.get('ram_avg')
    )

    return metrics


# ==================== REQUEST MODELS ====================

class FetchSARRequest(BaseModel):
    """Request model for fetching SAR data - credentials in body (not URL)"""
    hostname: str  # IP address or hostname for SSH connection
    username: str
    password: Optional[str] = None
    private_key: Optional[str] = None
    port: int = 22
    sar_dir: str = "/var/log/sa"
    mode: Optional[str] = "auto"  # auto/daily/weekly/monthly
    auth_mode: Optional[str] = "root"  # root or sudo
    overwrite: bool = False  # if True, re-parse & UPDATE existing dates (one-time correction)


class BatchScanRequest(BaseModel):
    """Request model for parallel bulk scan of all/specific servers"""
    servers: List[str]  # List of hostnames/IPs to scan
    username: str
    private_key: Optional[str] = None  # SSH key (optional if password provided)
    password: Optional[str] = None  # SSH password (optional if private_key provided)
    port: int = 22
    sar_dir: str = "/var/log/sa"
    auth_mode: Optional[str] = "sudo"  # root or sudo
    max_workers: int = 50  # Parallel thread count (default 50)
    overwrite: bool = False  # if True, re-parse & UPDATE existing dates (one-time correction)


# ==================== HELPER FUNCTIONS ====================

def auto_detect_sar_mode(db: Session) -> tuple:
    """
    Auto-detect scan mode based on last import time and data gaps (matching backup-check logic).
    Returns: (mode_name, days_to_check)
    
    Logic:
    1. Get last data date from database (max(tanggal)) - for gap detection
    2. Get last import time (parsed_at) - for scan frequency
    3. Decide scan mode based on both factors
    """
    from sqlalchemy import desc, func

    # Get last import time (when data was LAST imported)
    last_import_record = db.query(CapacityMetrics).order_by(
        desc(CapacityMetrics.parsed_at)
    ).first()

    # Get last data date (most recent SAR data in DB)
    last_data_record = db.query(CapacityMetrics).order_by(
        desc(CapacityMetrics.tanggal)
    ).first()

    if not last_import_record:
        return "monthly", 365  # First run ever

    last_import = last_import_record.parsed_at
    last_data_date = last_data_record.tanggal if last_data_record else None
    
    # Handle naive datetimes from legacy data (assume UTC)
    if last_import.tzinfo is None:
        last_import = last_import.replace(tzinfo=timezone.utc)
    
    days_since_import = (utcnow() - last_import).days
    
    # Check if it's Monday (weekday() == 0)
    is_monday = utcnow().weekday() == 0

    logger.info(f"Last import: {last_import}, Days since: {days_since_import}")
    if last_data_date:
        logger.info(f"Last data date: {last_data_date}, Days since: {(utcnow().date() - last_data_date).days}")

    # Decision tree (matching backup-check logic for gap detection)
    if days_since_import >= 30:
        # Haven't imported in 30+ days - full audit
        return "monthly", 365
    elif is_monday and days_since_import >= 7:
        # Monday and haven't imported in a week - weekly check
        return "weekly", 30
    elif days_since_import >= 1:
        # Haven't imported today - daily check
        return "daily", 7
    else:
        # Already imported today - quick check for new files
        return "daily", 3


def calculate_status_and_alert(metrics: dict) -> tuple:
    """Calculate status and alert reason based on thresholds.

    CPU alerts use the true daily peak (cpu_peak_max); cpu_peak (average) is kept only for
    display. Disk checks BOTH the root and the data partition. Network alerts trigger on
    interface RX/TX errors — the old %-thresholds never applied to 24h byte totals.
    """
    thresholds = {
        'cpu': {'warning': 80, 'critical': 90},
        'ram': {'warning': 80, 'critical': 90},
        'disk': {'warning': 80, 'critical': 90},
    }

    alerts = []
    status = 'ok'

    def _bump(new):
        nonlocal status
        if new == 'critical':
            status = 'critical'
        elif new == 'warning' and status != 'critical':
            status = 'warning'

    # Check CPU — use the real peak (cpu_peak_max); fall back to average if peak missing
    cpu_val = metrics.get('cpu_peak_max')
    if cpu_val is None:
        cpu_val = metrics.get('cpu_peak', 0) or 0
    if cpu_val >= thresholds['cpu']['critical']:
        alerts.append(f"CPU Critical: {cpu_val:.1f}%"); _bump('critical')
    elif cpu_val >= thresholds['cpu']['warning']:
        alerts.append(f"CPU Warning: {cpu_val:.1f}%"); _bump('warning')

    # Check RAM (peak)
    ram_val = metrics.get('ram_peak', 0) or 0
    if ram_val >= thresholds['ram']['critical']:
        alerts.append(f"RAM Critical: {ram_val:.1f}%"); _bump('critical')
    elif ram_val >= thresholds['ram']['warning']:
        alerts.append(f"RAM Warning: {ram_val:.1f}%"); _bump('warning')

    # Check Disk — root AND data partition (e.g. /usr/local/syb), not just root
    disk_checks = [
        ('/', metrics.get('disk_root_pct', 0) or 0),
        (metrics.get('disk_data_label') or 'data', metrics.get('disk_data_pct', 0) or 0),
    ]
    for label, pct in disk_checks:
        if pct >= thresholds['disk']['critical']:
            alerts.append(f"Disk Critical ({label}): {pct}%"); _bump('critical')
        elif pct >= thresholds['disk']['warning']:
            alerts.append(f"Disk Warning ({label}): {pct}%"); _bump('warning')

    # Check Network — RX/TX errors on any interface (byte totals aren't %-utilization)
    net_err = 0
    for n in (metrics.get('network_interfaces') or []):
        try:
            net_err += int(n.get('total_rx_error', 0) or 0) + int(n.get('total_tx_error', 0) or 0)
        except (ValueError, TypeError):
            pass
    if net_err > 0:
        alerts.append(f"Network Warning: {net_err} RX/TX errors"); _bump('warning')

    return status, '; '.join(alerts) if alerts else None


# ==================== FETCH SAR DATA ====================

import threading

def scan_and_import_sar(operation_id: str, request_data: dict, user_data: dict):
    """Background task to scan and import SAR data with progress tracking"""
    from database import SessionLocal
    from utils.progress_tracker import progress_store

    db = SessionLocal()
    tracker = create_progress_tracker(operation_id)
    ssh = None
    
    try:
        # Connect to Server
        tracker.update(0, 100, "Connecting to server...")
        ssh = SSHConnection(
            host=request_data['hostname'],
            username=request_data['username'],
            password=request_data.get('password'),
            private_key=request_data.get('private_key'),
            port=request_data.get('port', 22)
        )
        
        success, message = ssh.connect()
        if not success:
            tracker.error(f"SSH connection failed: {message}")
            db.close()
            return
        
        tracker.update(10, 100, "Scanning directory for log files...")

        # Use auth_mode from request (root or sudo)
        auth_mode = request_data.get('auth_mode', 'root')
        ssh_username = request_data.get('username', 'root')
        ssh_password = request_data.get('password', '')
        use_sudo = (auth_mode == 'sudo' and ENABLE_SUDO_MODE)

        logger.info(f"Auth mode: {auth_mode}, sudo: {use_sudo}")
        tracker.update(12, 100, f"User mode: {auth_mode.capitalize()}...")

        sar_dir = request_data['sar_dir']

        files_output = None
        err_ls = None

        scan_cmd = f"ls -1 {_sanitize_path(sar_dir)}/"
        raw_output, err_ls, ctx = _exec_remote(ssh, scan_cmd, ssh_username, ssh_password, timeout=30)
        raw_lines = [f for f in (raw_output or '').split('\n') if f.strip()]
        logger.debug(f"scan output: {len(raw_output) if raw_output else 0} chars, {len(raw_lines)} entries")
        if err_ls:
            logger.warning(f"scan stderr: {err_ls[:500]}")

        filtered = [f for f in raw_lines if '_daily-' in f and '.log' in f]
        file_list_full = [f if f.startswith('/') else f"{sar_dir.rstrip('/')}/{f}" for f in filtered]
        logger.info(f"Found {len(file_list_full)} daily log files (of {len(raw_lines)} entries)")

        files_output = "\n".join(file_list_full).strip()

        if not files_output:
            # Surface WHY it failed instead of a generic message: mode, stderr, and a sample
            # of what `ls` actually returned. Distinguishes permission/sudo/binary errors
            # from a genuinely empty dir or a filename that doesn't match _daily-*.log.
            mode = (ctx or {}).get('mode', '?')
            sample = ', '.join(raw_lines[:10]) if raw_lines else '(empty)'
            if err_ls:
                detail = f"stderr: {err_ls.strip()[:300]}"
            elif not raw_lines:
                detail = "directory listing returned nothing (check path/permission; sudo resolves via secure_path)"
            else:
                detail = f"{len(raw_lines)} entries found but none match '_daily-*.log' — sample: {sample}"
            tracker.error(f"No daily log files usable in {request_data['sar_dir']} [mode={mode}] — {detail}")
            logger.warning(
                f"Scan empty host={request_data['hostname']} dir={request_data['sar_dir']} "
                f"mode={mode} raw_entries={len(raw_lines)} stderr={(err_ls or '')[:200]!r} sample={sample!r}"
            )
            ssh.disconnect()
            db.close()
            return

        file_list = [f.strip() for f in files_output.split('\n') if f.strip()]
        total_files_all = len(file_list)
        logger.debug(f"Total files to process: {total_files_all}")
        
        imported_count = 0
        skipped_count = 0
        skipped_old = 0
        backfill_count = 0
        overwritten_count = 0
        network_count = 0
        errors = []

        # One-time correction: when True, existing dates are re-parsed & UPDATED in place
        # (instead of being skipped), without deleting history.
        overwrite = bool(request_data.get('overwrite', False))

        # Determine scan mode and date cutoff
        mode = request_data.get('mode', 'auto')
        if mode == 'auto':
            mode_name, days_to_check = auto_detect_sar_mode(db)
        elif mode == 'daily':
            mode_name, days_to_check = "daily", 7
        elif mode == 'weekly':
            mode_name, days_to_check = "weekly", 30
        elif mode == 'monthly':
            mode_name, days_to_check = "monthly", 365
        else:
            mode_name, days_to_check = "monthly", 365

        cutoff_date = date.today() - timedelta(days=days_to_check)

        logger.info(f"Scan mode: {mode_name}, days: {days_to_check}, cutoff: {cutoff_date}")

        # Filter files by date BEFORE processing
        filtered_files = []
        for file_path in file_list:
            filename = file_path.split('/')[-1]
            parts = filename.replace('.log', '').split('_daily-', 1)

            if len(parts) != 2:
                logger.debug(f"Skipping bad format: {filename}")
                continue

            try:
                target_date = datetime.strptime(parts[0], '%Y%m%d').date()
                if target_date < cutoff_date:
                    skipped_old += 1
                    continue
                filtered_files.append(file_path)
            except Exception as e:
                logger.debug(f"Skipping parse error: {filename} - {e}")
                continue

        total_files = len(filtered_files)
        logger.info(f"Filtered: {total_files} files to process, {skipped_old} skipped (old)")

        if total_files == 0:
            # No new files in date range - provide helpful info
            tracker.complete()
            progress_store[operation_id] = {
                **progress_store.get(operation_id, {}),
                "status": "completed",
                "completed_at": time.time(),
                "result": {
                    "success": True,
                    "summary": {
                        "server": request_data['hostname'],
                        "mode": mode_name,
                        "days_checked": days_to_check,
                        "cutoff_date": cutoff_date.isoformat(),
                        "total_files_found": total_files_all,
                        "files_after_filter": 0,
                        "imported": 0,
                        "skipped_existing": skipped_count,
                        "skipped_old_date": skipped_old,
                        "errors": [
                            f"No files found within date range.",
                            f"Date range: Last {days_to_check} days (since {cutoff_date.isoformat()})",
                            f"Total files in directory: {total_files_all}",
                            f"Files older than cutoff: {skipped_old}",
                            f"Tip: Use 'monthly' mode to import all historical data"
                        ]
                    }
                }
            }
            ssh.disconnect()
            db.close()
            return

        # Extract unique hostnames from filtered files for efficient duplicate check
        hostnames_in_files = set()
        for file_path in filtered_files:
            filename = file_path.split('/')[-1]
            parts = filename.replace('.log', '').split('_daily-', 1)
            if len(parts) == 2:
                hostnames_in_files.add(parts[1].strip())

        # Pre-load existing (hostname, tanggal) pairs ONLY for relevant hostnames
        if hostnames_in_files:
            existing_records = db.query(CapacityMetrics.hostname, CapacityMetrics.tanggal).filter(
                CapacityMetrics.hostname.in_(hostnames_in_files)
            ).all()
            existing_set = {(r.hostname, str(r.tanggal)) for r in existing_records}
            logger.debug(f"Loaded {len(existing_records)} existing records for {len(hostnames_in_files)} hostnames")
        else:
            existing_set = set()

        tracker.update(15, 100, f"Found {total_files} files to import ({skipped_old} skipped, {len(existing_set)} duplicates in DB)")

        logger.info(f"Processing {total_files} files...")

        # Process Each File
        for idx, file_path in enumerate(filtered_files):
            try:
                filename = file_path.split('/')[-1]
                progress_pct = 15 + int((idx / total_files) * 75)
                tracker.update(progress_pct, 100, f"Processing {idx + 1}/{total_files}: {filename}")

                # Extract date from filename
                parts = filename.replace('.log', '').split('_daily-', 1)

                if len(parts) != 2:
                    errors.append(f"Invalid filename format: {filename}")
                    continue

                date_prefix = parts[0]
                server_hostname = parts[1].strip()
                target_date = datetime.strptime(date_prefix, '%Y%m%d').date()

                # Fast duplicate check using pre-loaded set
                # If the record exists but is missing network/IP data, backfill it
                # instead of skipping (allows rescan to fill network data gaps).
                duplicate_key = (server_hostname, str(target_date))
                backfill_record = None
                overwrite_row = None
                if duplicate_key in existing_set:
                    existing_row = db.query(CapacityMetrics).filter(
                        CapacityMetrics.hostname == server_hostname,
                        CapacityMetrics.tanggal == target_date
                    ).first()
                    if overwrite:
                        # Force re-parse: update ALL metrics of the existing record in place.
                        overwrite_row = existing_row
                        logger.info(f"Overwrite (re-parse) {server_hostname} {target_date}")
                    else:
                        net_count = db.query(NetworkInterface).filter(
                            NetworkInterface.hostname == server_hostname,
                            NetworkInterface.tanggal == target_date
                        ).count()
                        missing_net = net_count == 0
                        missing_eth = not (existing_row and existing_row.ethernet_interfaces)
                        missing_uptime = not ((existing_row and existing_row.system_info) or {}).get('uptime')
                        if not (missing_net or missing_eth or missing_uptime):
                            skipped_count += 1
                            continue
                        backfill_record = existing_row
                        logger.info(f"Backfilling server data for {server_hostname} {target_date} (net_rows={net_count}, eth={not missing_eth}, uptime={not missing_uptime})")

                if backfill_record is not None:
                    # Backfill mode: only fill in the missing network/IP data
                    read_cmd = f"cat {_sanitize_path(file_path)}"
                    content, err_cat, ctx_file = _exec_remote(ssh, read_cmd, ssh_username, ssh_password, timeout=30)

                    if not content:
                        err_msg = f"Failed to read {filename}"
                        if ctx_file.get('sudo_failed') and 'SUDO_FAIL' in str(err_cat):
                            err_msg += f" [SUDO FAIL: {err_cat[:200]}]"
                            logger.warning(f"Sudo execution failed for {filename}")
                        errors.append(err_msg)
                        continue

                    # Parse to get network/IP data
                    metrics = parse_sar_log(content, server_hostname, request_data['hostname'], target_date)
                    
                    if missing_eth and metrics.get('ethernet_interfaces'):
                        backfill_record.ethernet_interfaces = metrics['ethernet_interfaces']
                    if metrics.get('server_date'):
                        backfill_record.server_date = metrics['server_date']
                    if metrics.get('public_ip'):
                        backfill_record.public_ip = metrics['public_ip']
                    if metrics.get('system_info'):
                        merged_si = {**(backfill_record.system_info or {}), **metrics['system_info']}
                        backfill_record.system_info = merged_si or None
                    
                    record = backfill_record
                    net_rows = metrics.get('network_interfaces', [])
                    if net_rows:
                        record.net_rx_peak = max(_parse_size_mb(n['total_rx']) for n in net_rows)
                        record.net_tx_peak = max(_parse_size_mb(n['total_tx']) for n in net_rows)
                    else:
                        record.net_rx_peak = 0
                        record.net_tx_peak = 0
                    backfill_count += 1
                    db.add(record)
                else:
                    read_cmd = f"cat {_sanitize_path(file_path)}"
                    content, err_cat, ctx_file = _exec_remote(ssh, read_cmd, ssh_username, ssh_password, timeout=30)

                    if not content:
                        err_msg = f"Failed to read {filename}"
                        if ctx_file.get('sudo_failed') and 'SUDO_FAIL' in str(err_cat):
                            err_msg += f" [SUDO FAIL: {err_cat[:200]}]"
                            logger.warning(f"Sudo execution failed for {filename}")
                        errors.append(err_msg)
                        continue

                    # Parse & Save
                    metrics = parse_sar_log(content, server_hostname, request_data['hostname'], target_date)
                    status, alert_reason = calculate_status_and_alert(metrics)

                    fields = dict(
                        ip_address=request_data['hostname'],
                        source='sar_ssh',
                        cpu_user_avg=metrics.get('cpu_user_avg', 0),
                        cpu_system_avg=metrics.get('cpu_system_avg', 0),
                        cpu_iowait_avg=metrics.get('cpu_iowait_avg', 0),
                        cpu_idle_avg=metrics.get('cpu_idle_avg', 0),
                        cpu_peak=metrics.get('cpu_peak', 0),
                        cpu_peak_time=metrics.get('cpu_peak_time'),
                        cpu_peak_max=metrics.get('cpu_peak_max'),
                        ram_avg=metrics.get('ram_avg', 0),
                        ram_peak=metrics.get('ram_peak', 0),
                        ram_peak_time=metrics.get('ram_peak_time'),
                        ram_peak_max=metrics.get('ram_peak_max'),
                        kbmemfree_avg=metrics.get('kbmemfree_avg', 0),
                        kbcommit_avg=metrics.get('kbcommit_avg', 0),
                        disk_root_pct=metrics.get('disk_root_pct', 0),
                        disk_data_pct=metrics.get('disk_data_pct', 0),
                        disk_data_label=metrics.get('disk_data_label', '/Backup'),
                        net_rx_peak=metrics.get('net_rx_peak', 0),
                        net_tx_peak=metrics.get('net_tx_peak', 0),
                        net_conn=metrics.get('net_conn', 0),
                        status=status,
                        alert_reason=alert_reason,
                        peak_description=metrics.get('peak_description'),
                        parsed_at=utcnow(),
                        log_file=filename,
                        ethernet_interfaces=metrics.get('ethernet_interfaces') or None,
                        system_info=metrics.get('system_info') or None,
                        server_date=metrics.get('server_date'),
                        public_ip=metrics.get('public_ip'),
                    )
                    if overwrite_row is not None:
                        # Overwrite mode: update all metrics of the existing record in place
                        # (keep original created_by).
                        for _k, _v in fields.items():
                            setattr(overwrite_row, _k, _v)
                        record = overwrite_row
                        overwritten_count += 1
                    else:
                        record = CapacityMetrics(
                            tanggal=target_date,
                            hostname=server_hostname,
                            created_by=user_data.get('username', 'system'),
                            **fields,
                        )
                        db.add(record)
                        imported_count += 1

                    # Save ALL disk partitions
                    for part in metrics.get('partitions', []):
                        existing_part = db.query(DiskPartition).filter(
                            DiskPartition.tanggal == target_date,
                            DiskPartition.hostname == server_hostname,
                            DiskPartition.mount_point == part['mount_point']
                        ).first()

                        if existing_part:
                            existing_part.use_pct = part['use_pct']
                            existing_part.filesystem = part['filesystem']
                            existing_part.size = part['size']
                            existing_part.used = part['used']
                            existing_part.avail = part['avail']
                        else:
                            new_part = DiskPartition(
                                hostname=server_hostname,
                                tanggal=target_date,
                                mount_point=part['mount_point'],
                                filesystem=part['filesystem'],
                                size=part['size'],
                                used=part['used'],
                                avail=part['avail'],
                                use_pct=part['use_pct'],
                                source='sar_ssh'
                            )
                            db.add(new_part)

                # Save network interfaces (upsert per interface)
                net_rows = metrics.get('network_interfaces', [])
                for net in net_rows:
                    existing_net = db.query(NetworkInterface).filter(
                        NetworkInterface.hostname == server_hostname,
                        NetworkInterface.tanggal == target_date,
                        NetworkInterface.interface_name == net['interface_name']
                    ).first()
                    if existing_net:
                        existing_net.speed = net['speed']
                        existing_net.total_rx = net['total_rx']
                        existing_net.total_tx = net['total_tx']
                        existing_net.total_rx_error = net['total_rx_error']
                        existing_net.total_tx_error = net['total_tx_error']
                        existing_net.total_packet_drop = net['total_packet_drop']
                        existing_net.internet_status = net['internet_status']
                        existing_net.capacity_metric_id = record.id
                    else:
                        db.add(NetworkInterface(
                            hostname=server_hostname,
                            tanggal=target_date,
                            interface_name=net['interface_name'],
                            speed=net['speed'],
                            total_rx=net['total_rx'],
                            total_tx=net['total_tx'],
                            total_rx_error=net['total_rx_error'],
                            total_tx_error=net['total_tx_error'],
                            total_packet_drop=net['total_packet_drop'],
                            internet_status=net['internet_status'],
                            capacity_metric_id=record.id
                        ))
                    network_count += 1

            except Exception as e:
                logger.error(f"Error processing {filename}: {e}")
                errors.append(f"Error processing {filename}: {str(e)}")

        # Commit all changes
        logger.info(f"Committing {imported_count} records to DB...")
        db.commit()

        # Mark as complete and store results
        tracker.update(95, 100, "Saving results...")
        tracker.complete()
        
        # Store results in progress tracker
        progress_store[operation_id] = {
            **progress_store.get(operation_id, {}),
            "status": "completed",
            "completed_at": time.time(),
            "result": {
                "success": True,
                "summary": {
                    "server": request_data['hostname'],
                    "mode": mode_name,
                    "days_checked": days_to_check,
                    "cutoff_date": cutoff_date.isoformat(),
                    "total_files_found": total_files_all,
                    "files_after_filter": total_files,
                    "imported": imported_count,
                    "overwritten": overwritten_count,
                    "backfilled_network": backfill_count,
                    "network_interfaces_saved": network_count,
                    "skipped_existing": skipped_count,
                    "skipped_old_date": skipped_old,
                    "errors": errors
                }
            }
        }
        
    except Exception as e:
        tracker.error(f"Failed to scan SAR data: {str(e)}")
    finally:
        if ssh:
            ssh.disconnect()
        db.close()


@router.post("/fetch", response_model=dict)
async def fetch_sar_data(
    request: FetchSARRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Start SAR scan with progress tracking.
    Returns operation_id immediately, client polls for progress.
    """
    import uuid
    
    operation_id = str(uuid.uuid4())
    
    # Prepare request data
    request_data = {
        'hostname': request.hostname,
        'username': request.username,
        'password': request.password,
        'private_key': request.private_key,
        'port': request.port,
        'sar_dir': request.sar_dir,
        'mode': request.mode,
        'auth_mode': request.auth_mode,
        'overwrite': request.overwrite,
    }

    user_data = {'username': current_user.username}
    
    # Start background task
    thread = threading.Thread(
        target=scan_and_import_sar,
        args=(operation_id, request_data, user_data),
        daemon=True
    )
    thread.start()
    
    log_activity(db, current_user.id, "CREATE", "capacity", f"Initiated SAR scan for {request.hostname}")
    
    return {
        "operation_id": operation_id,
        "status": "started",
        "message": "Scan started. Poll /progress/{operation_id} for updates."
    }


# ==================== READ (LIST) ====================

@router.get("/progress/{operation_id}", response_model=dict)
async def get_scan_progress(
    operation_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get progress of SAR scan operation"""
    progress = get_progress(operation_id)
    return progress


@router.post("/scan-all", response_model=dict)
async def batch_scan_all_servers(
    request: BatchScanRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Parallel bulk scan — process multiple servers concurrently.
    Returns immediately with operation_id, client polls /progress/{operation_id}.
    """
    import uuid
    from concurrent.futures import ThreadPoolExecutor, as_completed

    operation_id = f"batch-{uuid.uuid4()}"

    user_data = {'username': current_user.username}
    server_list = [s.strip() for s in request.servers if s.strip()]

    if not server_list:
        raise HTTPException(status_code=400, detail="No servers provided")

    log_activity(db, current_user.id, "CREATE", "capacity", f"Bulk scan initiated for {len(server_list)} servers")

    # Initialise batch progress tracker
    from utils.progress_tracker import progress_store
    progress_store[operation_id] = {
        "operation_id": operation_id,
        "status": "running",
        "total": len(server_list),
        "completed": 0,
        "failed": 0,
        "current": server_list[0] if server_list else "",
        "errors": [],
        "results": {},  # hostname -> success/fail
        "started_at": utcnow().isoformat(),
        "started_by": current_user.username,
    }

    def _scan_single_server(hostname: str) -> dict:
        """Scan a single server and return result"""
        from database import SessionLocal
        try:
            request_data = {
                'hostname': hostname,
                'username': request.username,
                'private_key': request.private_key,
                'password': request.password,
                'port': request.port,
                'sar_dir': request.sar_dir,
                'mode': 'auto',
                'auth_mode': request.auth_mode,
                'overwrite': request.overwrite,
            }
            single_op_id = f"{operation_id}-{hostname}"
            scan_and_import_sar(single_op_id, request_data, user_data)
            return {"hostname": hostname, "success": True}
        except Exception as exc:
            return {"hostname": hostname, "success": False, "error": str(exc)}

    # Run ALL servers in parallel via thread pool
    def _run_batch():
        with ThreadPoolExecutor(max_workers=request.max_workers) as pool:
            futures = {pool.submit(_scan_single_server, h): h for h in server_list}
            for future in as_completed(futures):
                result = future.result()
                hostname = result["hostname"]
                success = result["success"]

                tracker = progress_store.get(operation_id)
                if tracker:
                    if success:
                        tracker["completed"] = tracker.get("completed", 0) + 1
                    else:
                        tracker["failed"] = tracker.get("failed", 0) + 1
                        tracker["errors"].append(f"{hostname}: {result.get('error', 'unknown')}")

                    tracker["results"][hostname] = "success" if success else "failed"
                    tracker["current"] = hostname

                    # Check if all done
                    if tracker["completed"] + tracker["failed"] >= tracker["total"]:
                        tracker["status"] = "completed"
                        tracker["completed_at"] = utcnow().isoformat()

    # Start batch scan in daemon thread
    batch_thread = threading.Thread(target=_run_batch, daemon=True)
    batch_thread.start()

    return {
        "operation_id": operation_id,
        "status": "started",
        "total_servers": len(server_list),
        "max_workers": request.max_workers,
        "message": f"Parallel scan started for {len(server_list)} servers. Poll /progress/{operation_id} for updates.",
    }


@router.get("/scan-mode", response_model=dict)
async def get_scan_mode(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get auto-detected scan mode based on last scan time.
    Helps frontend show what mode will be used.
    """
    from sqlalchemy import desc
    
    mode_name, days_to_check = auto_detect_sar_mode(db)

    # Get latest REAL data date for display (exclude no_file)
    last_record = db.query(CapacityMetrics).filter(
        CapacityMetrics.status != 'no_file'
    ).order_by(
        desc(CapacityMetrics.tanggal)
    ).first()

    mode_descriptions = {
        "daily": "Last 7 days",
        "weekly": "Last 30 days",
        "monthly": "All files (365 days)"
    }
    
    last_scan_date = None
    if last_record and last_record.tanggal:
        try:
            last_scan_date = last_record.tanggal.isoformat()
        except (ValueError, AttributeError):
            last_scan_date = str(last_record.tanggal)

    return {
        "mode": mode_name,
        "days_to_check": days_to_check,
        "last_scan_date": last_scan_date,
        "description": mode_descriptions.get(mode_name, "Unknown")
    }


@router.get("/servers", response_model=dict)
async def get_all_servers(
    status_filter: Optional[str] = Query(None, description="Filter by status: ok | warning | critical"),
    search: Optional[str] = Query(None, description="Search hostname"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get list of all servers with latest metrics"""
    
    # Subquery to get latest date per server
    latest_dates = db.query(
        CapacityMetrics.hostname,
        func.max(CapacityMetrics.tanggal).label('latest_date')
    ).group_by(CapacityMetrics.hostname).subquery()
    
    # Get latest metrics for each server
    query = db.query(CapacityMetrics).join(
        latest_dates,
        (CapacityMetrics.hostname == latest_dates.c.hostname) &
        (CapacityMetrics.tanggal == latest_dates.c.latest_date)
    )
    
    # Apply filters
    if status_filter:
        query = query.filter(CapacityMetrics.status == status_filter)
    if search:
        escaped_search = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        query = query.filter(CapacityMetrics.hostname.ilike(f"%{escaped_search}%", escape="\\"))
    
    # Get total count
    total = query.count()
    
    # Get paginated results
    servers = query.offset((page - 1) * page_size).limit(page_size).all()
    
    # Get network data for each server on their latest date
    network_data = {}
    for server in servers:
        net_records = db.query(NetworkInterface).filter(
            NetworkInterface.hostname == server.hostname,
            NetworkInterface.tanggal == server.tanggal
        ).all()
        
        if net_records:
            # Aggregate network data
            total_rx = sum(_parse_size_mb(net.total_rx) for net in net_records)
            total_tx = sum(_parse_size_mb(net.total_tx) for net in net_records)
            total_drop = sum(net.total_packet_drop or 0 for net in net_records)
            
            # Check internet status (if any interface has internet, mark as connected)
            internet_status = 'TERHUBUNG' if any(net.internet_status == 'TERHUBUNG' for net in net_records) else 'TIDAK TERHUBUNG'
            
            # Build detailed network interfaces list
            eth_lookup = {}
            if server.ethernet_interfaces:
                try:
                    for entry in server.ethernet_interfaces:
                        name = entry.get('interface_name')
                        if name:
                            eth_lookup[name] = entry
                except Exception:
                    eth_lookup = {}
            
            network_interfaces = [{
                'interface_name': net.interface_name,
                'speed': net.speed or '-',
                'total_rx': net.total_rx or '0 MB',
                'total_tx': net.total_tx or '0 MB',
                'total_packet_drop': net.total_packet_drop or 0,
                'internet_status': net.internet_status or 'TIDAK TERHUBUNG',
                'ip_address': (eth_lookup.get(net.interface_name, {}) or {}).get('ip_address') or '-',
                'mac_address': (eth_lookup.get(net.interface_name, {}) or {}).get('mac_address') or '-'
            } for net in net_records]
            
            network_data[server.hostname] = {
                'net_rx_total': f"{total_rx:.2f} MB",
                'net_tx_total': f"{total_tx:.2f} MB",
                'packet_drop_total': total_drop,
                'internet_status': internet_status,
                'network_interfaces': network_interfaces
            }
        else:
            network_data[server.hostname] = {
                'net_rx_total': '0 MB',
                'net_tx_total': '0 MB',
                'packet_drop_total': 0,
                'internet_status': 'TIDAK TERHUBUNG',
                'network_interfaces': []
            }
    
    # Build response with network data
    data = []
    for server in servers:
        server_dict = _capacity_to_dict(server)
        if server.hostname in network_data:
            server_dict.update(network_data[server.hostname])
        data.append(server_dict)
    
    return {
        "data": data,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size
        }
    }


@router.get("/servers/{hostname}", response_model=dict)
async def get_server_detail(
    hostname: str,
    days: int = Query(30, ge=1, le=365, description="Number of days of history"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get detailed metrics for a specific server"""
    
    # Get history for the last N days
    start_date = date.today() - timedelta(days=days)
    
    history = db.query(CapacityMetrics).filter(
        CapacityMetrics.hostname == hostname,
        CapacityMetrics.tanggal >= start_date
    ).order_by(CapacityMetrics.tanggal.desc()).all()
    
    if not history:
        raise HTTPException(status_code=404, detail=f"No data found for server {hostname}")
    
    # Calculate averages
    avg_cpu = sum(h.cpu_peak for h in history) / len(history) if history else 0
    avg_ram = sum(h.ram_peak for h in history) / len(history) if history else 0
    avg_disk = sum(h.disk_root_pct for h in history) / len(history) if history else 0
    
    # Get latest
    latest = history[0]
    
    return {
        "hostname": hostname,
        "latest": _capacity_to_dict(latest),
        "history": [_capacity_to_dict(h) for h in history],
        "summary": {
            "avg_cpu": round(avg_cpu, 2),
            "avg_ram": round(avg_ram, 2),
            "avg_disk": round(avg_disk, 2),
            "peak_cpu": max(h.cpu_peak for h in history) if history else 0,
            "peak_ram": max(h.ram_peak for h in history) if history else 0,
            "peak_disk": max(h.disk_root_pct for h in history) if history else 0,
            "days_of_data": len(history)
        }
    }


# Effective SLA monitoring baseline — the new SAR script (with SERVER INFO /
# Uptime) was deployed on this date. Months ending before it get NO SLA verdict.
SLA_MONITORING_START = date(2026, 8, 10)

def compute_month_sla(dates, year, month, today=None):
    """Professional SLA coverage for one (server, month).

    Denominator = pro-rated monitored window:
      window_start = max(month start, earliest date of data)
      window_end   = min(month end, report end / today)
    For the current (running) month only complete days are counted
    (end of yesterday) so a healthy server is not flagged while today's
    scan has not run yet.
    Coverage = days of data / window length. Days without data are reported
    separately (days_no_data), not counted as confirmed downtime.
    Months before the effective monitoring start (SAR script deploy) are
    excluded — no SLA verdict is produced for them.
    Returns dict or None when the monitored window is empty / pre-baseline.
    """
    ref_date = today or date.today()
    if dates and not isinstance(next(iter(dates)), date):
        dates = [datetime.strptime(str(d), "%Y-%m-%d").date() for d in dates]
    month_start = date(year, month, 1)
    month_end = date(year, month, calendar.monthrange(year, month)[1])
    if month_end < SLA_MONITORING_START:
        return None
    last_complete = ref_date
    if ref_date == date.today() and month_end >= date.today():
        last_complete = ref_date - timedelta(days=1)
    window_end = min(month_end, last_complete)
    window_start = max(month_start, min(dates)) if dates else month_start
    window_start = max(window_start, SLA_MONITORING_START)
    days_monitored = (window_end - window_start).days + 1
    if days_monitored <= 0:
        return None
    in_window = [d for d in dates if window_start <= d <= window_end]
    days_of_data = len(in_window)
    if days_of_data == 0:
        # No official-scan data yet since monitoring started (10-08-2026).
        # This is not a downtime signal — keep a neutral Aman verdict.
        return {
            "days_in_month": (month_end - month_start).days + 1,
            "days_monitored": days_monitored,
            "days_of_data": 0,
            "days_no_data": 0,
            "days_down": 0,
            "coverage_pct": None,
            "status": "OK",
        }
    coverage = round(min(days_of_data, days_monitored) / days_monitored * 100, 2)
    return {
        "days_in_month": (month_end - month_start).days + 1,
        "days_monitored": days_monitored,
        "days_of_data": days_of_data,
        "days_no_data": max(0, days_monitored - days_of_data),
        "days_down": max(0, days_monitored - days_of_data),
        "coverage_pct": coverage,
        "status": 'OK' if coverage >= 99 else ('WARNING' if coverage >= 95 else 'KRITIS'),
    }


@router.get("/servers/{hostname}/interfaces", response_model=dict)
async def get_server_interfaces(
    hostname: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get server info and network interfaces"""
    
    # Get latest capacity metrics for server info
    latest_metric = db.query(CapacityMetrics).filter(
        CapacityMetrics.hostname == hostname
    ).order_by(CapacityMetrics.tanggal.desc()).first()
    
    if not latest_metric:
        raise HTTPException(status_code=404, detail=f"No data found for server {hostname}")
    
    # Get latest date for interfaces
    latest_date = db.query(func.max(NetworkInterface.tanggal)).filter(
        NetworkInterface.hostname == hostname
    ).scalar()
    
    # Get interfaces for latest date
    interfaces = []
    if latest_date:
        net_records = db.query(NetworkInterface).filter(
            NetworkInterface.hostname == hostname,
            NetworkInterface.tanggal == latest_date
        ).all()
        
        # Build IP/MAC lookup from capacity_metrics.ethernet_interfaces (JSON) on latest metric
        eth_lookup = {}
        if latest_metric and latest_metric.ethernet_interfaces:
            try:
                for entry in latest_metric.ethernet_interfaces:
                    name = entry.get('interface_name')
                    if name:
                        eth_lookup[name] = entry
            except Exception:
                eth_lookup = {}

        # If latest metric has no ethernet_interfaces, try the metric matching the interface date
        if not eth_lookup:
            eth_metric = db.query(CapacityMetrics).filter(
                CapacityMetrics.hostname == hostname,
                CapacityMetrics.tanggal == latest_date,
                CapacityMetrics.ethernet_interfaces.isnot(None)
            ).order_by(CapacityMetrics.tanggal.desc()).first()
            if eth_metric and eth_metric.ethernet_interfaces:
                try:
                    for entry in eth_metric.ethernet_interfaces:
                        name = entry.get('interface_name')
                        if name:
                            eth_lookup[name] = entry
                except Exception:
                    eth_lookup = {}

        interfaces = [{
            "interface_name": net.interface_name,
            "speed": net.speed or "-",
            "total_rx": net.total_rx or "0",
            "total_tx": net.total_tx or "0",
            "total_packet_drop": net.total_packet_drop or 0,
            "internet_status": net.internet_status or "TIDAK TERHUBUNG",
            "ip_address": (eth_lookup.get(net.interface_name, {}) or {}).get('ip_address') or "-",
            "mac_address": (eth_lookup.get(net.interface_name, {}) or {}).get('mac_address') or "-"
        } for net in net_records]
    
    si = latest_metric.system_info or {}

    today = date.today()
    month_start = today.replace(day=1)
    dates = [r for (r,) in db.query(CapacityMetrics.tanggal).filter(
        CapacityMetrics.hostname == hostname,
        CapacityMetrics.tanggal >= month_start
    ).all()]
    sla = compute_month_sla(dates, today.year, today.month, today)
    sla = sla or {
        "days_in_month": calendar.monthrange(today.year, today.month)[1],
        "days_monitored": 0,
        "days_of_data": 0,
        "days_no_data": 0,
        "days_down": 0,
        "coverage_pct": None,
        "status": "OK",
    }

    return {
        "hostname": hostname,
        "latest_date": latest_date.isoformat() if latest_date else None,
        "interfaces": interfaces,
        "server_info": {
            "hostname": hostname,
            "ip_address": latest_metric.ip_address or "-",
            "server_date": latest_metric.server_date or "-",
            "public_ip": latest_metric.public_ip or "-",
            "os": si.get("os") or latest_metric.source or "-",
            "cpu": si.get("cpu") or "-",
            "ram": si.get("ram") or "-",
            "system": si.get("system") or "-",
            "serial": si.get("serial") or "-",
            "hypervisor": si.get("hypervisor") or "-",
            "uptime": si.get("uptime") or "-"
        },
        "sla": dict(sla, month=today.strftime("%Y-%m"))
    }


# ==================== DASHBOARD STATS ====================

@router.get("/dashboard/stats", response_model=dict)
async def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get dashboard summary statistics"""
    
    # Get latest date
    latest_date = db.query(func.max(CapacityMetrics.tanggal)).scalar()
    
    if not latest_date:
        return {
            "total_servers": 0,
            "ok_count": 0,
            "warning_count": 0,
            "critical_count": 0,
            "last_updated": None
        }
    
    # Get latest metrics per server
    latest_dates = db.query(
        CapacityMetrics.hostname,
        func.max(CapacityMetrics.tanggal).label('latest_date')
    ).group_by(CapacityMetrics.hostname).subquery()
    
    latest_metrics = db.query(CapacityMetrics).join(
        latest_dates,
        (CapacityMetrics.hostname == latest_dates.c.hostname) &
        (CapacityMetrics.tanggal == latest_dates.c.latest_date)
    ).all()
    
    # Count by status
    ok_count = sum(1 for m in latest_metrics if m.status == 'ok')
    warning_count = sum(1 for m in latest_metrics if m.status == 'warning')
    critical_count = sum(1 for m in latest_metrics if m.status == 'critical')
    
    return {
        "total_servers": len(latest_metrics),
        "ok_count": ok_count,
        "warning_count": warning_count,
        "critical_count": critical_count,
        "last_updated": str(latest_date) if latest_date else None
    }


# ==================== DELETE ====================

@router.delete("/servers/{hostname}", response_model=dict)
async def delete_server_data(
    hostname: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete all data for a specific server. Admin only."""
    if current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Admin access required")

    deleted = db.query(CapacityMetrics).filter(
        CapacityMetrics.hostname == hostname
    ).delete(synchronize_session='fetch')
    
    db.commit()

    log_activity(db, current_user.id, "DELETE", "capacity", f"Deleted {deleted} records for server {hostname}")

    return {
        "status": "success",
        "message": f"Deleted {deleted} records for server {hostname}",
        "deleted_count": deleted
    }


# ==================== SERVER DETAIL (DAILY HISTORY) ====================

@router.get("/servers/{hostname}/history", response_model=dict)
async def get_server_history(
    hostname: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get daily capacity history for a specific server"""
    
    # Get total count
    total = db.query(CapacityMetrics).filter(
        CapacityMetrics.hostname == hostname
    ).count()
    
    if total == 0:
        raise HTTPException(status_code=404, detail=f"No data found for server {hostname}")
    
    # Get paginated history (order by date descending)
    history = db.query(CapacityMetrics).filter(
        CapacityMetrics.hostname == hostname
    ).order_by(
        CapacityMetrics.tanggal.desc()
    ).offset((page - 1) * page_size).limit(page_size).all()
    
    # Calculate pagination
    total_pages = (total + page_size - 1) // page_size

    # Aggregate network data per date for these records
    dates = [m.tanggal for m in history]
    net_by_date = {}
    if dates:
        net_records = db.query(NetworkInterface).filter(
            NetworkInterface.hostname == hostname,
            NetworkInterface.tanggal.in_(dates)
        ).all()
        for net in net_records:
            key = str(net.tanggal)
            if key not in net_by_date:
                net_by_date[key] = {'rx': 0.0, 'tx': 0.0, 'drop': 0, 'internet': 'TIDAK TERHUBUNG', 'interfaces': []}
            entry = net_by_date[key]
            entry['rx'] += _parse_size_mb(net.total_rx)
            entry['tx'] += _parse_size_mb(net.total_tx)
            entry['drop'] += net.total_packet_drop or 0
            if net.internet_status == 'TERHUBUNG':
                entry['internet'] = 'TERHUBUNG'
            entry['interfaces'].append(net)

    # Build ethernet_interfaces lookup per date
    eth_by_date = {}
    for m in history:
        key = str(m.tanggal)
        if key not in eth_by_date and m.ethernet_interfaces:
            eth_by_date[key] = {}
            try:
                for entry in m.ethernet_interfaces:
                    name = entry.get('interface_name')
                    if name:
                        eth_by_date[key][name] = entry
            except Exception:
                pass

    return {
        "hostname": hostname,
        "total_records": total,
        "data": [
            {
                "tanggal": str(m.tanggal),
                "status": m.status,
                "alert_reason": m.alert_reason,
                "cpu_peak": m.cpu_peak,
                "cpu_peak_time": m.cpu_peak_time,
                "cpu_peak_max": m.cpu_peak_max,
                "cpu_user_avg": m.cpu_user_avg,
                "cpu_system_avg": m.cpu_system_avg,
                "cpu_iowait_avg": m.cpu_iowait_avg,
                "ram_peak": m.ram_peak,
                "ram_peak_time": m.ram_peak_time,
                "ram_peak_max": m.ram_peak_max,
                "ram_avg": m.ram_avg,
                "disk_root_pct": m.disk_root_pct,
                "disk_data_pct": m.disk_data_pct,
                "disk_data_label": m.disk_data_label,
                "net_rx_peak": m.net_rx_peak,
                "net_tx_peak": m.net_tx_peak,
                "net_rx_total": f"{net_by_date[str(m.tanggal)]['rx']:.2f} MB" if str(m.tanggal) in net_by_date and net_by_date[str(m.tanggal)]['rx'] > 0 else '0 MB',
                "net_tx_total": f"{net_by_date[str(m.tanggal)]['tx']:.2f} MB" if str(m.tanggal) in net_by_date and net_by_date[str(m.tanggal)]['tx'] > 0 else '0 MB',
                "packet_drop_total": net_by_date[str(m.tanggal)]['drop'] if str(m.tanggal) in net_by_date else 0,
                "internet_status": net_by_date[str(m.tanggal)]['internet'] if str(m.tanggal) in net_by_date else 'TIDAK TERHUBUNG',
                "disk_usr_local_syb_pct": m.disk_usr_local_syb_pct if m.disk_usr_local_syb_pct is not None else (m.disk_data_pct if (m.disk_data_label or '') == '/usr/local/syb' else None),
                "network_interfaces": [
                    {
                        'interface_name': net.interface_name,
                        'speed': net.speed or '-',
                        'total_rx': net.total_rx or '0 MB',
                        'total_tx': net.total_tx or '0 MB',
                        'total_packet_drop': net.total_packet_drop or 0,
                        'internet_status': net.internet_status or 'TIDAK TERHUBUNG',
                        'ip_address': (eth_by_date.get(str(m.tanggal), {}).get(net.interface_name, {}) or {}).get('ip_address') or '-',
                        'mac_address': (eth_by_date.get(str(m.tanggal), {}).get(net.interface_name, {}) or {}).get('mac_address') or '-'
                    }
                    for net in (net_by_date[str(m.tanggal)]['interfaces'] if str(m.tanggal) in net_by_date else [])
                ],
                "peak_description": m.peak_description,
                "created_by": m.created_by,
                "log_file": m.log_file
            }
            for m in history
        ],
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total_records": total,
            "total_pages": total_pages,
            "has_next": page < total_pages,
            "has_prev": page > 1
        }
    }


# ==================== DISK PARTITIONS ====================

@router.get("/servers/{hostname}/partitions", response_model=dict)
async def get_server_partitions(
    hostname: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all unique partitions for a server"""
    
    # Get unique mount points
    unique_mounts = db.query(DiskPartition.mount_point).filter(
        DiskPartition.hostname == hostname
    ).distinct().all()
    
    mount_points = [m[0] for m in unique_mounts]
    
    # Get latest data for each partition
    latest_partitions = []
    for mount in mount_points:
        latest = db.query(DiskPartition).filter(
            DiskPartition.hostname == hostname,
            DiskPartition.mount_point == mount
        ).order_by(DiskPartition.tanggal.desc()).first()
        
        if latest:
            latest_partitions.append({
                'mount_point': latest.mount_point,
                'filesystem': latest.filesystem,
                'size': latest.size,
                'used': latest.used,
                'avail': latest.avail,
                'current_use_pct': latest.use_pct,
                'tanggal': str(latest.tanggal)
            })
    
    return {
        "hostname": hostname,
        "partitions": latest_partitions,
        "total_partitions": len(mount_points)
    }


@router.get("/servers/{hostname}/partitions/{mount_point}/history", response_model=dict)
async def get_partition_history(
    hostname: str,
    mount_point: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get disk usage history for a specific partition"""
    
    # URL decode mount point (in case it has special chars)
    import urllib.parse
    mount_point = urllib.parse.unquote(mount_point)
    
    total = db.query(DiskPartition).filter(
        DiskPartition.hostname == hostname,
        DiskPartition.mount_point == mount_point
    ).count()
    
    if total == 0:
        raise HTTPException(status_code=404, detail=f"Partition {mount_point} not found for {hostname}")
    
    history = db.query(DiskPartition).filter(
        DiskPartition.hostname == hostname,
        DiskPartition.mount_point == mount_point
    ).order_by(DiskPartition.tanggal.desc()).offset((page - 1) * page_size).limit(page_size).all()
    
    total_pages = (total + page_size - 1) // page_size
    
    return {
        "hostname": hostname,
        "mount_point": mount_point,
        "total_records": total,
        "data": [
            {
                "tanggal": str(h.tanggal),
                "filesystem": h.filesystem,
                "size": h.size,
                "used": h.used,
                "avail": h.avail,
                "use_pct": h.use_pct,
            }
            for h in history
        ],
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total_records": total,
            "total_pages": total_pages,
            "has_next": page < total_pages,
            "has_prev": page > 1
        }
    }


@router.get("/servers/{hostname}/partitions/summary", response_model=dict)
async def get_partitions_summary(
    hostname: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get summary of all partitions with statistics for projection"""
    
    unique_mounts = db.query(DiskPartition.mount_point).filter(
        DiskPartition.hostname == hostname
    ).distinct().all()
    
    summary = []
    for mount_tuple in unique_mounts:
        mount = mount_tuple[0]
        
        # Get all historical data
        all_data = db.query(DiskPartition).filter(
            DiskPartition.hostname == hostname,
            DiskPartition.mount_point == mount
        ).order_by(DiskPartition.tanggal.asc()).all()
        
        if not all_data:
            continue
        
        use_pcts = [d.use_pct for d in all_data if d.use_pct is not None]
        sizes = [d.size for d in all_data if d.size]
        
        summary.append({
            "mount_point": mount,
            "filesystem": all_data[0].filesystem,
            "size": all_data[-1].size if all_data[-1].size else sizes[0] if sizes else "N/A",
            "current_use_pct": all_data[-1].use_pct if all_data[-1].use_pct else 0,
            "min_pct": min(use_pcts) if use_pcts else 0,
            "max_pct": max(use_pcts) if use_pcts else 0,
            "avg_pct": sum(use_pcts) / len(use_pcts) if use_pcts else 0,
            "data_points": len(all_data),
            "first_date": str(all_data[0].tanggal),
            "last_date": str(all_data[-1].tanggal)
        })
    
    return {
        "hostname": hostname,
        "partitions": summary,
        "total_partitions": len(summary)
    }


# ==================== CAPACITY PROJECTION ====================
# All projection logic is now centralized in calculate_projection()
# with support for custom thresholds and metric types.

@router.get("/servers/{hostname}/projection", response_model=dict)
async def get_capacity_projection(
    hostname: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get capacity projection with linear regression.
    Predicts when disk/CPU/RAM will reach critical thresholds.

    Uses calculate_projection() from capacity_projection.py — no
    duplicated urgency/threshold logic here.
    """

    unique_mounts = db.query(DiskPartition.mount_point).filter(
        DiskPartition.hostname == hostname
    ).distinct().all()

    projections = []

    def _add_projection(proj, data_list):
        """Helper: enrich projection with data_range and append"""
        if data_list and len(data_list) >= 2:
            proj["data_range"] = {
                "first_date": str(data_list[0].tanggal),
                "last_date": str(data_list[-1].tanggal),
                "total_days": (data_list[-1].tanggal - data_list[0].tanggal).days,
            }
        projections.append(proj)

    # ── Fallback: no DiskPartition data, use CapacityMetrics ─────────
    if not unique_mounts:
        metrics_data = db.query(CapacityMetrics).filter(
            CapacityMetrics.hostname == hostname
        ).order_by(CapacityMetrics.tanggal.asc()).all()

        if len(metrics_data) < 2:
            return {
                "hostname": hostname,
                "overall_status": "no_data",
                "projections": [],
                "critical_count": 0,
                "warning_count": 0,
                "generated_at": utcnow().isoformat(),
                "message": "Data tidak cukup. Minimal 2 hari data untuk proyeksi.",
            }

        # Disk partitions from CapacityMetrics (/, /usr/local/syb or /Backup)
        label = metrics_data[-1].disk_data_label or '/usr/local/syb'
        for mount, col, pname in [
            ("/", "disk_root_pct", "/"),
            (label, "disk_data_pct", label),
        ]:
            historical_data = [
                {"date": str(m.tanggal), "use_pct": getattr(m, col)}
                for m in metrics_data
            ]
            current_use = getattr(metrics_data[-1], col)

            proj = calculate_projection(
                historical_data=historical_data,
                current_use_pct=current_use,
                partition_name=pname,
                threshold=100.0,
                metric_type="disk",
            )
            _add_projection(proj, metrics_data)

        # CPU projection (threshold 90%)
        if any(m.cpu_peak is not None and m.cpu_peak > 0 for m in metrics_data):
            cpu_hist = [
                {"date": str(m.tanggal), "use_pct": m.cpu_peak}
                for m in metrics_data
                if m.cpu_peak is not None and m.cpu_peak > 0
            ]
            if len(cpu_hist) >= 2:
                proj = calculate_projection(
                    historical_data=cpu_hist,
                    current_use_pct=metrics_data[-1].cpu_peak or 0,
                    partition_name="CPU_Peak",
                    threshold=90.0,
                    metric_type="cpu",
                )
                proj["type"] = "cpu"
                _add_projection(proj, metrics_data)

        # RAM projection (threshold 90%)
        if any(m.ram_peak is not None and m.ram_peak > 0 for m in metrics_data):
            ram_hist = [
                {"date": str(m.tanggal), "use_pct": m.ram_peak}
                for m in metrics_data
                if m.ram_peak is not None and m.ram_peak > 0
            ]
            if len(ram_hist) >= 2:
                proj = calculate_projection(
                    historical_data=ram_hist,
                    current_use_pct=metrics_data[-1].ram_peak or 0,
                    partition_name="RAM_Peak",
                    threshold=90.0,
                    metric_type="ram",
                )
                proj["type"] = "ram"
                _add_projection(proj, metrics_data)

        critical_count = sum(1 for p in projections if p.get("urgency") == "critical")
        warning_count = sum(1 for p in projections if p.get("urgency") == "warning")

        overall_status = "safe"
        if critical_count > 0:
            overall_status = "critical"
        elif warning_count > 0:
            overall_status = "warning"

        return {
            "hostname": hostname,
            "overall_status": overall_status,
            "projections": projections,
            "critical_count": critical_count,
            "warning_count": warning_count,
            "generated_at": utcnow().isoformat(),
            "source": "CapacityMetrics (fallback)",
            "note": "Data diambil dari tabel utama karena tabel partisi belum ada",
        }

    # ── Primary: DiskPartition has data ──────────────────────────────
    # Filter: only project meaningful partitions (/, /usr/local/syb, /Backup, /data, /home)
    MEANINGFUL_PREFIXES = ('/', '/usr/', '/Backup', '/data', '/home', '/var')
    VIRTUAL_PREFIXES = ('/dev', '/run', '/sys', '/proc')

    def is_meaningful_mount(mount: str) -> bool:
        """Return True if mount represents a real persistent partition worth projecting."""
        if mount == '/':
            return True
        # Exclude virtual filesystems
        for prefix in VIRTUAL_PREFIXES:
            if mount == prefix or mount.startswith(prefix + '/'):
                return False
        # Exclude sub-partitions of /Backup (e.g. /Backup/Backup-apps)
        if mount.startswith('/Backup/'):
            return False
        # Only root + explicitly named secondary partitions get projected
        secondary_partitions = ('/usr/local/syb', '/Backup', '/data', '/home')
        return any(mount == s for s in secondary_partitions)

    filtered_mounts = [m[0] for m in unique_mounts if is_meaningful_mount(m[0])]

    all_partitions = db.query(DiskPartition).filter(
        DiskPartition.hostname == hostname,
        DiskPartition.mount_point.in_(filtered_mounts),
    ).order_by(DiskPartition.mount_point, DiskPartition.tanggal.asc()).all()

    partitions_by_mount = defaultdict(list)
    for d in all_partitions:
        partitions_by_mount[d.mount_point].append(d)

    for mount in filtered_mounts:
        all_data = partitions_by_mount.get(mount, [])

        if len(all_data) < 2:
            projections.append({
                "partition": mount,
                "status": "insufficient_data",
                "message": "Data tidak cukup (minimal 2 hari)",
            })
            continue

        historical_data = [
            {"date": str(d.tanggal), "use_pct": d.use_pct}
            for d in all_data
            if d.use_pct is not None
        ]

        if not historical_data:
            projections.append({
                "partition": mount,
                "status": "insufficient_data",
                "message": "Data tidak cukup setelah filter (minimal 2 titik data)",
            })
            continue

        current_use = all_data[-1].use_pct if all_data[-1].use_pct else 0

        proj = calculate_projection(
            historical_data=historical_data,
            current_use_pct=current_use,
            partition_name=mount,
            threshold=100.0,
            metric_type="disk",
        )
        proj["data_range"] = {
            "first_date": str(all_data[0].tanggal),
            "last_date": str(all_data[-1].tanggal),
            "total_days": (all_data[-1].tanggal - all_data[0].tanggal).days,
        }
        projections.append(proj)

    # Also add CPU and RAM projections from CapacityMetrics
    capacity_metrics = db.query(CapacityMetrics).filter(
        CapacityMetrics.hostname == hostname
    ).order_by(CapacityMetrics.tanggal.asc()).all()

    if capacity_metrics and len(capacity_metrics) >= 2:
        # CPU projection
        if any(m.cpu_peak is not None and m.cpu_peak > 0 for m in capacity_metrics):
            cpu_hist = [
                {"date": str(m.tanggal), "use_pct": m.cpu_peak}
                for m in capacity_metrics
                if m.cpu_peak is not None and m.cpu_peak > 0
            ]
            if len(cpu_hist) >= 2:
                proj = calculate_projection(
                    historical_data=cpu_hist,
                    current_use_pct=capacity_metrics[-1].cpu_peak or 0,
                    partition_name="CPU_Peak",
                    threshold=90.0,
                    metric_type="cpu",
                )
                proj["type"] = "cpu"
                _add_projection(proj, capacity_metrics)

        # RAM projection
        if any(m.ram_peak is not None and m.ram_peak > 0 for m in capacity_metrics):
            ram_hist = [
                {"date": str(m.tanggal), "use_pct": m.ram_peak}
                for m in capacity_metrics
                if m.ram_peak is not None and m.ram_peak > 0
            ]
            if len(ram_hist) >= 2:
                proj = calculate_projection(
                    historical_data=ram_hist,
                    current_use_pct=capacity_metrics[-1].ram_peak or 0,
                    partition_name="RAM_Peak",
                    threshold=90.0,
                    metric_type="ram",
                )
                proj["type"] = "ram"
                _add_projection(proj, capacity_metrics)

    # ── Overall summary ─────────────────────────────────────────────
    critical_partitions = [p for p in projections if p.get("urgency") == "critical"]
    warning_partitions = [p for p in projections if p.get("urgency") == "warning"]

    overall_status = "safe"
    if critical_partitions:
        overall_status = "critical"
    elif warning_partitions:
        overall_status = "warning"

    return {
        "hostname": hostname,
        "overall_status": overall_status,
        "projections": projections,
        "critical_count": len(critical_partitions),
        "warning_count": len(warning_partitions),
        "generated_at": utcnow().isoformat(),
    }


def aggregate_network_by_date(db: Session, hostname: str, tanggal) -> Optional[dict]:
    """Aggregate network metrics by hostname and date from network_interfaces table.

    Returns dict with total_rx, total_tx, total_packet_drop, internet_status,
    or None if no network data exists for the hostname/date.
    """
    net_records = db.query(NetworkInterface).filter(
        NetworkInterface.hostname == hostname,
        NetworkInterface.tanggal == tanggal
    ).all()

    if not net_records:
        return None

    total_rx = sum(_parse_size_mb(net.total_rx) for net in net_records)
    total_tx = sum(_parse_size_mb(net.total_tx) for net in net_records)
    total_drop = sum(net.total_packet_drop or 0 for net in net_records)
    internet_status = 'TERHUBUNG' if any(net.internet_status == 'TERHUBUNG' for net in net_records) else 'TIDAK TERHUBUNG'

    return {
        "total_rx": f"{total_rx:.2f} MB",
        "total_tx": f"{total_tx:.2f} MB",
        "total_packet_drop": total_drop,
        "internet_status": internet_status,
    }

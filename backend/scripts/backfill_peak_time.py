#!/usr/bin/env python3
"""
Backfill script: Add peak time data to existing capacity_metrics records.

Zero-trust: Password is NEVER stored, only input at runtime via getpass.
Only updates records where cpu_peak_time IS NULL.
Does NOT modify any other existing data (CPU/RAM/Disk/Status).

Usage:
    python3 backend/scripts/backfill_peak_time.py \
        --username backup_reader \
        --sar-dir /root/log_job \
        --auth-mode sudo
"""
import sys
import os
import argparse
import getpass
import sqlite3
import time
import re
import logging
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from utils.ssh_handler import SSHConnection
import api.capacity_planning as cp_module
from api.capacity_planning import parse_sar_log, _generate_peak_description, _exec_remote, _sanitize_path

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%H:%M:%S'
)
logger = logging.getLogger('backfill_peak_time')

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'superapps.db')


def _strip_ansi(text: str) -> str:
    """Remove ANSI escape sequences and carriage returns from PTY output."""
    return re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', text).replace('\r', '')


def get_servers_needing_backfill(db_path: str, from_date: str = None) -> list:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    if from_date:
        cursor.execute('''
            SELECT hostname, ip_address, COUNT(*) as total
            FROM capacity_metrics
            WHERE cpu_peak_time IS NULL AND tanggal >= ?
            GROUP BY hostname
            ORDER BY total DESC
        ''', (from_date,))
    else:
        cursor.execute('''
            SELECT hostname, ip_address, COUNT(*) as total
            FROM capacity_metrics
            WHERE cpu_peak_time IS NULL
            GROUP BY hostname
            ORDER BY total DESC
        ''')
    servers = [{'hostname': r[0], 'ip_address': r[1], 'total': r[2]} for r in cursor.fetchall()]
    conn.close()
    return servers


def get_records_for_server(db_path: str, hostname: str, from_date: str = None) -> list:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    if from_date:
        cursor.execute('''
            SELECT id, tanggal, log_file
            FROM capacity_metrics
            WHERE hostname = ? AND cpu_peak_time IS NULL AND tanggal >= ?
            ORDER BY tanggal
        ''', (hostname, from_date))
    else:
        cursor.execute('''
            SELECT id, tanggal, log_file
            FROM capacity_metrics
            WHERE hostname = ? AND cpu_peak_time IS NULL
            ORDER BY tanggal
        ''', (hostname,))
    records = [{'id': r[0], 'tanggal': r[1], 'log_file': r[2]} for r in cursor.fetchall()]
    conn.close()
    return records


def update_record(db_path: str, record_id: int, cpu_peak_time, cpu_peak_max,
                  ram_peak_time, ram_peak_max, peak_description):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute('''
        UPDATE capacity_metrics
        SET cpu_peak_time = ?,
            cpu_peak_max = ?,
            ram_peak_time = ?,
            ram_peak_max = ?,
            peak_description = ?
        WHERE id = ? AND cpu_peak_time IS NULL
    ''', (cpu_peak_time, cpu_peak_max, ram_peak_time, ram_peak_max, peak_description, record_id))

    conn.commit()
    updated = cursor.rowcount
    conn.close()
    return updated


def backfill_server(hostname: str, ip_address: str, records: list,
                    username: str, password: str, sar_dir: str,
                    auth_mode: str, port: int, debug: bool = False) -> dict:
    stats = {'updated': 0, 'skipped_no_file': 0, 'errors': 0, 'total': len(records)}

    if debug:
        logger.info(f"Connecting to {ip_address}:{port} as {username}...")

    ssh = SSHConnection(
        host=ip_address,
        username=username,
        password=password,
        port=port
    )

    success, message = ssh.connect()
    if not success:
        logger.error(f"[{hostname}] SSH connection failed: {message}")
        return {'updated': 0, 'skipped_no_file': 0, 'errors': 1, 'total': len(records), 'error_msg': message}

    if debug:
        logger.info(f"Connected successfully: {message}")

    try:
        scan_cmd = f"ls -1 {_sanitize_path(sar_dir)}/"
        files_output, err_ls, ctx = _exec_remote(ssh, scan_cmd, username, password, timeout=30)

        if not files_output:
            logger.warning(f"[{hostname}] No files found in {sar_dir}")
            if err_ls:
                logger.warning(f"[{hostname}] ls error: {err_ls[:200]}")
            return {**stats, 'error_msg': 'No files found'}

        files_output = _strip_ansi(files_output)

        remote_files = set(files_output.split('\n'))
        logger.info(f"[{hostname}] Found {len(remote_files)} files on server")

        # Filter and normalize file paths (same pattern as existing scan)
        filtered = [f for f in files_output.split('\n') if '_daily-' in f and '.log' in f]
        remote_files_map = {}
        for f in filtered:
            basename = f.split('/')[-1]
            remote_files_map[basename] = f

        logger.info(f"[{hostname}] Filtered {len(filtered)} daily log files")

        records_by_file = {}
        for rec in records:
            if rec['log_file'] in remote_files_map:
                records_by_file[rec['log_file']] = rec

        logger.info(f"[{hostname}] {len(records_by_file)} files match DB records, "
                     f"{len(records) - len(records_by_file)} files not on server (rotated)")

        stats['skipped_no_file'] = len(records) - len(records_by_file)

        for idx, (filename, rec) in enumerate(records_by_file.items()):
            remote_path = remote_files_map[filename]
            if remote_path.startswith('/'):
                file_path = remote_path
            else:
                file_path = f"{sar_dir.rstrip('/')}/{filename}"
            logger.info(f"[{hostname}] [{idx+1}/{len(records_by_file)}] {filename}")

            try:
                read_cmd = f"cat {_sanitize_path(file_path)}"
                content, err_cat, ctx_file = _exec_remote(ssh, read_cmd, username, password, timeout=30)

                if not content:
                    logger.warning(f"[{hostname}] Empty content for {filename}")
                    if err_cat:
                        logger.warning(f"[{hostname}] cat error: {err_cat[:200]}")
                    stats['errors'] += 1
                    continue

                target_date_parts = rec['tanggal'].split('-')
                target_date = date(
                    int(target_date_parts[0]),
                    int(target_date_parts[1]),
                    int(target_date_parts[2])
                )

                metrics = parse_sar_log(content, hostname, ip_address, target_date)

                cpu_peak_time = metrics.get('cpu_peak_time')
                cpu_peak_max = metrics.get('cpu_peak_max')
                ram_peak_time = metrics.get('ram_peak_time')
                ram_peak_max = metrics.get('ram_peak_max')
                peak_description = metrics.get('peak_description')

                updated = update_record(
                    DB_PATH, rec['id'],
                    cpu_peak_time, cpu_peak_max,
                    ram_peak_time, ram_peak_max,
                    peak_description
                )

                if updated:
                    stats['updated'] += 1
                    logger.info(f"[{hostname}]   -> CPU peak: {cpu_peak_time} ({cpu_peak_max}%), "
                               f"RAM peak: {ram_peak_time} ({ram_peak_max}%)")
                else:
                    logger.info(f"[{hostname}]   -> Already backfilled (skipped)")

            except Exception as e:
                logger.error(f"[{hostname}] Error processing {filename}: {e}")
                stats['errors'] += 1

    finally:
        ssh.disconnect()

    return stats


def main():
    parser = argparse.ArgumentParser(
        description='Backfill peak time data for existing capacity_metrics records',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Zero-trust: Password is NEVER stored. Input via secure prompt.
Only updates records where cpu_peak_time IS NULL.
Does NOT modify any other existing data.

Examples:
    python3 backend/scripts/backfill_peak_time.py --sar-dir /root/log_job --auth-mode sudo
    python3 backend/scripts/backfill_peak_time.py --sar-dir /var/log/sa --server dc-opdash11
        """
    )

    parser.add_argument('--sar-dir', default='/root/log_job', help='SAR log directory on servers (default: /root/log_job)')
    parser.add_argument('--auth-mode', default='sudo', choices=['root', 'sudo'], help='Auth mode (default: sudo)')
    parser.add_argument('--port', type=int, default=22, help='SSH port (default: 22)')
    parser.add_argument('--server', help='Only backfill a specific server hostname')
    parser.add_argument('--from-date', default='2025-04-24', help='Only backfill records from this date (YYYY-MM-DD, default: 2025-04-24)')
    parser.add_argument('--debug', action='store_true', help='Enable debug logging (verbose SSH output)')

    args = parser.parse_args()

    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)
        logging.getLogger('paramiko').setLevel(logging.DEBUG)

    cp_module.ENABLE_SUDO_MODE = (args.auth_mode == 'sudo')

    print("\n" + "=" * 60)
    print("  BACKFILL PEAK TIME - Capacity Metrics")
    print("=" * 60)
    print(f"  SAR Directory : {args.sar_dir}")
    print(f"  Auth Mode     : {args.auth_mode}")
    print(f"  From Date     : {args.from_date}")
    print(f"  Port          : {args.port}")
    print(f"  Server Filter : {args.server or 'ALL servers'}")
    print("=" * 60)
    print()
    print("  Zero-trust: Credentials will NOT be stored or logged.")
    print("  Only records with cpu_peak_time IS NULL will be updated.")
    print("  No other data will be modified.")
    print()

    username = input("  SSH Username: ").strip()
    if not username:
        print("\n  ERROR: Username cannot be empty")
        sys.exit(1)

    password = getpass.getpass("  SSH Password: ")
    if not password:
        print("\n  ERROR: Password cannot be empty")
        sys.exit(1)

    print(f"  Username: {username}")
    print(f"  Password length: {len(password)} chars")
    print()

    servers = get_servers_needing_backfill(DB_PATH, from_date=args.from_date)
    if not servers:
        print("  No records need backfill. All done!")
        return

    if args.server:
        servers = [s for s in servers if s['hostname'] == args.server]
        if not servers:
            print(f"  Server '{args.server}' not found or already backfilled.")
            return

    total_records = sum(s['total'] for s in servers)
    print(f"  Found {len(servers)} servers with {total_records} records to backfill:\n")
    for s in servers:
        print(f"    {s['hostname']:25s} ({s['ip_address']:15s}) - {s['total']} records")
    print()

    confirm = input("  Continue? (yes/no): ").strip().lower()
    if confirm != 'yes':
        print("  Cancelled.")
        return

    print("\n" + "-" * 60)

    grand_total = {'updated': 0, 'skipped': 0, 'errors': 0}

    for server_info in servers:
        hostname = server_info['hostname']
        ip_address = server_info['ip_address']

        print(f"\n{'=' * 60}")
        print(f"  Processing: {hostname} ({ip_address})")
        print(f"{'=' * 60}")

        records = get_records_for_server(DB_PATH, hostname, from_date=args.from_date)
        if not records:
            print(f"  No records to backfill for {hostname}")
            continue

        stats = backfill_server(
            hostname=hostname,
            ip_address=ip_address,
            records=records,
            username=username,
            password=password,
            sar_dir=args.sar_dir,
            auth_mode=args.auth_mode,
            port=args.port,
            debug=args.debug
        )

        grand_total['updated'] += stats['updated']
        grand_total['skipped'] += stats.get('skipped_no_file', 0)
        grand_total['errors'] += stats.get('errors', 0)

        print(f"\n  [{hostname}] Summary:")
        print(f"    Updated          : {stats['updated']}")
        print(f"    Skipped (no file): {stats.get('skipped_no_file', 0)}")
        print(f"    Errors           : {stats.get('errors', 0)}")

    print("\n" + "=" * 60)
    print("  BACKFILL COMPLETE")
    print("=" * 60)
    print(f"  Total Updated   : {grand_total['updated']}")
    print(f"  Total Skipped   : {grand_total['skipped']}")
    print(f"  Total Errors    : {grand_total['errors']}")
    print("=" * 60)
    print()
    print("  Password cleared from memory.")
    print()


if __name__ == '__main__':
    main()

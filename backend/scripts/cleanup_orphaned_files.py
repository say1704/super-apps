"""Cleanup orphaned files in uploads/ that no longer have DB references."""
import os
import sys
import argparse
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import get_db
from models import (
    VulnerabilityReport, IncidentReport, QualityObjective, QualityEvidence,
    FormUpload, IRMCCheck, DocumentLibrary
)

UPLOADS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads")

FILE_SOURCES = [
    {"model": VulnerabilityReport, "column": "file_path", "label": "Vulnerability Reports"},
    {"model": IncidentReport, "column": "file_path", "label": "Incident Reports"},
    {"model": QualityObjective, "column": "attachment", "label": "Quality Objectives"},
    {"model": QualityEvidence, "column": "file_path", "label": "Quality Evidence"},
    {"model": FormUpload, "column": "file_path", "label": "Form Uploads"},
    {"model": IRMCCheck, "column": "screenshot_path", "label": "IRMC Screenshots"},
    {"model": DocumentLibrary, "column": "file_path", "label": "Document Library"},
]


def get_all_db_file_paths(db):
    """Collect all file paths referenced in the database."""
    db_paths = set()
    for source in FILE_SOURCES:
        model = source["model"]
        column = source["column"]
        column_attr = getattr(model, column)
        rows = db.query(column_attr).filter(column_attr.isnot(None)).all()
        for row in rows:
            path = row[0]
            if path:
                db_paths.add(os.path.normpath(path))
    return db_paths


def scan_uploads_directory():
    """Scan uploads/ directory for all files."""
    disk_files = {}
    uploads = Path(UPLOADS_DIR)
    if not uploads.exists():
        return disk_files
    for file_path in uploads.rglob("*"):
        if file_path.is_file():
            rel_path = str(file_path.relative_to(uploads.parent))
            disk_files[rel_path] = file_path
    return disk_files


def cleanup(dry_run=True, verbose=False):
    """Find and optionally delete orphaned files."""
    db = next(get_db())
    try:
        db_paths = get_all_db_file_paths(db)
        disk_files = scan_uploads_directory()

        if not disk_files:
            print("No files found in uploads/ directory.")
            return

        if verbose:
            print(f"\nDB referenced files: {len(db_paths)}")
            for p in sorted(db_paths):
                print(f"  DB: {p}")
            print(f"\nDisk files: {len(disk_files)}")
            for p in sorted(disk_files.keys()):
                print(f"  Disk: {p}")

        orphans = []
        for disk_path, full_path in sorted(disk_files.items()):
            norm_disk = os.path.normpath(disk_path)
            if norm_disk not in db_paths:
                orphans.append((disk_path, full_path))

        if not orphans:
            print("\nNo orphaned files found. All disk files have DB references.")
            return

        print(f"\nFound {len(orphans)} orphaned file(s):")
        total_size = 0
        for disk_path, full_path in orphans:
            size = full_path.stat().st_size
            total_size += size
            size_str = f"{size / 1024:.1f} KB" if size < 1024 * 1024 else f"{size / (1024 * 1024):.1f} MB"
            print(f"  {disk_path} ({size_str})")

        print(f"\nTotal orphaned size: {total_size / (1024 * 1024):.2f} MB")

        if dry_run:
            print("\nDRY RUN — no files deleted. Run with --execute to delete.")
        else:
            deleted = 0
            failed = 0
            for disk_path, full_path in orphans:
                try:
                    full_path.unlink()
                    deleted += 1
                    print(f"  Deleted: {disk_path}")
                except Exception as e:
                    failed += 1
                    print(f"  Failed: {disk_path} — {e}")
            print(f"\nDeleted {deleted} file(s), {failed} failed.")
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Clean up orphaned upload files")
    parser.add_argument("--execute", action="store_true", help="Actually delete orphaned files (default: dry run)")
    parser.add_argument("--verbose", "-v", action="store_true", help="Show all DB and disk files")
    args = parser.parse_args()

    cleanup(dry_run=not args.execute, verbose=args.verbose)

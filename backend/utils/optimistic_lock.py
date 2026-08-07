"""Optimistic locking utilities for concurrent edit protection"""
from typing import Optional
from fastapi import HTTPException, Request


def get_client_version(request: Request) -> Optional[int]:
    """Extract X-Resource-Version header from client request"""
    header = request.headers.get("X-Resource-Version")
    return int(header) if header else None


def check_version_conflict(record, client_version: Optional[int]) -> None:
    """Raise 409 if client version != current record version"""
    if client_version is not None:
        current_version = getattr(record, "version", None)
        if current_version != client_version:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "CONFLICT",
                    "message": "Record ini sudah diubah oleh user lain. Silakan refresh dan coba lagi.",
                    "current_version": current_version,
                    "your_version": client_version,
                }
            )


def increment_version(record) -> int:
    """Increment version counter, return new version"""
    current = getattr(record, "version", 0) or 0
    record.version = current + 1
    return record.version

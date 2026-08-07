"""Timezone-aware datetime utilities.

All datetimes in this application are stored and handled as UTC.
This module provides helpers to replace the deprecated datetime.utcnow()
and to safely serialize datetimes to ISO format strings.
"""
from datetime import datetime, date, timezone
from typing import Optional


def utcnow() -> datetime:
    """Return the current UTC time as a timezone-aware datetime.

    Replaces the deprecated datetime.utcnow() which returns naive datetimes
    that cause timezone ambiguity during serialization and frontend parsing.
    """
    return datetime.now(timezone.utc)


def to_iso(dt: Optional[datetime]) -> Optional[str]:
    """Serialize a datetime to ISO format string with UTC timezone.

    If the datetime is naive (no tzinfo), it is assumed to be UTC and
    timezone info is attached before serialization. This ensures the
    frontend correctly interprets the timestamp.

    Returns None if dt is None.
    """
    if dt is None:
        return None
    if isinstance(dt, datetime) and dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()

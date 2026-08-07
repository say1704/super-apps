"""Base schema class for all API response/request models"""
from pydantic import BaseModel, ConfigDict, field_validator
from typing import Any
from datetime import datetime, date, timezone


class OrmModel(BaseModel):
    """Base model that enables ORM object serialization with datetime->str conversion."""
    model_config = ConfigDict(from_attributes=True)

    @field_validator("*", mode="before")
    @classmethod
    def coerce_datetime_to_str(cls, v: Any, info) -> Any:
        """Convert datetime and date objects to ISO format strings.

        Naive datetimes (without tzinfo) are assumed to be UTC and get
        timezone info attached before serialization so the frontend
        correctly interprets them.
        """
        if isinstance(v, datetime):
            if v.tzinfo is None:
                v = v.replace(tzinfo=timezone.utc)
            return v.isoformat()
        if isinstance(v, date):
            return v.isoformat()
        return v

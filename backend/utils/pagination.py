"""Pagination helper functions"""
from typing import List, Generic, TypeVar, Any, Dict
from pydantic import BaseModel
from sqlalchemy.orm import Query

T = TypeVar('T')

class PaginationInfo(BaseModel):
    page: int
    page_size: int
    total_records: int
    total_pages: int
    has_next: bool
    has_prev: bool

class PaginatedResponse(BaseModel, Generic[T]):
    data: List[T]
    pagination: PaginationInfo

def calculate_pagination(page: int, page_size: int, total_records: int) -> PaginationInfo:
    """Calculate pagination metadata"""
    total_pages = (total_records + page_size - 1) // page_size

    return PaginationInfo(
        page=page,
        page_size=page_size,
        total_records=total_records,
        total_pages=total_pages,
        has_next=page < total_pages,
        has_prev=page > 1
    )

def get_offset(page: int, page_size: int) -> int:
    """Calculate offset for SQL query"""
    return (page - 1) * page_size

def paginate_query(query: Query, page: int = 1, page_size: int = 20) -> Dict[str, Any]:
    """Apply pagination to a SQLAlchemy query and return paginated results."""
    page = max(1, page)
    page_size = min(max(1, page_size), 100)  # Clamp between 1 and 100

    total_records = query.count()
    offset = get_offset(page, page_size)
    data = query.offset(offset).limit(page_size).all()
    pagination = calculate_pagination(page, page_size, total_records)

    return {
        "data": data,
        "pagination": pagination.dict()
    }

"""Notification schemas"""
from typing import List, Optional
from .base import OrmModel


class NotificationResponse(OrmModel):
    id: int
    user_id: int
    type: str
    title: str
    message: str
    is_read: bool
    link: Optional[str] = None
    created_at: Optional[str] = None


class UnreadCountResponse(OrmModel):
    unread_count: int


class OnlineUserResponse(OrmModel):
    user_id: int
    username: str
    full_name: str
    role: Optional[str] = None
    last_login: Optional[str] = None


class OnlineUserListResponse(OrmModel):
    users: List[OnlineUserResponse]
    count: int


class NotificationListPaginatedResponse(OrmModel):
    data: List[NotificationResponse]
    pagination: dict


class MarkAllReadResponse(OrmModel):
    message: str
    count: int

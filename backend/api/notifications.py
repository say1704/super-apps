from utils.timezone import to_iso
"""Notifications and SSE Endpoints"""
import json
import asyncio
import time
import logging
from fastapi import APIRouter, Depends, Query, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import get_db
from models import User, Notification
from api.dependencies import get_current_user
from api.dependencies import log_activity
from api.dependencies import sse_manager, broadcast_event, get_offset, calculate_pagination
from api.schemas import NotificationResponse, UnreadCountResponse, OnlineUserResponse, OnlineUserListResponse, NotificationListPaginatedResponse, MessageResponse, MarkAllReadResponse

router = APIRouter(tags=["Notifications"])

logger = logging.getLogger(__name__)

MAX_PAGE_SIZE = 100
SSE_QUEUE_MAX_SIZE = 256


@router.get("/notifications", response_model=NotificationListPaginatedResponse)
async def get_notifications(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=MAX_PAGE_SIZE),
    unread_only: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Notification).filter(Notification.user_id == current_user.id)
    if unread_only:
        query = query.filter(Notification.is_read == False)
    total = query.count()
    offset = get_offset(page, page_size)
    records = query.order_by(Notification.created_at.desc()).offset(offset).limit(page_size).all()
    pagination = calculate_pagination(page, page_size, total)
    return {
        "data": [
            {
                "id": n.id, "user_id": n.user_id, "type": n.type, "title": n.title, "message": n.message,
                "is_read": n.is_read, "link": n.link,
                "created_at": to_iso(n.created_at),
            }
            for n in records
        ],
        "pagination": pagination.dict()
    }


@router.get("/notifications/unread-count", response_model=UnreadCountResponse)
async def get_unread_count(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    count = db.query(Notification).filter(
        Notification.user_id == current_user.id, Notification.is_read == False
    ).count()
    return {"unread_count": count}


@router.post("/notifications/{notification_id}/read", response_model=MessageResponse)
async def mark_notification_read(
    notification_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    notification = db.query(Notification).filter(
        Notification.id == notification_id, Notification.user_id == current_user.id
    ).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    notification.is_read = True
    db.commit()
    log_activity(db, current_user.id, "UPDATE", "notifications",
                 f"Marked notification read: {notification.title[:100]}")
    db.commit()
    return {"message": "Notification marked as read"}


@router.post("/notifications/read-all", response_model=MarkAllReadResponse)
async def mark_all_read(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    count = db.query(Notification).filter(
        Notification.user_id == current_user.id, Notification.is_read == False
    ).update({Notification.is_read: True})
    db.commit()
    log_activity(db, current_user.id, "UPDATE", "notifications",
                 f"Marked {count} notifications as read")
    db.commit()
    return {"message": "All notifications marked as read", "count": count}


@router.get("/events/stream")
async def sse_stream(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    client = sse_manager.connect(current_user.id, current_user.username, max_queue_size=SSE_QUEUE_MAX_SIZE)

    origin = request.headers.get("origin", "")
    from utils.security_config import _is_origin_allowed
    cors_origin = origin if _is_origin_allowed(origin) else ""

    async def event_generator():
        try:
            yield f"event: connected\ndata: {json.dumps({'user_id': current_user.id, 'username': current_user.username})}\n\n"
            client.last_seen = time.time()
            while True:
                try:
                    event = await asyncio.wait_for(client.queue.get(), timeout=30)
                    yield f"data: {event}\n\n"
                except asyncio.TimeoutError:
                    client.last_seen = time.time()
                    yield f": heartbeat\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            sse_manager.disconnect(current_user.id)
            await broadcast_event("user_offline", {
                "user_id": current_user.id, "username": current_user.username,
            })

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": cors_origin,
            "Access-Control-Allow-Credentials": "true" if cors_origin else "false",
        }
    )


@router.get("/online-users", response_model=OnlineUserListResponse)
async def get_online_users(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    online = sse_manager.get_online_users()
    online_user_ids = [u["user_id"] for u in online]
    user_by_id = {}
    if online_user_ids:
        users = db.query(User).filter(User.id.in_(online_user_ids)).all()
        user_by_id = {u.id: u for u in users}
    is_superadmin = current_user.role == "superadmin"
    result = []
    for u in online:
        user = user_by_id.get(u["user_id"])
        result.append({
            "user_id": u["user_id"],
            "username": u["username"],
            "full_name": user.full_name if user else u["username"],
            "role": user.role if (user and is_superadmin) else None,
            "last_login": to_iso(user.last_login) if (user and is_superadmin) else None,
        })
    return {"users": result, "count": len(result)}

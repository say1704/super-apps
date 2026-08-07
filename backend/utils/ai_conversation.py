"""
AI Conversation Memory — Persists chat history across sessions.
"""
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session
from models import AiConversation, AiConversationMessage

logger = logging.getLogger(__name__)

# When a conversation exceeds this many messages, auto-summarize old messages
_SUMMARIZE_AFTER = 20
# Keep this many recent messages intact (the rest get summarized)
_KEEP_RECENT = 10


def create_conversation(db: Session, user_id: int, title: Optional[str] = None) -> AiConversation:
    conv = AiConversation(user_id=user_id, title=title)
    db.add(conv)
    db.flush()
    return conv


def get_conversation(db: Session, conversation_id: int, user_id: int) -> Optional[Dict[str, Any]]:
    conv = db.query(AiConversation).filter(
        AiConversation.id == conversation_id,
        AiConversation.user_id == user_id,
    ).first()
    if not conv:
        return None
    messages = db.query(AiConversationMessage).filter(
        AiConversationMessage.conversation_id == conversation_id,
    ).order_by(AiConversationMessage.created_at.asc()).all()
    return {
        "id": conv.id,
        "title": conv.title,
        "user_id": conv.user_id,
        "created_at": conv.created_at.isoformat() if conv.created_at else None,
        "updated_at": conv.updated_at.isoformat() if conv.updated_at else None,
        "messages": [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "extra_data": m.extra_data,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in messages
        ],
    }


def list_conversations(db: Session, user_id: int, limit: int = 20) -> List[Dict[str, Any]]:
    convs = db.query(AiConversation).filter(
        AiConversation.user_id == user_id,
    ).order_by(AiConversation.updated_at.desc()).limit(limit).all()
    return [
        {
            "id": c.id,
            "title": c.title,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None,
            "message_count": db.query(AiConversationMessage).filter(
                AiConversationMessage.conversation_id == c.id,
            ).count(),
        }
        for c in convs
    ]


def add_message(
    db: Session,
    conversation_id: Optional[int],
    user_id: int,
    role: str,
    content: str,
    extra_data: Optional[Dict[str, Any]] = None,
) -> AiConversationMessage:
    """Add a message to a conversation. Auto-create conversation if needed."""
    conv = None
    if conversation_id is not None:
        conv = db.query(AiConversation).filter(
            AiConversation.id == conversation_id,
            AiConversation.user_id == user_id,
        ).first()
    if not conv:
        conv = create_conversation(db, user_id)
        db.flush()
        conversation_id = conv.id

    msg = AiConversationMessage(
        conversation_id=conversation_id,
        role=role,
        content=content,
        extra_data=extra_data,
    )
    db.add(msg)
    conv.updated_at = datetime.now(timezone.utc)
    db.flush()
    return msg


def delete_conversation(db: Session, conversation_id: int, user_id: int) -> bool:
    conv = db.query(AiConversation).filter(
        AiConversation.id == conversation_id,
        AiConversation.user_id == user_id,
    ).first()
    if not conv:
        return False
    db.delete(conv)
    db.flush()
    return True


# ── Summarization ─────────────────────────────────────────

def get_summary_context(db: Session, conversation_id: int) -> Optional[str]:
    """Get the conversation summary if one exists (stored in first message's extra_data)."""
    first_msg = db.query(AiConversationMessage).filter(
        AiConversationMessage.conversation_id == conversation_id,
    ).order_by(AiConversationMessage.created_at.asc()).first()
    if first_msg and first_msg.extra_data and "summary" in first_msg.extra_data:
        return first_msg.extra_data["summary"]
    return None


def get_recent_messages(
    db: Session, conversation_id: int, keep_recent: int = _KEEP_RECENT,
) -> List[Dict[str, Any]]:
    """Get only the most recent messages (skip summarized older ones)."""
    total = db.query(AiConversationMessage).filter(
        AiConversationMessage.conversation_id == conversation_id,
    ).count()
    skip = max(0, total - keep_recent)
    messages = db.query(AiConversationMessage).filter(
        AiConversationMessage.conversation_id == conversation_id,
    ).order_by(AiConversationMessage.created_at.asc()).offset(skip).limit(keep_recent).all()
    return [
        {"role": m.role, "content": m.content}
        for m in messages
    ]


async def summarize_conversation(
    db: Session, conversation_id: int,
) -> Optional[str]:
    """Summarize a conversation using LLM and store in first message's extra_data."""
    from utils.ai_engine import query_llm

    messages = db.query(AiConversationMessage).filter(
        AiConversationMessage.conversation_id == conversation_id,
    ).order_by(AiConversationMessage.created_at.asc()).all()

    if len(messages) < 3:
        return None

    # Build conversation text
    conv_text = "\n".join(
        f"{m.role}: {m.content[:200]}"
        for m in messages
    )

    prompt = (
        "Ringkas percakapan berikut dalam Bahasa Indonesia, maksimal 3 kalimat. "
        "Fokus pada topik utama dan keputusan yang diambil.\n\n"
        f"{conv_text}"
    )

    try:
        summary = await query_llm(
            [{"role": "system", "content": "Kamu asisten perangkum percakapan."},
             {"role": "user", "content": prompt}],
            max_tokens=200, temperature=0.3,
        )

        # Store summary in first message's extra_data
        first_msg = messages[0]
        extra = first_msg.extra_data or {}
        extra["summary"] = summary
        first_msg.extra_data = extra
        db.flush()

        # Also update conversation title from summary
        conv = db.query(AiConversation).filter(
            AiConversation.id == conversation_id,
        ).first()
        if conv and not conv.title:
            conv.title = summary[:100]

        logger.info("Conversation %d summarized", conversation_id)
        return summary

    except Exception as e:
        logger.error("Summarize failed: %s", e, exc_info=True)
        return None


async def maybe_summarize(
    db: Session, conversation_id: int,
) -> Optional[str]:
    """Auto-summarize if conversation exceeds threshold. Idempotent."""
    msg_count = db.query(AiConversationMessage).filter(
        AiConversationMessage.conversation_id == conversation_id,
    ).count()
    if msg_count >= _SUMMARIZE_AFTER:
        existing = get_summary_context(db, conversation_id)
        if not existing:
            return await summarize_conversation(db, conversation_id)
    return None

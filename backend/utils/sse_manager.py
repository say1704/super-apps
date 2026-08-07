"""
SSE Manager - Server-Sent Events connection management and broadcasting
"""
import asyncio
import json
import logging
import time
from typing import Dict, Set, Optional
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class SSEClient:
    """Represents a connected SSE client"""
    user_id: int
    username: str
    queue: asyncio.Queue = field(default_factory=asyncio.Queue)
    connected_at: float = field(default_factory=time.time)
    last_seen: float = field(default_factory=time.time)


class SSEManager:
    """Manages SSE connections and broadcasts events"""
    
    def __init__(self):
        self.clients: Dict[int, SSEClient] = {}
    
    def connect(self, user_id: int, username: str, max_queue_size: int = 0) -> SSEClient:
        """Register a new SSE client"""
        # Remove old connection if exists
        if user_id in self.clients:
            self.disconnect(user_id)
        
        client = SSEClient(
            user_id=user_id,
            username=username,
            queue=asyncio.Queue(maxsize=max_queue_size if max_queue_size > 0 else 0),
        )
        self.clients[user_id] = client
        return client
    
    def disconnect(self, user_id: int):
        """Remove an SSE client"""
        if user_id in self.clients:
            del self.clients[user_id]
    
    async def send_event(self, user_id: int, event_type: str, data: dict):
        """Send an event to a specific user"""
        client = self.clients.get(user_id)
        if client:
            event = {
                "event": event_type,
                "data": data,
                "timestamp": time.time(),
            }
            try:
                client.queue.put_nowait(json.dumps(event))
                client.last_seen = time.time()
            except asyncio.QueueFull:
                logger.warning(f"SSE queue full for user {user_id}, dropping event")
    
    async def broadcast(self, event_type: str, data: dict, exclude_user: Optional[int] = None):
        """Broadcast an event to all connected clients"""
        event = {
            "event": event_type,
            "data": data,
            "timestamp": time.time(),
        }
        payload = json.dumps(event)
        
        disconnected = []
        for user_id, client in self.clients.items():
            if exclude_user and user_id == exclude_user:
                continue
            try:
                client.queue.put_nowait(payload)
                client.last_seen = time.time()
            except asyncio.QueueFull:
                logger.warning(f"SSE queue full for user {user_id}, dropping broadcast event")
            except Exception:
                disconnected.append(user_id)
        
        # Clean up disconnected clients
        for user_id in disconnected:
            self.disconnect(user_id)
    
    async def broadcast_to_module(self, event_type: str, data: dict, module: str):
        """Broadcast event to users who have access to a module"""
        await self.broadcast(event_type, data)
    
    def get_online_users(self) -> list:
        """Get list of currently online users"""
        now = time.time()
        # Consider user online if seen in last 60 seconds
        return [
            {
                "user_id": c.user_id,
                "username": c.username,
                "connected_at": c.connected_at,
                "last_seen": c.last_seen,
            }
            for c in self.clients.values()
            if now - c.last_seen < 60
        ]
    
    def get_online_count(self) -> int:
        """Get count of online users"""
        return len(self.get_online_users())


# Global manager instance
manager = SSEManager()


async def broadcast_event(event_type: str, data: dict, exclude_user: Optional[int] = None):
    """Helper to broadcast an event"""
    await manager.broadcast(event_type, data, exclude_user)


async def send_user_event(user_id: int, event_type: str, data: dict):
    """Helper to send event to specific user"""
    await manager.send_event(user_id, event_type, data)

from fastapi import WebSocket

from ..db.engine import async_session
from ..db.models import ChatMember
from sqlalchemy import and_, select


class ConnectionManager:
    """Manages active WebSocket connections per user."""

    def __init__(self):
        # user_id -> set of WebSocket connections
        self.active_connections: dict[str, set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = set()
        self.active_connections[user_id].add(websocket)

    def disconnect(self, websocket: WebSocket, user_id: str):
        if user_id in self.active_connections:
            self.active_connections[user_id].discard(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

    def is_connected(self, user_id: str) -> bool:
        return user_id in self.active_connections

    async def send_to_user(self, user_id: str, message: dict):
        connections = self.active_connections.get(user_id, set())
        dead = []
        for ws in connections:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            connections.discard(ws)

    async def broadcast_to_chat(
        self,
        chat_id: str,
        message: dict,
        exclude_user: str | None = None,
    ):
        """Send message to all connected members of a chat."""
        async with async_session() as db:
            result = await db.execute(
                select(ChatMember.user_id).where(
                    and_(
                        ChatMember.chat_id == chat_id,
                        ChatMember.left_at.is_(None),
                    )
                )
            )
            member_ids = [row[0] for row in result.all()]

        for uid in member_ids:
            if uid == exclude_user:
                continue
            await self.send_to_user(uid, message)


manager = ConnectionManager()

import asyncio
from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import and_, select

from ..auth.service import decode_access_token
from ..db.engine import async_session
from ..db.models import Chat, ChatMember, Message, MessageReaction, MessageType, User
from ..services.link_preview import process_link_previews
from .manager import manager

router = APIRouter()


async def _authenticate_ws(websocket: WebSocket) -> str | None:
    """Authenticate WebSocket connection via query param token."""
    token = websocket.query_params.get("token")
    if not token:
        return None
    try:
        payload = decode_access_token(token)
        user_id = payload.get("sub")
        if not user_id:
            return None
        # Verify user exists
        async with async_session() as db:
            result = await db.execute(select(User.id).where(User.id == user_id))
            if result.scalar_one_or_none() is None:
                return None
        return user_id
    except Exception:
        return None


async def _get_user_display_name(user_id: str) -> str:
    async with async_session() as db:
        result = await db.execute(
            select(User.display_name).where(User.id == user_id)
        )
        return result.scalar_one_or_none() or "Unknown"


async def _handle_message_send(user_id: str, payload: dict, frame_id: str):
    chat_id = payload.get("chatId")
    content = payload.get("content", "")
    reply_to_id = payload.get("replyTo")

    if not chat_id or not content:
        return

    async with async_session() as db:
        # Verify membership
        result = await db.execute(
            select(ChatMember).where(
                and_(
                    ChatMember.chat_id == chat_id,
                    ChatMember.user_id == user_id,
                    ChatMember.left_at.is_(None),
                )
            )
        )
        if result.scalar_one_or_none() is None:
            await manager.send_to_user(user_id, {
                "type": "error",
                "refId": frame_id,
                "code": "FORBIDDEN",
                "message": "Not a member of this chat",
            })
            return

        msg = Message(
            chat_id=chat_id,
            sender_id=user_id,
            content=content,
            content_plain=content,
            type=MessageType.text,
            reply_to_id=reply_to_id,
        )
        db.add(msg)
        await db.flush()

        # Update chat
        result = await db.execute(select(Chat).where(Chat.id == chat_id))
        chat = result.scalar_one_or_none()
        if chat:
            chat.last_message_id = msg.id
            chat.last_message_at = msg.created_at
            chat.updated_at = msg.created_at

        await db.commit()
        await db.refresh(msg)

        # Get sender info
        result = await db.execute(
            select(User).where(User.id == user_id)
        )
        sender = result.scalar_one()

    # Send ack to sender
    await manager.send_to_user(user_id, {
        "type": "ack",
        "refId": frame_id,
        "status": "ok",
    })

    # Broadcast to chat members
    await manager.broadcast_to_chat(chat_id, {
        "type": "message.new",
        "payload": {
            "chatId": chat_id,
            "message": {
                "id": msg.id,
                "chatId": chat_id,
                "sender": {
                    "id": sender.id,
                    "displayName": sender.display_name,
                    "avatarUrl": sender.avatar_url,
                },
                "content": msg.content,
                "contentPlain": msg.content_plain,
                "type": msg.type.value,
                "replyToId": msg.reply_to_id,
                "isEdited": msg.is_edited,
                "createdAt": msg.created_at.isoformat(),
            },
        },
    })

    # Extract and fetch link previews in background
    asyncio.create_task(process_link_previews(msg.id, chat_id, content))


async def _handle_message_edit(user_id: str, payload: dict, frame_id: str):
    message_id = payload.get("messageId")
    content = payload.get("content", "")

    if not message_id or not content:
        return

    async with async_session() as db:
        result = await db.execute(
            select(Message).where(Message.id == message_id)
        )
        msg = result.scalar_one_or_none()
        if msg is None or msg.sender_id != user_id:
            await manager.send_to_user(user_id, {
                "type": "error",
                "refId": frame_id,
                "code": "FORBIDDEN",
                "message": "Cannot edit this message",
            })
            return

        msg.content = content
        msg.content_plain = content
        msg.is_edited = True
        msg.edited_at = datetime.utcnow()
        msg.updated_at = datetime.utcnow()
        chat_id = msg.chat_id

        await db.commit()

    await manager.send_to_user(user_id, {
        "type": "ack",
        "refId": frame_id,
        "status": "ok",
    })

    await manager.broadcast_to_chat(chat_id, {
        "type": "message.updated",
        "payload": {
            "chatId": chat_id,
            "message": {
                "id": message_id,
                "content": content,
                "contentPlain": content,
                "isEdited": True,
                "editedAt": msg.edited_at.isoformat(),
            },
        },
    })


async def _handle_message_delete(user_id: str, payload: dict, frame_id: str):
    message_id = payload.get("messageId")
    if not message_id:
        return

    async with async_session() as db:
        result = await db.execute(
            select(Message).where(Message.id == message_id)
        )
        msg = result.scalar_one_or_none()
        if msg is None:
            return

        # Check permissions: sender or owner/admin
        can_delete = msg.sender_id == user_id
        if not can_delete:
            result = await db.execute(
                select(ChatMember).where(
                    and_(
                        ChatMember.chat_id == msg.chat_id,
                        ChatMember.user_id == user_id,
                        ChatMember.left_at.is_(None),
                    )
                )
            )
            membership = result.scalar_one_or_none()
            if membership and membership.role in ("owner", "admin"):
                can_delete = True

        if not can_delete:
            await manager.send_to_user(user_id, {
                "type": "error",
                "refId": frame_id,
                "code": "FORBIDDEN",
                "message": "Cannot delete this message",
            })
            return

        chat_id = msg.chat_id
        msg.content = ""
        msg.content_plain = ""
        msg.type = MessageType.deleted
        msg.is_deleted = True
        msg.deleted_at = datetime.utcnow()

        await db.commit()

    await manager.send_to_user(user_id, {
        "type": "ack",
        "refId": frame_id,
        "status": "ok",
    })

    await manager.broadcast_to_chat(chat_id, {
        "type": "message.deleted",
        "payload": {
            "chatId": chat_id,
            "messageId": message_id,
        },
    })


async def _handle_read_mark(user_id: str, payload: dict, frame_id: str):
    chat_id = payload.get("chatId")
    message_id = payload.get("messageId")

    if not chat_id or not message_id:
        return

    async with async_session() as db:
        # Verify membership
        result = await db.execute(
            select(ChatMember).where(
                and_(
                    ChatMember.chat_id == chat_id,
                    ChatMember.user_id == user_id,
                    ChatMember.left_at.is_(None),
                )
            )
        )
        membership = result.scalar_one_or_none()
        if membership is None:
            await manager.send_to_user(user_id, {
                "type": "error",
                "refId": frame_id,
                "code": "FORBIDDEN",
                "message": "Not a member of this chat",
            })
            return

        # Verify message exists in this chat
        result = await db.execute(
            select(Message).where(
                and_(Message.id == message_id, Message.chat_id == chat_id)
            )
        )
        target_msg = result.scalar_one_or_none()
        if target_msg is None:
            return

        # Only move forward
        if membership.last_read_message_id:
            result = await db.execute(
                select(Message.created_at).where(
                    Message.id == membership.last_read_message_id
                )
            )
            current_read_at = result.scalar_one_or_none()
            if current_read_at and target_msg.created_at <= current_read_at:
                return

        membership.last_read_message_id = message_id
        await db.commit()

    display_name = await _get_user_display_name(user_id)

    await manager.broadcast_to_chat(chat_id, {
        "type": "read.receipt",
        "payload": {
            "chatId": chat_id,
            "userId": user_id,
            "displayName": display_name,
            "messageId": message_id,
        },
    })


async def _handle_message_react(user_id: str, payload: dict, frame_id: str):
    chat_id = payload.get("chatId")
    message_id = payload.get("messageId")
    emoji = payload.get("emoji", "")

    if not chat_id or not message_id or not emoji:
        return

    async with async_session() as db:
        # Verify membership
        result = await db.execute(
            select(ChatMember).where(
                and_(
                    ChatMember.chat_id == chat_id,
                    ChatMember.user_id == user_id,
                    ChatMember.left_at.is_(None),
                )
            )
        )
        if result.scalar_one_or_none() is None:
            await manager.send_to_user(user_id, {
                "type": "error",
                "refId": frame_id,
                "code": "FORBIDDEN",
                "message": "Not a member of this chat",
            })
            return

        # Verify message exists in this chat
        result = await db.execute(
            select(Message).where(
                and_(Message.id == message_id, Message.chat_id == chat_id)
            )
        )
        if result.scalar_one_or_none() is None:
            return

        # Toggle: check if reaction exists
        result = await db.execute(
            select(MessageReaction).where(
                and_(
                    MessageReaction.message_id == message_id,
                    MessageReaction.user_id == user_id,
                    MessageReaction.emoji == emoji,
                )
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            await db.delete(existing)
            action = "removed"
        else:
            reaction = MessageReaction(
                message_id=message_id,
                user_id=user_id,
                emoji=emoji,
            )
            db.add(reaction)
            action = "added"

        await db.commit()

    display_name = await _get_user_display_name(user_id)

    await manager.send_to_user(user_id, {
        "type": "ack",
        "refId": frame_id,
        "status": "ok",
    })

    await manager.broadcast_to_chat(chat_id, {
        "type": "message.reaction",
        "payload": {
            "chatId": chat_id,
            "messageId": message_id,
            "emoji": emoji,
            "userId": user_id,
            "displayName": display_name,
            "action": action,
        },
    })


async def _handle_typing(user_id: str, payload: dict, active: bool):
    chat_id = payload.get("chatId")
    if not chat_id:
        return

    display_name = await _get_user_display_name(user_id)

    await manager.broadcast_to_chat(
        chat_id,
        {
            "type": "typing.indicator",
            "payload": {
                "chatId": chat_id,
                "userId": user_id,
                "displayName": display_name,
                "active": active,
            },
        },
        exclude_user=user_id,
    )


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    user_id = await _authenticate_ws(websocket)
    if user_id is None:
        await websocket.close(code=4001, reason="Authentication failed")
        return

    await manager.connect(websocket, user_id)

    try:
        while True:
            data = await websocket.receive_json()
            frame_type = data.get("type", "")
            frame_id = data.get("id", str(uuid4()))
            payload = data.get("payload", {})

            if frame_type == "message.send":
                await _handle_message_send(user_id, payload, frame_id)
            elif frame_type == "message.edit":
                await _handle_message_edit(user_id, payload, frame_id)
            elif frame_type == "message.delete":
                await _handle_message_delete(user_id, payload, frame_id)
            elif frame_type == "message.react":
                await _handle_message_react(user_id, payload, frame_id)
            elif frame_type == "read.mark":
                await _handle_read_mark(user_id, payload, frame_id)
            elif frame_type == "typing.start":
                await _handle_typing(user_id, payload, active=True)
            elif frame_type == "typing.stop":
                await _handle_typing(user_id, payload, active=False)
            else:
                await manager.send_to_user(user_id, {
                    "type": "error",
                    "refId": frame_id,
                    "code": "UNKNOWN_TYPE",
                    "message": f"Unknown frame type: {frame_type}",
                })

    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)
    except Exception:
        manager.disconnect(websocket, user_id)

import asyncio
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..auth.dependencies import get_current_user
from ..db.engine import get_db
from ..db.models import (
    Chat,
    ChatMember,
    LinkPreview,
    MemberRole,
    Message,
    MessageAttachment,
    MessageMention,
    MessageReaction,
    MessageType,
    User,
)
from ..services.link_preview import process_link_previews
from ..ws.manager import manager
from .schemas import (
    AttachmentInfo,
    EditMessageRequest,
    LinkPreviewInfo,
    MentionInfo,
    MessageListResponse,
    MessageResponse,
    ReactRequest,
    ReactionSummary,
    ReactionUserInfo,
    ReplyPreview,
    SenderInfo,
    SendMessageRequest,
)

router = APIRouter()


async def _require_chat_membership(
    chat_id: str, user_id: str, db: AsyncSession
) -> ChatMember:
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
        raise HTTPException(status_code=403, detail="Not a member of this chat")
    return membership


def _build_reaction_summaries(
    reactions: list[MessageReaction], current_user_id: str
) -> list[ReactionSummary]:
    grouped: dict[str, list[MessageReaction]] = {}
    for r in reactions:
        grouped.setdefault(r.emoji, []).append(r)

    summaries = []
    for emoji, rxns in grouped.items():
        summaries.append(ReactionSummary(
            emoji=emoji,
            count=len(rxns),
            users=[
                ReactionUserInfo(id=r.user_id, display_name=r.user.display_name)
                for r in rxns
            ],
            reacted_by_me=any(r.user_id == current_user_id for r in rxns),
        ))
    return summaries


def _build_message_response(
    msg: Message,
    reply_msg: Message | None = None,
    current_user_id: str = "",
) -> MessageResponse:
    reply_to = None
    if reply_msg:
        reply_to = ReplyPreview(
            id=reply_msg.id,
            sender_name=reply_msg.sender.display_name if reply_msg.sender else "Unknown",
            content_preview=reply_msg.content_plain[:100] if reply_msg.content_plain else "",
            created_at=reply_msg.created_at,
        )

    reactions = _build_reaction_summaries(
        msg.reactions if msg.reactions else [], current_user_id
    )

    mentions = [
        MentionInfo(
            user_id=m.mentioned_user_id,
            display_name=m.user.display_name,
            offset=m.offset,
            length=m.length,
        )
        for m in (msg.mentions or [])
    ]

    attachments = [
        AttachmentInfo(
            id=a.id,
            file_name=a.file_name,
            file_size=a.file_size,
            mime_type=a.mime_type,
            url=f"/api/v1/chats/{msg.chat_id}/attachments/{a.id}/download",
            width=a.width,
            height=a.height,
        )
        for a in (msg.attachments or [])
    ]

    link_previews = [
        LinkPreviewInfo(
            url=lp.url,
            title=lp.title,
            description=lp.description,
            image_url=lp.image_url,
            domain=lp.domain,
        )
        for lp in (msg.link_previews or [])
    ]

    return MessageResponse(
        id=msg.id,
        chat_id=msg.chat_id,
        sender=SenderInfo(
            id=msg.sender.id,
            display_name=msg.sender.display_name,
            avatar_url=msg.sender.avatar_url,
        ),
        content=msg.content,
        content_plain=msg.content_plain,
        type=msg.type.value,
        reply_to=reply_to,
        reactions=reactions,
        mentions=mentions,
        attachments=attachments,
        link_previews=link_previews,
        is_edited=msg.is_edited,
        edited_at=msg.edited_at,
        created_at=msg.created_at,
    )


@router.get("/{chat_id}/messages", response_model=MessageListResponse)
async def list_messages(
    chat_id: str,
    limit: int = Query(default=50, ge=1, le=100),
    before: str | None = None,
    after: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_chat_membership(chat_id, current_user.id, db)

    query = (
        select(Message)
        .options(
            selectinload(Message.sender),
            selectinload(Message.reactions).selectinload(MessageReaction.user),
            selectinload(Message.mentions).selectinload(MessageMention.user),
            selectinload(Message.attachments),
            selectinload(Message.link_previews),
        )
        .where(Message.chat_id == chat_id)
    )

    if before:
        # Get the created_at of the 'before' message
        result = await db.execute(
            select(Message.created_at).where(Message.id == before)
        )
        before_ts = result.scalar_one_or_none()
        if before_ts:
            query = query.where(Message.created_at < before_ts)

    if after:
        result = await db.execute(
            select(Message.created_at).where(Message.id == after)
        )
        after_ts = result.scalar_one_or_none()
        if after_ts:
            query = query.where(Message.created_at > after_ts)

    query = query.order_by(Message.created_at.desc()).limit(limit + 1)

    result = await db.execute(query)
    messages = list(result.scalars().all())

    has_more = len(messages) > limit
    if has_more:
        messages = messages[:limit]

    # Load reply_to messages
    reply_ids = {m.reply_to_id for m in messages if m.reply_to_id}
    reply_map: dict[str, Message] = {}
    if reply_ids:
        result = await db.execute(
            select(Message)
            .options(selectinload(Message.sender))
            .where(Message.id.in_(reply_ids))
        )
        for reply_msg in result.scalars().all():
            reply_map[reply_msg.id] = reply_msg

    responses = [
        _build_message_response(
            msg,
            reply_map.get(msg.reply_to_id) if msg.reply_to_id else None,
            current_user_id=current_user.id,
        )
        for msg in messages
    ]

    return MessageListResponse(messages=responses, has_more=has_more)


@router.post(
    "/{chat_id}/messages",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
)
async def send_message(
    chat_id: str,
    body: SendMessageRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_chat_membership(chat_id, current_user.id, db)

    # Verify chat exists
    result = await db.execute(select(Chat).where(Chat.id == chat_id))
    chat = result.scalar_one_or_none()
    if chat is None:
        raise HTTPException(status_code=404, detail="Chat not found")

    # Validate reply_to exists in same chat
    if body.reply_to_id:
        result = await db.execute(
            select(Message).where(
                and_(Message.id == body.reply_to_id, Message.chat_id == chat_id)
            )
        )
        if result.scalar_one_or_none() is None:
            raise HTTPException(status_code=400, detail="Reply target not found in this chat")

    # Strip HTML for plain text
    content_plain = body.content  # Simple version; a proper HTML stripper would go here

    msg = Message(
        chat_id=chat_id,
        sender_id=current_user.id,
        content=body.content,
        content_plain=content_plain,
        type=MessageType.text,
        reply_to_id=body.reply_to_id,
    )
    db.add(msg)
    await db.flush()

    # Link existing attachments to this message
    if body.attachment_ids:
        if len(body.attachment_ids) > 10:
            raise HTTPException(status_code=400, detail="Maximum 10 attachments per message")
        result = await db.execute(
            select(MessageAttachment).where(
                MessageAttachment.id.in_(body.attachment_ids)
            )
        )
        found_attachments = list(result.scalars().all())
        for att in found_attachments:
            att.message_id = msg.id

    # Insert mentions (only for valid chat members)
    if body.mentions:
        # Get the set of active member user_ids in this chat
        member_result = await db.execute(
            select(ChatMember.user_id).where(
                and_(
                    ChatMember.chat_id == chat_id,
                    ChatMember.left_at.is_(None),
                )
            )
        )
        member_ids = {row[0] for row in member_result.all()}

        for mention in body.mentions:
            if mention.user_id in member_ids:
                db.add(MessageMention(
                    message_id=msg.id,
                    mentioned_user_id=mention.user_id,
                    offset=mention.offset,
                    length=mention.length,
                ))

    # Update chat denormalized fields
    chat.last_message_id = msg.id
    chat.last_message_at = msg.created_at
    chat.updated_at = msg.created_at

    await db.commit()
    await db.refresh(msg)

    # Reload with all relationships
    result = await db.execute(
        select(Message)
        .options(
            selectinload(Message.sender),
            selectinload(Message.reactions).selectinload(MessageReaction.user),
            selectinload(Message.mentions).selectinload(MessageMention.user),
            selectinload(Message.attachments),
            selectinload(Message.link_previews),
        )
        .where(Message.id == msg.id)
    )
    msg = result.scalar_one()

    # Load reply_to if needed
    reply_msg = None
    if msg.reply_to_id:
        result = await db.execute(
            select(Message)
            .options(selectinload(Message.sender))
            .where(Message.id == msg.reply_to_id)
        )
        reply_msg = result.scalar_one_or_none()

    # Extract and fetch link previews in background (don't block response)
    asyncio.create_task(process_link_previews(msg.id, chat_id, body.content))

    # Broadcast to all chat members via WebSocket
    asyncio.create_task(manager.broadcast_to_chat(chat_id, {
        "type": "message.new",
        "payload": {
            "chatId": chat_id,
            "message": {
                "id": msg.id,
                "chatId": chat_id,
                "sender": {
                    "id": msg.sender.id,
                    "displayName": msg.sender.display_name,
                    "avatarUrl": msg.sender.avatar_url,
                },
                "content": msg.content,
                "contentPlain": msg.content_plain,
                "type": msg.type.value,
                "replyToId": msg.reply_to_id,
                "isEdited": msg.is_edited,
                "createdAt": msg.created_at.isoformat(),
            },
        },
    }))

    return _build_message_response(msg, reply_msg, current_user_id=current_user.id)


@router.patch("/{chat_id}/messages/{message_id}", response_model=MessageResponse)
async def edit_message(
    chat_id: str,
    message_id: str,
    body: EditMessageRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_chat_membership(chat_id, current_user.id, db)

    result = await db.execute(
        select(Message)
        .options(selectinload(Message.sender))
        .where(and_(Message.id == message_id, Message.chat_id == chat_id))
    )
    msg = result.scalar_one_or_none()
    if msg is None:
        raise HTTPException(status_code=404, detail="Message not found")
    if msg.sender_id != current_user.id:
        raise HTTPException(status_code=403, detail="Can only edit your own messages")
    if msg.type != MessageType.text:
        raise HTTPException(status_code=400, detail="Cannot edit system or deleted messages")

    msg.content = body.content
    msg.content_plain = body.content
    msg.is_edited = True
    msg.edited_at = datetime.utcnow()
    msg.updated_at = datetime.utcnow()

    await db.commit()

    # Reload with all relationships
    result = await db.execute(
        select(Message)
        .options(
            selectinload(Message.sender),
            selectinload(Message.reactions).selectinload(MessageReaction.user),
            selectinload(Message.mentions).selectinload(MessageMention.user),
            selectinload(Message.attachments),
            selectinload(Message.link_previews),
        )
        .where(Message.id == message_id)
    )
    msg = result.scalar_one()

    return _build_message_response(msg, current_user_id=current_user.id)


@router.delete(
    "/{chat_id}/messages/{message_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_message(
    chat_id: str,
    message_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    membership = await _require_chat_membership(chat_id, current_user.id, db)

    result = await db.execute(
        select(Message).where(
            and_(Message.id == message_id, Message.chat_id == chat_id)
        )
    )
    msg = result.scalar_one_or_none()
    if msg is None:
        raise HTTPException(status_code=404, detail="Message not found")

    # Sender can delete own messages; owner/admin can delete any
    if msg.sender_id != current_user.id and membership.role not in (
        MemberRole.owner,
        MemberRole.admin,
    ):
        raise HTTPException(status_code=403, detail="Cannot delete this message")

    if msg.type == MessageType.system:
        raise HTTPException(status_code=400, detail="Cannot delete system messages")

    msg.content = ""
    msg.content_plain = ""
    msg.type = MessageType.deleted
    msg.is_deleted = True
    msg.deleted_at = datetime.utcnow()
    msg.updated_at = datetime.utcnow()

    await db.commit()


@router.post("/{chat_id}/messages/{message_id}/reactions")
async def toggle_reaction(
    chat_id: str,
    message_id: str,
    body: ReactRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_chat_membership(chat_id, current_user.id, db)

    # Verify message exists in this chat
    result = await db.execute(
        select(Message).where(
            and_(Message.id == message_id, Message.chat_id == chat_id)
        )
    )
    msg = result.scalar_one_or_none()
    if msg is None:
        raise HTTPException(status_code=404, detail="Message not found")

    # Check if reaction already exists (toggle behavior)
    result = await db.execute(
        select(MessageReaction).where(
            and_(
                MessageReaction.message_id == message_id,
                MessageReaction.user_id == current_user.id,
                MessageReaction.emoji == body.emoji,
            )
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        # Remove existing reaction
        await db.delete(existing)
        action = "removed"
    else:
        # Check max 20 distinct emoji per message
        result = await db.execute(
            select(func.count(func.distinct(MessageReaction.emoji))).where(
                MessageReaction.message_id == message_id
            )
        )
        distinct_count = result.scalar_one()
        if distinct_count >= 20:
            # Only reject if this is a brand new emoji (not one already used by others)
            result = await db.execute(
                select(MessageReaction.id).where(
                    and_(
                        MessageReaction.message_id == message_id,
                        MessageReaction.emoji == body.emoji,
                    )
                ).limit(1)
            )
            if result.scalar_one_or_none() is None:
                raise HTTPException(
                    status_code=400,
                    detail="Maximum 20 distinct emoji per message",
                )

        reaction = MessageReaction(
            message_id=message_id,
            user_id=current_user.id,
            emoji=body.emoji,
        )
        db.add(reaction)
        action = "added"

    await db.commit()

    return {"messageId": message_id, "emoji": body.emoji, "action": action}

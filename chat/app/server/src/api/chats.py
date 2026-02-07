from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..auth.dependencies import get_current_user
from ..db.engine import get_db
from ..db.models import Chat, ChatMember, ChatType, MemberRole, Message, User
from ..ws.manager import manager
from .schemas import (
    AddMembersRequest,
    AddMembersResponse,
    ChatListResponse,
    ChatResponse,
    CreateChatRequest,
    LastMessagePreview,
    MarkReadRequest,
    MemberInfo,
    ReadReceiptInfo,
    ReadReceiptListResponse,
    UpdateChatRequest,
)

router = APIRouter()


async def _get_chat_or_404(
    chat_id: str, db: AsyncSession
) -> Chat:
    result = await db.execute(
        select(Chat)
        .options(selectinload(Chat.members).selectinload(ChatMember.user))
        .where(Chat.id == chat_id)
    )
    chat = result.scalar_one_or_none()
    if chat is None:
        raise HTTPException(status_code=404, detail="Chat not found")
    return chat


async def _require_membership(
    chat: Chat, user_id: str, roles: list[MemberRole] | None = None
) -> ChatMember:
    for m in chat.members:
        if m.user_id == user_id and m.left_at is None:
            if roles and m.role not in roles:
                raise HTTPException(status_code=403, detail="Insufficient permissions")
            return m
    raise HTTPException(status_code=403, detail="Not a member of this chat")


async def _build_chat_response(
    chat: Chat, current_user_id: str, db: AsyncSession
) -> ChatResponse:
    members = [
        MemberInfo(
            user_id=m.user_id,
            display_name=m.user.display_name,
            avatar_url=m.user.avatar_url,
            role=m.role.value,
        )
        for m in chat.members
        if m.left_at is None
    ]

    last_message = None
    if chat.last_message_id:
        result = await db.execute(
            select(Message)
            .options(selectinload(Message.sender))
            .where(Message.id == chat.last_message_id)
        )
        msg = result.scalar_one_or_none()
        if msg:
            last_message = LastMessagePreview(
                id=msg.id,
                sender_id=msg.sender_id,
                sender_name=msg.sender.display_name,
                content_preview=msg.content_plain[:120] if msg.content_plain else "",
                type=msg.type.value,
                created_at=msg.created_at,
            )

    # Find current user's membership for muted/pinned
    my_membership = next(
        (m for m in chat.members if m.user_id == current_user_id and m.left_at is None),
        None,
    )

    # Unread count
    unread_count = 0
    if my_membership and my_membership.last_read_message_id:
        # Count messages after last read
        result = await db.execute(
            select(Message.created_at).where(
                Message.id == my_membership.last_read_message_id
            )
        )
        last_read_msg = result.scalar_one_or_none()
        if last_read_msg:
            result = await db.execute(
                select(func.count()).where(
                    and_(
                        Message.chat_id == chat.id,
                        Message.created_at > last_read_msg,
                    )
                )
            )
            unread_count = result.scalar() or 0
    elif my_membership:
        # Never read - all messages are unread
        result = await db.execute(
            select(func.count()).where(Message.chat_id == chat.id)
        )
        unread_count = result.scalar() or 0

    return ChatResponse(
        id=chat.id,
        type=chat.type.value,
        title=chat.title,
        members=members,
        last_message=last_message,
        unread_count=unread_count,
        is_muted=my_membership.is_muted if my_membership else False,
        is_pinned=my_membership.is_pinned if my_membership else False,
        created_by=chat.created_by,
        created_at=chat.created_at,
        updated_at=chat.updated_at,
    )


@router.get("", response_model=ChatListResponse)
async def list_chats(
    limit: int = Query(default=50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Get chat IDs where user is an active member
    member_q = select(ChatMember.chat_id).where(
        and_(ChatMember.user_id == current_user.id, ChatMember.left_at.is_(None))
    )
    result = await db.execute(
        select(Chat)
        .options(selectinload(Chat.members).selectinload(ChatMember.user))
        .where(Chat.id.in_(member_q))
        .order_by(Chat.last_message_at.desc().nulls_last(), Chat.created_at.desc())
        .limit(limit)
    )
    chats = result.scalars().all()

    chat_responses = []
    for chat in chats:
        chat_responses.append(await _build_chat_response(chat, current_user.id, db))

    return ChatListResponse(chats=chat_responses)


@router.post("", response_model=ChatResponse, status_code=status.HTTP_201_CREATED)
async def create_chat(
    body: CreateChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Ensure creator is in member_ids
    all_member_ids = list(set(body.member_ids + [current_user.id]))

    if body.type == "direct":
        if len(all_member_ids) != 2:
            raise HTTPException(
                status_code=400, detail="Direct chat requires exactly 2 members"
            )
        # Check for existing direct chat
        user_a, user_b = sorted(all_member_ids)
        result = await db.execute(
            select(Chat)
            .join(ChatMember, Chat.id == ChatMember.chat_id)
            .where(
                and_(
                    Chat.type == ChatType.direct,
                    ChatMember.user_id.in_([user_a, user_b]),
                    ChatMember.left_at.is_(None),
                )
            )
            .group_by(Chat.id)
            .having(func.count(ChatMember.id) == 2)
        )
        existing = result.scalar_one_or_none()
        if existing:
            raise HTTPException(
                status_code=409,
                detail={"message": "Direct chat already exists", "existing_chat_id": existing.id},
            )
    else:
        if len(all_member_ids) < 3:
            raise HTTPException(
                status_code=400, detail="Group chat requires at least 3 members"
            )
        if not body.title:
            raise HTTPException(
                status_code=400, detail="Group chat requires a title"
            )

    # Validate all member IDs exist
    result = await db.execute(select(User.id).where(User.id.in_(all_member_ids)))
    valid_ids = {row[0] for row in result.all()}
    invalid = set(all_member_ids) - valid_ids
    if invalid:
        raise HTTPException(status_code=400, detail=f"Invalid user IDs: {invalid}")

    chat = Chat(
        type=ChatType(body.type),
        title=body.title if body.type == "group" else None,
        created_by=current_user.id,
    )
    db.add(chat)
    await db.flush()

    for uid in all_member_ids:
        member = ChatMember(
            chat_id=chat.id,
            user_id=uid,
            role=MemberRole.owner if uid == current_user.id else MemberRole.member,
        )
        db.add(member)

    await db.commit()

    # Reload with relationships
    chat = await _get_chat_or_404(chat.id, db)

    # Notify other members via WebSocket so their sidebar updates
    for uid in all_member_ids:
        if uid != current_user.id:
            await manager.send_to_user(uid, {
                "type": "chat.created",
                "payload": {"chatId": chat.id},
            })

    return await _build_chat_response(chat, current_user.id, db)


@router.get("/{chat_id}", response_model=ChatResponse)
async def get_chat(
    chat_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    chat = await _get_chat_or_404(chat_id, db)
    await _require_membership(chat, current_user.id)
    return await _build_chat_response(chat, current_user.id, db)


@router.patch("/{chat_id}", response_model=ChatResponse)
async def update_chat(
    chat_id: str,
    body: UpdateChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    chat = await _get_chat_or_404(chat_id, db)
    await _require_membership(chat, current_user.id, [MemberRole.owner, MemberRole.admin])

    if body.title is not None:
        chat.title = body.title
    chat.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(chat)

    chat = await _get_chat_or_404(chat.id, db)
    return await _build_chat_response(chat, current_user.id, db)


@router.post("/{chat_id}/leave", status_code=status.HTTP_204_NO_CONTENT)
async def leave_chat(
    chat_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    chat = await _get_chat_or_404(chat_id, db)
    if chat.type == ChatType.direct:
        raise HTTPException(status_code=400, detail="Cannot leave a direct chat")

    membership = await _require_membership(chat, current_user.id)
    membership.left_at = datetime.utcnow()

    # Transfer ownership if owner leaves
    if membership.role == MemberRole.owner:
        active_members = [m for m in chat.members if m.left_at is None and m.user_id != current_user.id]
        if active_members:
            # Prefer admins, then oldest member
            admins = [m for m in active_members if m.role == MemberRole.admin]
            new_owner = admins[0] if admins else min(active_members, key=lambda m: m.joined_at)
            new_owner.role = MemberRole.owner

    await db.commit()


@router.post("/{chat_id}/members", response_model=AddMembersResponse)
async def add_members(
    chat_id: str,
    body: AddMembersRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    chat = await _get_chat_or_404(chat_id, db)
    if chat.type == ChatType.direct:
        raise HTTPException(status_code=400, detail="Cannot add members to direct chat")
    await _require_membership(chat, current_user.id, [MemberRole.owner, MemberRole.admin])

    existing_ids = {m.user_id for m in chat.members if m.left_at is None}
    added = []
    already = []

    for uid in body.user_ids:
        if uid in existing_ids:
            already.append(uid)
        else:
            # Verify user exists
            result = await db.execute(select(User).where(User.id == uid))
            if result.scalar_one_or_none():
                member = ChatMember(chat_id=chat.id, user_id=uid, role=MemberRole.member)
                db.add(member)
                added.append(uid)

    await db.commit()
    return AddMembersResponse(added=added, already_members=already)


@router.delete("/{chat_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    chat_id: str,
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    chat = await _get_chat_or_404(chat_id, db)
    if chat.type == ChatType.direct:
        raise HTTPException(status_code=400, detail="Cannot remove members from direct chat")
    await _require_membership(chat, current_user.id, [MemberRole.owner, MemberRole.admin])

    target = next(
        (m for m in chat.members if m.user_id == user_id and m.left_at is None),
        None,
    )
    if target is None:
        raise HTTPException(status_code=404, detail="Member not found")
    if target.role == MemberRole.owner:
        raise HTTPException(status_code=400, detail="Cannot remove the owner")

    target.left_at = datetime.utcnow()
    await db.commit()


@router.post("/{chat_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_read(
    chat_id: str,
    body: MarkReadRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    chat = await _get_chat_or_404(chat_id, db)
    membership = await _require_membership(chat, current_user.id)

    # Verify the message exists in this chat
    result = await db.execute(
        select(Message).where(
            and_(Message.id == body.message_id, Message.chat_id == chat_id)
        )
    )
    target_msg = result.scalar_one_or_none()
    if target_msg is None:
        raise HTTPException(status_code=404, detail="Message not found in this chat")

    # Only move forward: if there's already a last_read, check timestamps
    if membership.last_read_message_id:
        result = await db.execute(
            select(Message.created_at).where(
                Message.id == membership.last_read_message_id
            )
        )
        current_read_at = result.scalar_one_or_none()
        if current_read_at and target_msg.created_at <= current_read_at:
            return  # Already read past this point

    membership.last_read_message_id = body.message_id
    await db.commit()


@router.get("/{chat_id}/read-receipts", response_model=ReadReceiptListResponse)
async def get_read_receipts(
    chat_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    chat = await _get_chat_or_404(chat_id, db)
    await _require_membership(chat, current_user.id)

    receipts = [
        ReadReceiptInfo(
            user_id=m.user_id,
            display_name=m.user.display_name,
            last_read_message_id=m.last_read_message_id,
        )
        for m in chat.members
        if m.left_at is None
    ]

    return ReadReceiptListResponse(receipts=receipts)

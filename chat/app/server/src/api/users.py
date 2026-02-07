from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.dependencies import get_current_user
from ..db.engine import get_db
from ..db.models import ChatMember, User
from .schemas import UserSearchResponse, UserSearchResult

router = APIRouter()


@router.get("/search", response_model=UserSearchResponse)
async def search_users(
    q: str = Query(default="", max_length=256),
    chat_id: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if chat_id:
        # Verify caller is a member of the chat
        result = await db.execute(
            select(ChatMember).where(
                and_(
                    ChatMember.chat_id == chat_id,
                    ChatMember.user_id == current_user.id,
                    ChatMember.left_at.is_(None),
                )
            )
        )
        if result.scalar_one_or_none() is None:
            raise HTTPException(status_code=403, detail="Not a member of this chat")

        # Search members of this chat by display_name prefix
        conditions = [
            ChatMember.chat_id == chat_id,
            ChatMember.left_at.is_(None),
        ]
        if q:
            conditions.append(User.display_name.ilike(f"{q}%"))
        query = (
            select(User)
            .join(ChatMember, ChatMember.user_id == User.id)
            .where(and_(*conditions))
            .limit(20)
        )
    else:
        # Search all users (exclude self)
        conditions = [User.id != current_user.id]
        if q:
            conditions.append(User.display_name.ilike(f"{q}%"))
        query = (
            select(User)
            .where(and_(*conditions))
            .order_by(User.display_name)
            .limit(20)
        )

    result = await db.execute(query)
    users = result.scalars().all()

    return UserSearchResponse(
        users=[
            UserSearchResult(
                id=u.id,
                display_name=u.display_name,
                avatar_url=u.avatar_url,
            )
            for u in users
        ]
    )

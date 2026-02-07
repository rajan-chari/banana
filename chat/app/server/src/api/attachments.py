from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.dependencies import get_current_user
from ..config import settings
from ..db.engine import get_db
from ..db.models import (
    Chat,
    ChatMember,
    Message,
    MessageAttachment,
    MessageType,
    User,
)
from .schemas import AttachmentResponse

router = APIRouter()

MAX_FILE_SIZE = 250 * 1024 * 1024  # 250 MB
MAX_ATTACHMENTS_PER_MESSAGE = 10

ALLOWED_MIME_TYPES = {
    # Images
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
    "image/bmp",
    "image/tiff",
    # Documents
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "text/csv",
    "text/markdown",
    # Archives
    "application/zip",
    "application/x-tar",
    "application/gzip",
    "application/x-7z-compressed",
    "application/x-rar-compressed",
    # Code
    "text/x-python",
    "text/javascript",
    "application/javascript",
    "text/html",
    "text/css",
    "application/json",
    "application/xml",
    "text/xml",
    "text/x-c",
    "text/x-c++",
    "text/x-java",
    "text/x-typescript",
    # Generic binary fallback
    "application/octet-stream",
}


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


def _attachment_url(chat_id: str, attachment_id: str) -> str:
    return f"/api/v1/chats/{chat_id}/attachments/{attachment_id}/download"


def _build_attachment_response(att: MessageAttachment, chat_id: str) -> AttachmentResponse:
    return AttachmentResponse(
        id=att.id,
        message_id=att.message_id,
        file_name=att.file_name,
        file_size=att.file_size,
        mime_type=att.mime_type,
        url=_attachment_url(chat_id, att.id),
        width=att.width,
        height=att.height,
        created_at=att.created_at,
    )


@router.post(
    "/{chat_id}/attachments",
    response_model=AttachmentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_attachment(
    chat_id: str,
    file: UploadFile,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_chat_membership(chat_id, current_user.id, db)

    # Verify chat exists
    result = await db.execute(select(Chat).where(Chat.id == chat_id))
    chat = result.scalar_one_or_none()
    if chat is None:
        raise HTTPException(status_code=404, detail="Chat not found")

    # Validate mime type
    mime_type = file.content_type or "application/octet-stream"
    if mime_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail=f"File type not allowed: {mime_type}")

    # Read file content and check size
    content = await file.read()
    file_size = len(content)
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 250 MB)")
    if file_size == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    # Create storage directory
    storage_dir = settings.BASE_DIR / "data" / "attachments" / chat_id
    storage_dir.mkdir(parents=True, exist_ok=True)

    # Generate unique filename
    file_name = file.filename or "unnamed"
    unique_name = f"{uuid4()}_{file_name}"
    storage_path = storage_dir / unique_name

    # Write file to disk
    with open(storage_path, "wb") as f:
        f.write(content)

    # Create a new message of type "attachment"
    msg = Message(
        chat_id=chat_id,
        sender_id=current_user.id,
        content=f"[Attachment: {file_name}]",
        content_plain=f"[Attachment: {file_name}]",
        type=MessageType.attachment,
    )
    db.add(msg)
    await db.flush()

    # Update chat denormalized fields
    chat.last_message_id = msg.id
    chat.last_message_at = msg.created_at
    chat.updated_at = msg.created_at

    # Create attachment record
    attachment = MessageAttachment(
        message_id=msg.id,
        file_name=file_name,
        file_size=file_size,
        mime_type=mime_type,
        storage_path=str(storage_path),
    )
    db.add(attachment)
    await db.commit()
    await db.refresh(attachment)

    return _build_attachment_response(attachment, chat_id)


@router.get("/{chat_id}/attachments/{attachment_id}/download")
async def download_attachment(
    chat_id: str,
    attachment_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_chat_membership(chat_id, current_user.id, db)

    result = await db.execute(
        select(MessageAttachment)
        .join(Message, MessageAttachment.message_id == Message.id)
        .where(
            and_(
                MessageAttachment.id == attachment_id,
                Message.chat_id == chat_id,
            )
        )
    )
    attachment = result.scalar_one_or_none()
    if attachment is None:
        raise HTTPException(status_code=404, detail="Attachment not found")

    file_path = Path(attachment.storage_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    return FileResponse(
        path=str(file_path),
        media_type=attachment.mime_type,
        filename=attachment.file_name,
        headers={"Content-Disposition": f'attachment; filename="{attachment.file_name}"'},
    )

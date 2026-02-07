from datetime import datetime

from pydantic import BaseModel, Field


# --- Chat Schemas ---

class CreateChatRequest(BaseModel):
    type: str = Field(pattern=r"^(direct|group)$")
    member_ids: list[str]
    title: str | None = None


class UpdateChatRequest(BaseModel):
    title: str | None = None


class MemberInfo(BaseModel):
    user_id: str
    display_name: str
    avatar_url: str | None = None
    role: str

    model_config = {"from_attributes": True}


class LastMessagePreview(BaseModel):
    id: str
    sender_id: str
    sender_name: str
    content_preview: str
    type: str
    created_at: datetime


class ChatResponse(BaseModel):
    id: str
    type: str
    title: str | None = None
    members: list[MemberInfo] = []
    last_message: LastMessagePreview | None = None
    unread_count: int = 0
    is_muted: bool = False
    is_pinned: bool = False
    created_by: str
    created_at: datetime
    updated_at: datetime


class ChatListResponse(BaseModel):
    chats: list[ChatResponse]
    next_cursor: str | None = None


class AddMembersRequest(BaseModel):
    user_ids: list[str]


class AddMembersResponse(BaseModel):
    added: list[str]
    already_members: list[str]


# --- Reaction Schemas ---

class ReactRequest(BaseModel):
    emoji: str = Field(max_length=32)


class ReactionUserInfo(BaseModel):
    id: str
    display_name: str


class ReactionSummary(BaseModel):
    emoji: str
    count: int
    users: list[ReactionUserInfo]
    reacted_by_me: bool = False


# --- Mention Schemas ---

class MentionRequest(BaseModel):
    user_id: str
    offset: int = Field(ge=0)
    length: int = Field(ge=1)


class MentionInfo(BaseModel):
    user_id: str
    display_name: str
    offset: int
    length: int


class UserSearchResult(BaseModel):
    id: str
    display_name: str
    avatar_url: str | None = None


class UserSearchResponse(BaseModel):
    users: list[UserSearchResult]


# --- Attachment Schemas ---

class AttachmentInfo(BaseModel):
    id: str
    file_name: str
    file_size: int
    mime_type: str
    url: str
    width: int | None = None
    height: int | None = None


class AttachmentResponse(BaseModel):
    id: str
    message_id: str
    file_name: str
    file_size: int
    mime_type: str
    url: str
    width: int | None = None
    height: int | None = None
    created_at: datetime


# --- Link Preview Schemas ---

class LinkPreviewInfo(BaseModel):
    url: str
    title: str | None = None
    description: str | None = None
    image_url: str | None = None
    domain: str


# --- Message Schemas ---

class SendMessageRequest(BaseModel):
    content: str = Field(max_length=28000)
    reply_to_id: str | None = None
    mentions: list[MentionRequest] | None = None
    attachment_ids: list[str] | None = None


class EditMessageRequest(BaseModel):
    content: str = Field(max_length=28000)


class SenderInfo(BaseModel):
    id: str
    display_name: str
    avatar_url: str | None = None


class ReplyPreview(BaseModel):
    id: str
    sender_name: str
    content_preview: str
    created_at: datetime


class MessageResponse(BaseModel):
    id: str
    chat_id: str
    sender: SenderInfo
    content: str
    content_plain: str
    type: str
    reply_to: ReplyPreview | None = None
    reactions: list[ReactionSummary] = []
    mentions: list[MentionInfo] = []
    attachments: list[AttachmentInfo] = []
    link_previews: list[LinkPreviewInfo] = []
    is_edited: bool
    edited_at: datetime | None = None
    created_at: datetime


class MessageListResponse(BaseModel):
    messages: list[MessageResponse]
    has_more: bool = False


# --- Read Receipt Schemas ---

class MarkReadRequest(BaseModel):
    message_id: str


class ReadReceiptInfo(BaseModel):
    user_id: str
    display_name: str
    last_read_message_id: str | None = None


class ReadReceiptListResponse(BaseModel):
    receipts: list[ReadReceiptInfo]

export type UserStatus = 'online' | 'away' | 'busy' | 'offline';

export interface User {
  id: string;
  displayName: string;
  avatarUrl?: string;
  initials: string;
  status: UserStatus;
}

export type ChatType = 'direct' | 'group';

export interface ChatPreview {
  id: string;
  type: ChatType;
  title: string;
  avatarInitials: string;
  lastMessage?: {
    senderName: string;
    content: string;
    timestamp: Date;
  };
  unreadCount: number;
  isMuted: boolean;
  isPinned: boolean;
  members: User[];
}

export interface Mention {
  userId: string;
  displayName: string;
  offset: number;
  length: number;
}

export interface Reaction {
  emoji: string;
  count: number;
  users: { id: string; displayName: string }[];
  reactedByMe: boolean;
}

export interface Attachment {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  url: string;
  width?: number;
  height?: number;
}

export interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  domain: string;
}

export type MessageType = 'text' | 'system' | 'deleted';

export interface Message {
  id: string;
  chatId: string;
  sender: User;
  content: string;
  type: MessageType;
  replyTo?: {
    id: string;
    senderName: string;
    contentPreview: string;
  };
  mentions?: Mention[];
  reactions: Reaction[];
  attachments?: Attachment[];
  linkPreviews?: LinkPreview[];
  isEdited: boolean;
  createdAt: Date;
}

export interface ReadReceipt {
  userId: string;
  displayName: string;
  lastReadMessageId: string;
}

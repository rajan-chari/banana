import { useState, useEffect, useCallback, useRef } from 'react';
import type { ChatPreview, Message, Mention, Reaction, Attachment, User, MessageType, ReadReceipt, LinkPreview } from '../types/chat';
import type { ChatResponse, MessageResponse, ReactionResponse, SendMention } from '../api/client';
import * as api from '../api/client';
import { chatWS } from '../api/websocket';

// --- Helpers ---

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  return words
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?';
}

function mapChatResponse(c: ChatResponse, currentUserId?: string): ChatPreview {
  const members: User[] = (c.members || []).map((m: any) => ({
    id: m.user_id,
    displayName: m.display_name,
    avatarUrl: m.avatar_url,
    initials: getInitials(m.display_name),
    status: m.status || 'offline',
  }));

  // For direct chats, derive title from the other member's name
  let title = c.title || '';
  if (c.type === 'direct' && !c.title) {
    const other = members.find((m) => m.id !== currentUserId) ?? members[0];
    title = other?.displayName || 'Direct Message';
  }

  return {
    id: c.id,
    type: c.type as ChatPreview['type'],
    title,
    avatarInitials: getInitials(title || members[0]?.displayName || '?'),
    lastMessage: c.last_message
      ? {
          senderName: c.last_message.sender_name,
          content: c.last_message.content_preview,
          timestamp: new Date(c.last_message.created_at),
        }
      : undefined,
    unreadCount: c.unread_count,
    isMuted: c.is_muted,
    isPinned: c.is_pinned,
    members,
  };
}

function mapMentions(raw?: any[]): Mention[] | undefined {
  if (!raw || raw.length === 0) return undefined;
  return raw.map((r: any) => ({
    userId: r.user_id ?? r.userId,
    displayName: r.display_name ?? r.displayName ?? '',
    offset: r.offset,
    length: r.length,
  }));
}

function mapReactions(raw?: ReactionResponse[]): Reaction[] {
  if (!raw || raw.length === 0) return [];
  return raw.map((r) => ({
    emoji: r.emoji,
    count: r.count,
    users: r.users.map((u) => ({ id: u.id, displayName: u.display_name })),
    reactedByMe: r.reacted_by_me,
  }));
}

function mapLinkPreviews(raw?: any[]): LinkPreview[] | undefined {
  if (!raw || raw.length === 0) return undefined;
  return raw.map((r: any) => ({
    url: r.url,
    title: r.title ?? null,
    description: r.description ?? null,
    imageUrl: r.image_url ?? r.imageUrl ?? null,
    domain: r.domain,
  }));
}

function mapAttachments(raw?: any[]): Attachment[] | undefined {
  if (!raw || raw.length === 0) return undefined;
  return raw.map((a: any) => ({
    id: a.id,
    fileName: a.file_name ?? a.fileName,
    fileSize: a.file_size ?? a.fileSize,
    mimeType: a.mime_type ?? a.mimeType,
    url: a.url,
    width: a.width,
    height: a.height,
  }));
}

function mapMessageResponse(m: MessageResponse): Message {
  const sender: User = {
    id: m.sender?.id ?? '',
    displayName: m.sender?.display_name ?? '',
    avatarUrl: m.sender?.avatar_url,
    initials: getInitials(m.sender?.display_name ?? '?'),
    status: 'online',
  };

  return {
    id: m.id,
    chatId: m.chat_id,
    sender,
    content: m.content,
    type: m.type as MessageType,
    replyTo: m.reply_to
      ? {
          id: m.reply_to.id,
          senderName: m.reply_to.sender_name,
          contentPreview: m.reply_to.content_preview,
        }
      : undefined,
    mentions: mapMentions(m.mentions),
    reactions: mapReactions(m.reactions),
    attachments: mapAttachments(m.attachments),
    linkPreviews: mapLinkPreviews(m.link_previews),
    isEdited: m.is_edited,
    createdAt: new Date(m.created_at),
  };
}

// Map a camelCase WS message payload to a Message (WS payloads are already camelCase)
function mapWSMessage(payload: any): Message {
  const msg = payload.message ?? payload;
  const sender: User = {
    id: msg.sender?.id ?? '',
    displayName: msg.sender?.displayName ?? '',
    avatarUrl: msg.sender?.avatarUrl,
    initials: getInitials(msg.sender?.displayName ?? '?'),
    status: 'online',
  };

  return {
    id: msg.id,
    chatId: msg.chatId,
    sender,
    content: msg.content,
    type: msg.type as MessageType,
    replyTo: msg.replyTo
      ? {
          id: msg.replyTo.id,
          senderName: msg.replyTo.senderName,
          contentPreview: msg.replyTo.contentPreview,
        }
      : undefined,
    mentions: mapMentions(msg.mentions),
    reactions: [],
    attachments: mapAttachments(msg.attachments),
    isEdited: msg.isEdited ?? false,
    createdAt: new Date(msg.createdAt),
  };
}

// --- useChats ---

export function useChats(currentUserId?: string): {
  chats: ChatPreview[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  clearUnread: (chatId: string) => void;
} {
  const [chats, setChats] = useState<ChatPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchChats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getChats();
      const mapped = res.chats.map((c) => mapChatResponse(c, currentUserId));
      mapped.sort((a, b) => {
        const aTime = a.lastMessage?.timestamp?.getTime() ?? 0;
        const bTime = b.lastMessage?.timestamp?.getTime() ?? 0;
        return bTime - aTime;
      });
      setChats(mapped);
    } catch (e: any) {
      setError(e.message || 'Failed to load chats');
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  // Refresh chat list when a new chat is created (other user started a chat with us)
  useEffect(() => {
    const unsub = chatWS.on('chat.created', () => {
      fetchChats();
    });
    return unsub;
  }, [fetchChats]);

  // Update chat list when a new message arrives on any chat
  useEffect(() => {
    const unsub = chatWS.on('message.new', (payload: any) => {
      const msg = payload.message ?? payload;
      const chatId = payload.chatId ?? msg.chatId;
      if (!chatId) return;

      setChats((prev) => {
        const idx = prev.findIndex((c) => c.id === chatId);
        if (idx === -1) return prev;

        const updated = [...prev];
        const chat = { ...updated[idx]! };
        chat.lastMessage = {
          senderName: msg.sender?.displayName ?? msg.senderName ?? '',
          content: msg.contentPlain ?? msg.content ?? '',
          timestamp: new Date(msg.createdAt ?? Date.now()),
        };
        updated.splice(idx, 1);
        // Insert at top (most recent)
        updated.unshift(chat);
        return updated;
      });
    });

    return unsub;
  }, []);

  const clearUnread = useCallback((chatId: string) => {
    setChats((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, unreadCount: 0 } : c)),
    );
  }, []);

  return { chats, loading, error, refresh: fetchChats, clearUnread };
}

// --- useMessages ---

export function useMessages(chatId: string): {
  messages: Message[];
  loading: boolean;
  hasMore: boolean;
  loadMore: () => void;
  sendMessage: (content: string, replyToId?: string, mentions?: SendMention[], attachmentIds?: string[]) => Promise<void>;
  editMessage: (messageId: string, content: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  toggleReaction: (messageId: string, emoji: string) => Promise<void>;
} {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const loadingMore = useRef(false);

  // Initial fetch
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessages([]);

    api
      .getMessages(chatId, 50)
      .then((res) => {
        if (cancelled) return;
        setMessages(res.messages.map(mapMessageResponse));
        setHasMore(res.has_more);
      })
      .catch(() => {
        // Error handled silently; messages stay empty
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [chatId]);

  // Load older messages
  const loadMore = useCallback(() => {
    if (loadingMore.current || !hasMore || messages.length === 0) return;
    loadingMore.current = true;

    const oldest = messages[0]!;
    api
      .getMessages(chatId, 50, oldest.id)
      .then((res) => {
        const older = res.messages.map(mapMessageResponse);
        setMessages((prev) => [...older, ...prev]);
        setHasMore(res.has_more);
      })
      .finally(() => {
        loadingMore.current = false;
      });
  }, [chatId, hasMore, messages]);

  // WebSocket subscriptions
  useEffect(() => {
    const unsubNew = chatWS.on('message.new', (payload: any) => {
      const msgChatId = payload.chatId ?? payload.message?.chatId;
      if (msgChatId !== chatId) return;

      const msg = mapWSMessage(payload);
      setMessages((prev) => {
        // Deduplicate (sender also receives broadcast)
        if (prev.some((m) => m.id === msg.id)) return prev;
        // Replace optimistic temp message if sender matches
        const withoutTemp = prev.filter(
          (m) => !(m.id.startsWith('temp-') && m.sender.id === msg.sender.id && m.content === msg.content),
        );
        return [...withoutTemp, msg];
      });
    });

    const unsubUpdated = chatWS.on('message.updated', (payload: any) => {
      const msgChatId = payload.chatId ?? payload.message?.chatId;
      if (msgChatId !== chatId) return;

      const updated = mapWSMessage(payload);
      setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    });

    const unsubDeleted = chatWS.on('message.deleted', (payload: any) => {
      const msgChatId = payload.chatId ?? payload.message?.chatId;
      if (msgChatId !== chatId) return;

      const msgId = payload.messageId ?? payload.message?.id ?? payload.id;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId ? { ...m, type: 'deleted' as const, content: '' } : m,
        ),
      );
    });

    const unsubReaction = chatWS.on('message.reaction', (payload: any) => {
      if (payload.chatId !== chatId) return;
      const { messageId, emoji, userId, displayName, action } = payload;

      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          const reactions = [...m.reactions];
          const idx = reactions.findIndex((r) => r.emoji === emoji);

          if (action === 'added') {
            if (idx === -1) {
              reactions.push({
                emoji,
                count: 1,
                users: [{ id: userId, displayName }],
                reactedByMe: false, // WS doesn't tell us; API call handles optimistic
              });
            } else {
              const r = { ...reactions[idx]! };
              if (!r.users.some((u) => u.id === userId)) {
                r.count += 1;
                r.users = [...r.users, { id: userId, displayName }];
              }
              reactions[idx] = r;
            }
          } else if (action === 'removed') {
            if (idx !== -1) {
              const r = { ...reactions[idx]! };
              r.count -= 1;
              r.users = r.users.filter((u) => u.id !== userId);
              if (r.count <= 0) {
                reactions.splice(idx, 1);
              } else {
                reactions[idx] = r;
              }
            }
          }

          return { ...m, reactions };
        }),
      );
    });

    const unsubLinkPreviews = chatWS.on('message.link_previews', (payload: any) => {
      if (payload.chatId !== chatId) return;
      const messageId = payload.messageId;
      const previews = mapLinkPreviews(payload.linkPreviews);
      if (!messageId || !previews) return;

      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, linkPreviews: previews } : m)),
      );
    });

    return () => {
      unsubNew();
      unsubUpdated();
      unsubDeleted();
      unsubReaction();
      unsubLinkPreviews();
    };
  }, [chatId]);

  const send = useCallback(
    async (content: string, replyToId?: string, mentions?: SendMention[], attachmentIds?: string[]) => {
      // Optimistic append
      const tempId = `temp-${Date.now()}`;
      const tempMsg: Message = {
        id: tempId,
        chatId,
        sender: { id: '', displayName: '', initials: '?', status: 'online' },
        content,
        type: 'text',
        reactions: [],
        isEdited: false,
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, tempMsg]);

      try {
        const res = await api.sendMessage(chatId, content, replyToId, mentions, attachmentIds);
        const real = mapMessageResponse(res);
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? real : m)).filter(
            // Deduplicate if WS arrived first
            (m, i, arr) => arr.findIndex((x) => x.id === m.id) === i,
          ),
        );
      } catch {
        // Remove optimistic message on failure
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
      }
    },
    [chatId],
  );

  const edit = useCallback(
    async (messageId: string, content: string) => {
      // Optimistic update
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, content, isEdited: true } : m)),
      );
      try {
        const res = await api.editMessage(chatId, messageId, content);
        const updated = mapMessageResponse(res);
        setMessages((prev) => prev.map((m) => (m.id === messageId ? updated : m)));
      } catch {
        // Revert would require storing previous value; leave optimistic for now
      }
    },
    [chatId],
  );

  const del = useCallback(
    async (messageId: string) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, type: 'deleted' as const, content: '' } : m,
        ),
      );
      try {
        await api.deleteMessage(chatId, messageId);
      } catch {
        // Already marked as deleted optimistically
      }
    },
    [chatId],
  );

  const react = useCallback(
    async (messageId: string, emoji: string) => {
      // Optimistic toggle
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          const reactions = [...m.reactions];
          const idx = reactions.findIndex((r) => r.emoji === emoji);

          if (idx === -1) {
            // Add new reaction
            reactions.push({ emoji, count: 1, users: [], reactedByMe: true });
          } else {
            const r = { ...reactions[idx]! };
            if (r.reactedByMe) {
              // Remove own reaction
              r.count -= 1;
              r.reactedByMe = false;
              if (r.count <= 0) {
                reactions.splice(idx, 1);
              } else {
                reactions[idx] = r;
              }
            } else {
              // Add own reaction
              r.count += 1;
              r.reactedByMe = true;
              reactions[idx] = r;
            }
          }

          return { ...m, reactions };
        }),
      );

      try {
        await api.toggleReaction(chatId, messageId, emoji);
      } catch {
        // Revert not implemented; WS event will correct state
      }
    },
    [chatId],
  );

  return {
    messages,
    loading,
    hasMore,
    loadMore,
    sendMessage: send,
    editMessage: edit,
    deleteMessage: del,
    toggleReaction: react,
  };
}

// --- useTyping ---

export function useTyping(chatId: string): {
  typingUsers: string[];
  sendTyping: () => void;
} {
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSending = useRef(false);

  useEffect(() => {
    setTypingUsers([]);
    typingTimers.current.clear();

    const unsub = chatWS.on('typing.indicator', (payload: any) => {
      if (payload.chatId !== chatId) return;
      const name: string = payload.displayName ?? payload.userName ?? '';
      const active: boolean = payload.active ?? false;

      if (active) {
        setTypingUsers((prev) => (prev.includes(name) ? prev : [...prev, name]));

        // Auto-expire after 5s
        const existing = typingTimers.current.get(name);
        if (existing) clearTimeout(existing);
        typingTimers.current.set(
          name,
          setTimeout(() => {
            setTypingUsers((prev) => prev.filter((n) => n !== name));
            typingTimers.current.delete(name);
          }, 5000),
        );
      } else {
        // stop
        setTypingUsers((prev) => prev.filter((n) => n !== name));
        const existing = typingTimers.current.get(name);
        if (existing) {
          clearTimeout(existing);
          typingTimers.current.delete(name);
        }
      }
    });

    return () => {
      unsub();
      typingTimers.current.forEach((t) => clearTimeout(t));
      typingTimers.current.clear();
    };
  }, [chatId]);

  const sendTyping = useCallback(() => {
    if (!isSending.current) {
      isSending.current = true;
      chatWS.startTyping(chatId);
    }

    // Reset the stop timer on every keystroke
    if (stopTimer.current) clearTimeout(stopTimer.current);
    stopTimer.current = setTimeout(() => {
      chatWS.stopTyping(chatId);
      isSending.current = false;
      stopTimer.current = null;
    }, 3000);
  }, [chatId]);

  // Cleanup stop timer on unmount
  useEffect(() => {
    return () => {
      if (stopTimer.current) {
        clearTimeout(stopTimer.current);
        chatWS.stopTyping(chatId);
      }
    };
  }, [chatId]);

  return { typingUsers, sendTyping };
}

// --- useReadReceipts ---

export function useReadReceipts(
  chatId: string,
  messages: Message[],
  currentUserId: string | undefined,
): {
  readReceipts: ReadReceipt[];
  markRead: () => void;
} {
  const [readReceipts, setReadReceipts] = useState<ReadReceipt[]>([]);
  const markReadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMarkedId = useRef<string | null>(null);

  // Fetch initial read receipts
  useEffect(() => {
    let cancelled = false;
    api.getReadReceipts(chatId).then((res) => {
      if (cancelled) return;
      setReadReceipts(
        res.receipts.map((r) => ({
          userId: r.user_id,
          displayName: r.display_name,
          lastReadMessageId: r.last_read_message_id,
        })),
      );
    }).catch(() => { /* ignore */ });

    return () => { cancelled = true; };
  }, [chatId]);

  // Listen for read.receipt WS events
  useEffect(() => {
    const unsub = chatWS.on('read.receipt', (payload: any) => {
      if (payload.chatId !== chatId) return;
      setReadReceipts((prev) => {
        const idx = prev.findIndex((r) => r.userId === payload.userId);
        const receipt: ReadReceipt = {
          userId: payload.userId,
          displayName: payload.displayName,
          lastReadMessageId: payload.messageId,
        };
        if (idx === -1) return [...prev, receipt];
        const updated = [...prev];
        updated[idx] = receipt;
        return updated;
      });
    });
    return unsub;
  }, [chatId]);

  // Debounced mark-as-read
  const markRead = useCallback(() => {
    if (!currentUserId || messages.length === 0) return;
    const newestMsg = messages[messages.length - 1]!;
    // Skip if already marked this message or it's our temp message
    if (newestMsg.id === lastMarkedId.current || newestMsg.id.startsWith('temp-')) return;

    if (markReadTimer.current) clearTimeout(markReadTimer.current);
    markReadTimer.current = setTimeout(() => {
      lastMarkedId.current = newestMsg.id;
      api.markAsRead(chatId, newestMsg.id).catch(() => { /* ignore */ });
    }, 500);
  }, [chatId, messages, currentUserId]);

  // Cleanup timer
  useEffect(() => {
    return () => {
      if (markReadTimer.current) clearTimeout(markReadTimer.current);
    };
  }, [chatId]);

  return { readReceipts, markRead };
}

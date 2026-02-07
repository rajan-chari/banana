import { useState, useCallback, useEffect } from 'react';
import { ChatHeader } from '../../organisms/ChatHeader';
import { MessageArea } from '../../organisms/MessageArea';
import { ComposeBar } from '../../organisms/ComposeBar';
import type { ChatPreview } from '../../../types/chat';
import type { SendMention } from '../../../api/client';
import { useMessages, useTyping, useReadReceipts } from '../../../hooks/useChat';
import { useAuth } from '../../../hooks/useAuth';
import styles from './ChatView.module.css';

interface ChatViewProps {
  chat: ChatPreview;
  onMarkRead?: () => void;
}

export function ChatView({ chat, onMarkRead }: ChatViewProps) {
  const [replyTo, setReplyTo] = useState<{
    messageId: string;
    senderName: string;
    contentPreview: string;
  } | null>(null);

  const { user } = useAuth();
  const { messages, loading, hasMore, loadMore, sendMessage, toggleReaction } = useMessages(chat.id);
  const { typingUsers, sendTyping } = useTyping(chat.id);
  const { readReceipts, markRead } = useReadReceipts(chat.id, messages, user?.id);

  // Auto mark-as-read when chat is selected and when new messages arrive
  useEffect(() => {
    if (messages.length > 0 && !loading) {
      markRead();
      onMarkRead?.();
    }
  }, [messages.length, loading, markRead, onMarkRead]);

  const handleReply = useCallback(
    (messageId: string) => {
      const msg = messages.find((m) => m.id === messageId);
      if (!msg) return;
      setReplyTo({
        messageId: msg.id,
        senderName: msg.sender.displayName,
        contentPreview: msg.content.substring(0, 100),
      });
    },
    [messages],
  );

  const handleSend = useCallback(
    (content: string, mentions?: SendMention[], attachmentIds?: string[]) => {
      sendMessage(content, replyTo?.messageId, mentions, attachmentIds);
      setReplyTo(null);
    },
    [sendMessage, replyTo],
  );

  const typingText =
    typingUsers.length === 0
      ? null
      : typingUsers.length === 1
        ? `${typingUsers[0]} is typing...`
        : `${typingUsers.join(', ')} are typing...`;

  return (
    <div className={styles.chatView}>
      <ChatHeader
        name={chat.title}
        type={chat.type}
        memberCount={chat.type === 'group' ? chat.members.length : undefined}
      />
      <MessageArea
        messages={messages}
        loading={loading}
        hasMore={hasMore}
        onLoadMore={loadMore}
        onReply={handleReply}
        onToggleReaction={toggleReaction}
        readReceipts={readReceipts}
        currentUserId={user?.id}
      />
      {typingText && <div className={styles.typingIndicator}>{typingText}</div>}
      <ComposeBar
        chatId={chat.id}
        replyTo={replyTo}
        onSend={handleSend}
        onCancelReply={() => setReplyTo(null)}
        onTyping={sendTyping}
      />
    </div>
  );
}

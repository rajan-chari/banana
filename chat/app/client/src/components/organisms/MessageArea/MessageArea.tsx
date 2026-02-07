import { useRef, useEffect, useCallback } from 'react';
import { MessageBubble } from '../../molecules/MessageBubble';
import { DateDivider } from '../../molecules/DateDivider';
import { Avatar } from '../../atoms/Avatar';
import type { Message, ReadReceipt } from '../../../types/chat';
import styles from './MessageArea.module.css';

interface MessageAreaProps {
  messages: Message[];
  loading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onReply?: (messageId: string) => void;
  onToggleReaction?: (messageId: string, emoji: string) => void;
  readReceipts?: ReadReceipt[];
  currentUserId?: string;
}

/** Check if two dates are on the same calendar day */
function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Check if this message starts a new visual group */
function isFirstInGroup(messages: Message[], index: number): boolean {
  if (index === 0) return true;
  const prev = messages[index - 1]!;
  const curr = messages[index]!;

  // Different sender
  if (prev.sender.id !== curr.sender.id) return true;
  // More than 2 minutes apart
  if (curr.createdAt.getTime() - prev.createdAt.getTime() > 2 * 60 * 1000) return true;
  // Previous was system message
  if (prev.type === 'system') return true;

  return false;
}

export function MessageArea({ messages, loading, hasMore, onLoadMore, onReply, onToggleReaction, readReceipts, currentUserId }: MessageAreaProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on mount and new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Intersection observer for infinite scroll (load older messages)
  const observerRef = useRef<IntersectionObserver | null>(null);
  const topSentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (observerRef.current) observerRef.current.disconnect();
      if (!node || !hasMore || !onLoadMore) return;

      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) {
            onLoadMore();
          }
        },
        { threshold: 0.1 },
      );
      observerRef.current.observe(node);
    },
    [hasMore, onLoadMore],
  );

  // Build map of messageId -> read receipts (excluding current user)
  const receiptsByMessage = new Map<string, ReadReceipt[]>();
  if (readReceipts && readReceipts.length > 0) {
    for (const r of readReceipts) {
      if (r.userId === currentUserId) continue;
      const list = receiptsByMessage.get(r.lastReadMessageId) ?? [];
      list.push(r);
      receiptsByMessage.set(r.lastReadMessageId, list);
    }
  }

  // Group messages by date and insert dividers
  const elements: React.ReactNode[] = [];
  let lastDate: Date | null = null;

  if (loading) {
    elements.push(
      <div key="loading" className={styles.loadingState}>
        Loading messages...
      </div>,
    );
  }

  messages.forEach((msg, i) => {
    // Insert date divider if new day
    if (!lastDate || !isSameDay(lastDate, msg.createdAt)) {
      elements.push(<DateDivider key={`date-${msg.id}`} date={msg.createdAt} />);
      lastDate = msg.createdAt;
    }

    const isOwnMessage = msg.sender.id === currentUserId;

    elements.push(
      <MessageBubble
        key={msg.id}
        message={msg}
        isFirstInGroup={isFirstInGroup(messages, i)}
        isOwnMessage={isOwnMessage}
        onReply={onReply}
        onToggleReaction={onToggleReaction}
      />
    );

    // Show read receipt avatars under the message
    const receipts = receiptsByMessage.get(msg.id);
    if (receipts && receipts.length > 0) {
      elements.push(
        <div key={`read-${msg.id}`} className={`${styles.readReceipts} ${isOwnMessage ? styles.readReceiptsOwn : ''}`}>
          {receipts.map((r) => (
            <span key={r.userId} className={styles.readReceiptAvatar} title={r.displayName}>
              <Avatar
                size="xs"
                initials={r.displayName.split(/\s+/).map((w) => w[0]?.toUpperCase() ?? '').join('').slice(0, 2) || '?'}
                alt={r.displayName}
              />
            </span>
          ))}
        </div>
      );
    }
  });

  return (
    <div className={styles.messageArea} role="log" aria-live="polite" aria-label="Messages">
      <div className={styles.messageList}>
        {hasMore && <div ref={topSentinelRef} className={styles.loadMoreSentinel} />}
        {elements}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

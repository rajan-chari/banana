import { useState, useCallback } from 'react';
import { Avatar } from '../../atoms/Avatar';
import { Icon } from '../../atoms/Icon';
import { RichText } from '../../atoms/RichText';
import { AttachmentPreview } from '../AttachmentPreview';
import { LinkPreviewCard } from '../LinkPreviewCard';
import { ReactionBar } from '../ReactionBar';
import { EmojiPicker } from '../EmojiPicker';
import type { Message } from '../../../types/chat';
import styles from './MessageBubble.module.css';

interface MessageBubbleProps {
  message: Message;
  isFirstInGroup: boolean;
  isOwnMessage?: boolean;
  onReply?: (messageId: string) => void;
  onToggleReaction?: (messageId: string, emoji: string) => void;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function MessageBubble({ message, isFirstInGroup, isOwnMessage, onReply, onToggleReaction }: MessageBubbleProps) {
  const [showPicker, setShowPicker] = useState(false);

  const handleToggleReaction = useCallback(
    (emoji: string) => {
      onToggleReaction?.(message.id, emoji);
    },
    [message.id, onToggleReaction],
  );

  if (message.type === 'system') {
    return (
      <div className={styles.systemMessage} role="article" aria-label="System message">
        <span className={styles.systemText}>{message.content}</span>
      </div>
    );
  }

  return (
    <div
      className={`${styles.message} ${isFirstInGroup ? styles.firstInGroup : ''} ${isOwnMessage ? styles.ownMessage : ''}`}
      role="article"
      aria-label={`${message.sender.displayName} at ${formatTime(message.createdAt)}`}
    >
      {/* Avatar column — hidden for own messages */}
      {!isOwnMessage && (
        <div className={styles.avatarCol}>
          {isFirstInGroup ? (
            <Avatar
              size="lg"
              initials={message.sender.initials}
              alt={message.sender.displayName}
            />
          ) : (
            <div className={styles.avatarPlaceholder} />
          )}
        </div>
      )}

      {/* Content column */}
      <div className={styles.contentCol}>
        {isFirstInGroup && (
          <div className={styles.header}>
            <span className={styles.senderName}>{message.sender.displayName}</span>
            <span className={styles.timestamp}>{formatTime(message.createdAt)}</span>
            {message.isEdited && <span className={styles.editedLabel}>Edited</span>}
          </div>
        )}

        {/* Quoted reply */}
        {message.replyTo && (
          <div className={styles.quotedReply}>
            <div className={styles.quotedContent}>
              <div className={styles.quotedAuthor}>{message.replyTo.senderName}</div>
              <div className={styles.quotedText}>{message.replyTo.contentPreview}</div>
            </div>
          </div>
        )}

        <div className={styles.body}><RichText content={message.content} mentions={message.mentions} /></div>

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className={styles.attachments}>
            {message.attachments.map((att) => (
              <AttachmentPreview key={att.id} attachment={att} />
            ))}
          </div>
        )}

        {/* Link previews */}
        {message.linkPreviews && message.linkPreviews.length > 0 &&
          message.linkPreviews.map((preview) => (
            <LinkPreviewCard key={preview.url} preview={preview} />
          ))
        }

        {/* Reactions */}
        {message.reactions.length > 0 && (
          <ReactionBar reactions={message.reactions} onToggle={handleToggleReaction} />
        )}
      </div>

      {/* Hover actions */}
      <div className={styles.actions}>
        <div className={styles.reactBtnWrapper}>
          <button
            className={styles.actionBtn}
            aria-label="React"
            onClick={() => setShowPicker((v) => !v)}
          >
            <Icon name="emoji-smile" size="sm" />
          </button>
          {showPicker && (
            <EmojiPicker
              onSelect={handleToggleReaction}
              onClose={() => setShowPicker(false)}
            />
          )}
        </div>
        <button
          className={styles.actionBtn}
          aria-label="Reply"
          onClick={() => onReply?.(message.id)}
        >
          <Icon name="arrow-reply" size="sm" />
        </button>
        <button className={styles.actionBtn} aria-label="More actions">
          <Icon name="ellipsis-h" size="sm" />
        </button>
      </div>
    </div>
  );
}

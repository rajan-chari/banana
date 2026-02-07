import { useState, useRef, useCallback, type KeyboardEvent, type ChangeEvent } from 'react';
import { Icon } from '../../atoms/Icon';
import { MentionAutocomplete } from '../../molecules/MentionAutocomplete';
import type { MentionCandidate } from '../../molecules/MentionAutocomplete';
import type { SendMention } from '../../../api/client';
import * as api from '../../../api/client';
import styles from './ComposeBar.module.css';

interface PendingFile {
  file: File;
  id: string;
  progress: number;
  uploading: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface ReplyContext {
  messageId: string;
  senderName: string;
  contentPreview: string;
}

interface TrackedMention {
  userId: string;
  displayName: string;
  offset: number;
  length: number;
}

interface ComposeBarProps {
  chatId?: string;
  replyTo?: ReplyContext | null;
  onSend: (content: string, mentions?: SendMention[], attachmentIds?: string[]) => void;
  onCancelReply?: () => void;
  onTyping?: () => void;
}

export function ComposeBar({ chatId, replyTo, onSend, onCancelReply, onTyping }: ComposeBarProps) {
  const [content, setContent] = useState('');
  const [mentions, setMentions] = useState<TrackedMention[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionTriggerPos, setMentionTriggerPos] = useState(-1);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasContent = content.trim().length > 0;
  const hasFiles = pendingFiles.length > 0;
  const canSend = (hasContent || hasFiles) && !isSending;

  const handleSend = useCallback(async () => {
    const trimmed = content.trim();
    if (!trimmed && pendingFiles.length === 0) return;
    if (!chatId) return;

    setIsSending(true);
    try {
      // Upload all pending files
      const attachmentIds: string[] = [];
      for (let i = 0; i < pendingFiles.length; i++) {
        const pf = pendingFiles[i]!;
        setPendingFiles((prev) =>
          prev.map((f) => (f.id === pf.id ? { ...f, uploading: true } : f)),
        );
        const res = await api.uploadAttachment(chatId, pf.file, (progress) => {
          setPendingFiles((prev) =>
            prev.map((f) => (f.id === pf.id ? { ...f, progress } : f)),
          );
        });
        attachmentIds.push(res.id);
      }

      // Adjust mention offsets for leading whitespace trimmed
      const leadingSpaces = content.length - content.trimStart().length;
      const adjustedMentions: SendMention[] = mentions
        .filter((m) => m.offset >= leadingSpaces)
        .map((m) => ({
          user_id: m.userId,
          offset: m.offset - leadingSpaces,
          length: m.length,
        }));

      onSend(
        trimmed || '',
        adjustedMentions.length > 0 ? adjustedMentions : undefined,
        attachmentIds.length > 0 ? attachmentIds : undefined,
      );
      setContent('');
      setMentions([]);
      setPendingFiles([]);
      setMentionQuery(null);
      setMentionTriggerPos(-1);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } finally {
      setIsSending(false);
    }
  }, [content, mentions, pendingFiles, chatId, onSend]);

  const detectMentionTrigger = useCallback((text: string, cursorPos: number) => {
    // Look backwards from cursor for an unmatched "@"
    const before = text.slice(0, cursorPos);
    const atIdx = before.lastIndexOf('@');
    if (atIdx === -1) {
      setMentionQuery(null);
      setMentionTriggerPos(-1);
      return;
    }
    // "@" must be at start or preceded by whitespace
    if (atIdx > 0 && !/\s/.test(before[atIdx - 1]!)) {
      setMentionQuery(null);
      setMentionTriggerPos(-1);
      return;
    }
    const query = before.slice(atIdx + 1);
    // No spaces in mention query (single token matching)
    if (/\s/.test(query)) {
      setMentionQuery(null);
      setMentionTriggerPos(-1);
      return;
    }
    setMentionQuery(query);
    setMentionTriggerPos(atIdx);
  }, []);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      const newContent = e.target.value;
      setContent(newContent);
      onTyping?.();

      const cursorPos = e.target.selectionStart ?? newContent.length;
      detectMentionTrigger(newContent, cursorPos);
    },
    [onTyping, detectMentionTrigger],
  );

  const handleMentionSelect = useCallback(
    (user: MentionCandidate) => {
      if (mentionTriggerPos === -1) return;

      const beforeAt = content.slice(0, mentionTriggerPos);
      const cursorPos = textareaRef.current?.selectionStart ?? content.length;
      const afterCursor = content.slice(cursorPos);
      const mentionText = `@${user.displayName}`;
      const newContent = beforeAt + mentionText + ' ' + afterCursor;

      // Adjust existing mentions that come after the insertion point
      const insertionLength = mentionText.length + 1; // +1 for space
      const removedLength = cursorPos - mentionTriggerPos;
      const delta = insertionLength - removedLength;

      const adjusted = mentions.map((m) => {
        if (m.offset >= mentionTriggerPos) {
          return { ...m, offset: m.offset + delta };
        }
        return m;
      });

      const newMention: TrackedMention = {
        userId: user.id,
        displayName: user.displayName,
        offset: mentionTriggerPos,
        length: mentionText.length,
      };

      setContent(newContent);
      setMentions([...adjusted, newMention]);
      setMentionQuery(null);
      setMentionTriggerPos(-1);

      // Restore focus and cursor position
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) {
          const newCursorPos = mentionTriggerPos + mentionText.length + 1;
          el.focus();
          el.setSelectionRange(newCursorPos, newCursorPos);
        }
      });
    },
    [content, mentions, mentionTriggerPos],
  );

  const handleFilesSelected = useCallback((files: FileList | null) => {
    if (!files) return;
    const newPending: PendingFile[] = Array.from(files).map((file) => ({
      file,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      progress: 0,
      uploading: false,
    }));
    setPendingFiles((prev) => [...prev, ...newPending]);
  }, []);

  const handleRemoveFile = useCallback((fileId: string) => {
    setPendingFiles((prev) => prev.filter((f) => f.id !== fileId));
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Let MentionAutocomplete handle keys when open
      if (mentionQuery !== null) return;

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend, mentionQuery],
  );

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 84)}px`;
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      handleFilesSelected(e.dataTransfer.files);
    },
    [handleFilesSelected],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  return (
    <footer
      className={styles.composeBar}
      aria-label="Message compose"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className={styles.hiddenInput}
        onChange={(e) => {
          handleFilesSelected(e.target.files);
          e.target.value = '';
        }}
      />

      {/* Reply preview */}
      {replyTo && (
        <div className={styles.replyPreview}>
          <div className={styles.replyInfo}>
            <span className={styles.replyLabel}>Replying to {replyTo.senderName}</span>
            <div className={styles.replyText}>{replyTo.contentPreview}</div>
          </div>
          <button className={styles.replyClose} onClick={onCancelReply} aria-label="Cancel reply">
            <Icon name="close" size="sm" />
          </button>
        </div>
      )}

      {/* File chips */}
      {pendingFiles.length > 0 && (
        <div className={styles.fileChips}>
          {pendingFiles.map((pf) => (
            <div key={pf.id} className={styles.fileChip}>
              <Icon name="paperclip" size="sm" />
              <span className={styles.fileChipName}>{pf.file.name}</span>
              <span className={styles.fileChipSize}>{formatFileSize(pf.file.size)}</span>
              {pf.uploading && (
                <span className={styles.fileChipProgress}>{pf.progress}%</span>
              )}
              {!pf.uploading && (
                <button
                  className={styles.fileChipRemove}
                  onClick={() => handleRemoveFile(pf.id)}
                  aria-label={`Remove ${pf.file.name}`}
                >
                  <Icon name="close" size="xs" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Unified input container with inline actions */}
      <div className={styles.inputContainer}>
        {mentionQuery !== null && (
          <MentionAutocomplete
            query={mentionQuery}
            chatId={chatId}
            onSelect={handleMentionSelect}
            onDismiss={() => {
              setMentionQuery(null);
              setMentionTriggerPos(-1);
            }}
          />
        )}
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          placeholder="Type a message"
          aria-label="Type a message"
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          rows={1}
        />
        <div className={styles.inlineActions}>
          <button className={styles.actionBtn} aria-label="Add emoji">
            <Icon name="emoji-smile" size="md" />
          </button>
          <button
            className={styles.actionBtn}
            aria-label="Attach file"
            onClick={() => fileInputRef.current?.click()}
          >
            <Icon name="paperclip" size="md" />
          </button>
          <button
            className={`${styles.sendBtn} ${canSend ? styles.sendBtnActive : ''}`}
            onClick={handleSend}
            disabled={!canSend}
            aria-label="Send message"
          >
            <Icon name="send" size="md" />
          </button>
        </div>
      </div>
    </footer>
  );
}

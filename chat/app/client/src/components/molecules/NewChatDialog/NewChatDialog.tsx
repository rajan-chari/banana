import { useState, useEffect, useRef, useCallback } from 'react';
import { Icon } from '../../atoms/Icon';
import { useAuth } from '../../../hooks/useAuth';
import * as api from '../../../api/client';
import styles from './NewChatDialog.module.css';

interface NewChatDialogProps {
  onCreateChat: (chatId: string) => void;
  onClose: () => void;
}

interface UserResult {
  id: string;
  displayName: string;
  avatarUrl?: string;
}

export function NewChatDialog({ onCreateChat, onClose }: NewChatDialogProps) {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Search users (loads all on open, filters as you type)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const doSearch = async () => {
      setLoading(true);
      try {
        const res = await api.searchUsers(query.trim());
        setResults(
          res.users.map((u) => ({
            id: u.id,
            displayName: u.display_name,
            avatarUrl: u.avatar_url,
          })),
        );
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    };

    if (query.trim()) {
      debounceRef.current = setTimeout(doSearch, 200);
    } else {
      // Load all users immediately on open
      doSearch();
    }

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const handleSelect = useCallback(
    async (userId: string) => {
      if (!user) return;
      setCreating(true);
      setError('');
      try {
        const res = await api.createChat('direct', [user.id, userId]) as any;
        onCreateChat(res.id);
      } catch (err: any) {
        if (err.status === 409 && err.existingChatId) {
          // Navigate to existing chat
          onCreateChat(err.existingChatId);
        } else if (err.status === 409) {
          setError('Chat already exists with this user');
          setCreating(false);
        } else {
          setError(err.message || 'Failed to create chat');
          setCreating(false);
        }
      }
    },
    [onCreateChat, user],
  );

  const getInitials = (name: string) => {
    const words = name.trim().split(/\s+/);
    return words.slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>New chat</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <Icon name="close" size="md" />
          </button>
        </div>

        <div className={styles.searchContainer}>
          <Icon name="magnify" size="sm" />
          <input
            ref={inputRef}
            className={styles.searchInput}
            type="text"
            placeholder="Search for people..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.results}>
          {loading && <div className={styles.hint}>Searching...</div>}
          {!loading && results.length === 0 && (
            <div className={styles.hint}>No users found</div>
          )}
          {results.map((user) => (
            <button
              key={user.id}
              className={styles.userRow}
              onClick={() => handleSelect(user.id)}
              disabled={creating}
            >
              <div className={styles.userAvatar}>{getInitials(user.displayName)}</div>
              <span className={styles.userName}>{user.displayName}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

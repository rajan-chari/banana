import { useState, useEffect, useRef, useCallback } from 'react';
import { Avatar } from '../../atoms/Avatar';
import * as api from '../../../api/client';
import type { UserSearchResult } from '../../../api/client';
import styles from './MentionAutocomplete.module.css';

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  return words
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?';
}

export interface MentionCandidate {
  id: string;
  displayName: string;
  avatarUrl?: string;
}

interface MentionAutocompleteProps {
  query: string;
  chatId?: string;
  onSelect: (user: MentionCandidate) => void;
  onDismiss: () => void;
}

export function MentionAutocomplete({ query, chatId, onSelect, onDismiss }: MentionAutocompleteProps) {
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query) {
      setResults([]);
      setActiveIndex(0);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(() => {
      api
        .searchUsers(query, chatId)
        .then((res) => {
          setResults(res.users);
          setActiveIndex(0);
        })
        .catch(() => {
          setResults([]);
        })
        .finally(() => setLoading(false));
    }, 200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, chatId]);

  const handleSelect = useCallback(
    (user: UserSearchResult) => {
      onSelect({
        id: user.id,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
      });
    },
    [onSelect],
  );

  // Keyboard navigation is handled by ComposeBar passing key events
  // Expose navigation via imperative handle-like pattern through props
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (results.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % results.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => (prev - 1 + results.length) % results.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        const selected = results[activeIndex];
        if (selected) handleSelect(selected);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onDismiss();
      }
    };

    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [results, activeIndex, handleSelect, onDismiss]);

  if (results.length === 0 && !loading) {
    if (!query) return null;
    return (
      <div className={styles.dropdown}>
        <div className={styles.empty}>No matches</div>
      </div>
    );
  }

  return (
    <div className={styles.dropdown} role="listbox" aria-label="Mention suggestions">
      {results.map((user, i) => (
        <div
          key={user.id}
          className={`${styles.item} ${i === activeIndex ? styles.itemActive : ''}`}
          role="option"
          aria-selected={i === activeIndex}
          onMouseDown={(e) => {
            e.preventDefault();
            handleSelect(user);
          }}
          onMouseEnter={() => setActiveIndex(i)}
        >
          <Avatar
            size="sm"
            src={user.avatar_url}
            alt={user.display_name}
            initials={getInitials(user.display_name)}
          />
          <span className={styles.name}>{user.display_name}</span>
        </div>
      ))}
    </div>
  );
}

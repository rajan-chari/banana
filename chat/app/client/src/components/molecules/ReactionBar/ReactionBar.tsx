import type { Reaction } from '../../../types/chat';
import styles from './ReactionBar.module.css';

interface ReactionBarProps {
  reactions: Reaction[];
  onToggle: (emoji: string) => void;
}

export function ReactionBar({ reactions, onToggle }: ReactionBarProps) {
  if (reactions.length === 0) return null;

  return (
    <div className={styles.reactionBar}>
      {reactions.map((r) => (
        <button
          key={r.emoji}
          className={`${styles.pill} ${r.reactedByMe ? styles.pillActive : ''}`}
          onClick={() => onToggle(r.emoji)}
          aria-label={`${r.emoji} ${r.count}, ${r.reactedByMe ? 'remove reaction' : 'add reaction'}`}
        >
          <span className={styles.emoji}>{r.emoji}</span>
          <span className={styles.count}>{r.count}</span>
          <span className={styles.tooltip}>
            {r.users.map((u) => u.displayName).join(', ')}
          </span>
        </button>
      ))}
    </div>
  );
}

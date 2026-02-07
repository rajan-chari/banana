import styles from './Badge.module.css';

interface BadgeProps {
  count?: number;
  max?: number;
  variant?: 'count' | 'dot';
}

export function Badge({ count, max = 99, variant = 'count' }: BadgeProps) {
  if (variant === 'dot') {
    return <span className={`${styles.badge} ${styles.dot}`} aria-label="notification" />;
  }

  if (!count || count <= 0) return null;

  const display = count > max ? `${max}+` : String(count);

  return (
    <span className={`${styles.badge} ${styles.count}`} aria-label={`${count} unread notifications`}>
      {display}
    </span>
  );
}

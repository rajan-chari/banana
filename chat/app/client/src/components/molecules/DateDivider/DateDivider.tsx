import styles from './DateDivider.module.css';

interface DateDividerProps {
  date: Date;
}

function formatDateLabel(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86400000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';

  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export function DateDivider({ date }: DateDividerProps) {
  return (
    <div className={styles.divider} role="separator">
      <div className={styles.line} />
      <span className={styles.label}>{formatDateLabel(date)}</span>
      <div className={styles.line} />
    </div>
  );
}

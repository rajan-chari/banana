import type { UserStatus } from '../../../types/chat';
import styles from './Avatar.module.css';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

interface AvatarProps {
  size?: AvatarSize;
  src?: string;
  alt: string;
  initials?: string;
  status?: UserStatus;
}

const sizeClass: Record<AvatarSize, string> = {
  xs: styles.xs!,
  sm: styles.sm!,
  md: styles.md!,
  lg: styles.lg!,
  xl: styles.xl!,
  '2xl': styles.xxl!,
};

const statusClass: Record<UserStatus, string> = {
  online: styles.statusOnline!,
  away: styles.statusAway!,
  busy: styles.statusBusy!,
  offline: styles.statusOffline!,
};

export function Avatar({ size = 'md', src, alt, initials, status }: AvatarProps) {
  return (
    <div className={`${styles.avatar} ${sizeClass[size]}`} aria-label={alt}>
      {src ? (
        <img src={src} alt={alt} />
      ) : (
        <span>{initials ?? alt.charAt(0)}</span>
      )}
      {status && (
        <span className={`${styles.status} ${statusClass[status]}`} />
      )}
    </div>
  );
}

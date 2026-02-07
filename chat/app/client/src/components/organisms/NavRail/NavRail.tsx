import { Icon } from '../../atoms/Icon';
import { Badge } from '../../atoms/Badge';
import type { IconName } from '../../atoms/Icon';
import styles from './NavRail.module.css';

interface NavItem {
  id: string;
  icon: IconName;
  label: string;
  badge?: number;
  dotBadge?: boolean;
}

interface NavRailProps {
  activeItem: string;
  onNavigate: (id: string) => void;
}

const topItems: NavItem[] = [
  { id: 'activity', icon: 'bell', label: 'Activity', badge: 30 },
  { id: 'chat', icon: 'chat-bubble', label: 'Chat' },
  { id: 'calendar', icon: 'calendar', label: 'Calendar' },
  { id: 'calls', icon: 'phone', label: 'Calls' },
  { id: 'files', icon: 'folder', label: 'Files' },
  { id: 'apps', icon: 'grid', label: 'Apps' },
  { id: 'contacts', icon: 'people', label: 'Contacts', dotBadge: true },
];

const bottomItems: NavItem[] = [
  { id: 'more', icon: 'ellipsis-h', label: 'More' },
];

function NavRailItem({
  item,
  isActive,
  onClick,
}: {
  item: NavItem;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`${styles.item} ${isActive ? styles.active : ''}`}
      onClick={onClick}
      aria-label={item.label}
      aria-current={isActive ? 'page' : undefined}
    >
      <Icon name={item.icon} size="sm" />
      {item.badge != null && item.badge > 0 && (
        <span className={styles.badgeWrapper}>
          <Badge count={item.badge} />
        </span>
      )}
      {item.dotBadge && (
        <span className={styles.badgeWrapper}>
          <Badge variant="dot" />
        </span>
      )}
    </button>
  );
}

export function NavRail({ activeItem, onNavigate }: NavRailProps) {
  return (
    <nav className={styles.navRail} aria-label="Application navigation">
      <div className={styles.topGroup}>
        {topItems.map((item) => (
          <NavRailItem
            key={item.id}
            item={item}
            isActive={activeItem === item.id}
            onClick={() => onNavigate(item.id)}
          />
        ))}
      </div>
      <div className={styles.bottomGroup}>
        {bottomItems.map((item) => (
          <NavRailItem
            key={item.id}
            item={item}
            isActive={activeItem === item.id}
            onClick={() => onNavigate(item.id)}
          />
        ))}
      </div>
    </nav>
  );
}

import { useState } from 'react';
import { Avatar } from '../../atoms/Avatar';
import { Badge } from '../../atoms/Badge';
import { Icon } from '../../atoms/Icon';
import type { ChatPreview } from '../../../types/chat';
import styles from './Sidebar.module.css';

interface SidebarProps {
  chats: ChatPreview[];
  selectedChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onNewChat?: () => void;
}

function formatTimestamp(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffMins < 1) return 'Now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24 && now.getDate() === date.getDate()) return `${diffHours}h`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.getDate() === yesterday.getDate() && date.getMonth() === yesterday.getMonth()) {
    return 'Yesterday';
  }

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  if (diffMs < 7 * 86400000) return dayNames[date.getDay()]!;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

type FilterTab = 'all' | 'unread' | 'channels' | 'chats';

export function Sidebar({ chats, selectedChatId, onSelectChat, onNewChat }: SidebarProps) {
  const [filter, setFilter] = useState<FilterTab>('all');

  const tabs: { id: FilterTab; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'unread', label: 'Unread' },
    { id: 'channels', label: 'Channels' },
    { id: 'chats', label: 'Chats' },
  ];

  const filteredChats = chats.filter((chat) => {
    switch (filter) {
      case 'unread': return chat.unreadCount > 0;
      case 'channels': return chat.type === 'group';
      case 'chats': return chat.type === 'direct';
      default: return true;
    }
  });

  return (
    <aside className={styles.sidebar} aria-label="Chat list">
      <div className={styles.header}>
        <div className={styles.filterTabs} role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={filter === tab.id}
              className={`${styles.filterTab} ${filter === tab.id ? styles.filterTabActive : ''}`}
              onClick={() => setFilter(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button className={styles.composeBtn} aria-label="New chat" onClick={onNewChat}>
          <Icon name="pencil" size="sm" />
        </button>
      </div>

      <div className={styles.chatList} role="listbox" aria-label="Conversations">
        {filteredChats.length === 0 && (
          <div className={styles.emptyState}>
            <Icon name="chat-bubble" size="xl" />
            <p className={styles.emptyText}>No conversations yet</p>
            <button className={styles.emptyBtn} onClick={onNewChat}>
              <Icon name="pencil" size="sm" />
              Start a new chat
            </button>
          </div>
        )}
        {filteredChats.map((chat) => (
          <div
            key={chat.id}
            role="option"
            aria-selected={selectedChatId === chat.id}
            className={`${styles.chatItem} ${selectedChatId === chat.id ? styles.chatItemSelected : ''}`}
            onClick={() => onSelectChat(chat.id)}
          >
            <Avatar
              size="md"
              initials={chat.avatarInitials}
              alt={chat.title}
              status={chat.type === 'direct' ? chat.members[1]?.status : undefined}
            />
            <div className={styles.chatInfo}>
              <div className={styles.chatTopRow}>
                <span className={`${styles.chatName} ${chat.unreadCount > 0 ? styles.chatNameUnread : ''}`}>
                  {chat.title}
                </span>
                {chat.lastMessage && (
                  <span className={styles.chatTimestamp}>
                    {formatTimestamp(chat.lastMessage.timestamp)}
                  </span>
                )}
              </div>
              <div className={styles.chatBottomRow}>
                <span className={styles.chatPreview}>
                  {chat.lastMessage
                    ? chat.type === 'group'
                      ? `${chat.lastMessage.senderName}: ${chat.lastMessage.content}`
                      : chat.lastMessage.content
                    : ''}
                </span>
                {chat.unreadCount > 0 && <Badge count={chat.unreadCount} />}
              </div>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

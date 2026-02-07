import { useState } from 'react';
import { Icon } from '../../atoms/Icon';
import type { ChatType } from '../../../types/chat';
import styles from './ChatHeader.module.css';

interface ChatHeaderProps {
  name: string;
  type: ChatType;
  memberCount?: number;
}

const tabs = ['Chat', 'Shared', 'Recap', 'Q&A'];

export function ChatHeader({ name, type, memberCount }: ChatHeaderProps) {
  const [activeTab, setActiveTab] = useState('Chat');

  return (
    <div className={styles.chatHeader}>
      <div className={styles.topRow}>
        <div className={styles.channelInfo}>
          {type === 'group' && (
            <span className={styles.channelIcon}>
              <Icon name="hash" size="md" />
            </span>
          )}
          <h2 className={styles.channelName}>{name}</h2>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.meetBtn} aria-label="Meet now">
            <Icon name="phone" size="sm" />
            <span>Meet now</span>
          </button>
          {memberCount != null && (
            <button className={styles.memberCount} aria-label={`${memberCount} members`}>
              <Icon name="people" size="sm" />
              <span>{memberCount}</span>
            </button>
          )}
          <button className={styles.actionBtn} aria-label="Search in conversation">
            <Icon name="magnify" size="md" />
          </button>
          <button className={styles.actionBtn} aria-label="More options">
            <Icon name="ellipsis-h" size="md" />
          </button>
        </div>
      </div>
      <div className={styles.tabBar} role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>
    </div>
  );
}

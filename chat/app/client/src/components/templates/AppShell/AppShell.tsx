import { useState, type ReactNode } from 'react';
import { Icon } from '../../atoms/Icon';
import { Avatar } from '../../atoms/Avatar';
import { NavRail } from '../../organisms/NavRail';
import { Sidebar } from '../../organisms/Sidebar';
import type { ChatPreview, User } from '../../../types/chat';
import styles from './AppShell.module.css';

interface AppShellProps {
  children?: ReactNode;
  chats: ChatPreview[];
  selectedChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onNewChat?: () => void;
  currentUser?: User | null;
  hasChats?: boolean;
}

export function AppShell({ children, chats, selectedChatId, onSelectChat, onNewChat, currentUser, hasChats }: AppShellProps) {
  const [activeNav, setActiveNav] = useState('chat');

  return (
    <div className={styles.appShell}>
      {/* Skip link */}
      <a href="#main-content" className="skip-link">Skip to main content</a>

      {/* Top Bar */}
      <header className={styles.topBar}>
        <div className={styles.navControls}>
          <button className={styles.topBarBtn} aria-label="Go back">
            <Icon name="arrow-left" size="md" />
          </button>
          <button className={styles.topBarBtn} aria-label="Go forward">
            <Icon name="arrow-right" size="md" />
          </button>
        </div>

        <span className={styles.logo}>Chat</span>

        <button className={styles.searchBar} role="search" onClick={onNewChat}>
          <span className={styles.searchIcon}>
            <Icon name="magnify" size="sm" />
          </span>
          <span className={styles.searchPlaceholder}>Search</span>
          <span className={styles.searchHint}>(Ctrl+E)</span>
        </button>

        <div className={styles.topBarRight}>
          <Avatar size="sm" initials={currentUser?.initials ?? '?'} alt={currentUser?.displayName ?? 'User'} status="online" />
        </div>
      </header>

      {/* Content area: NavRail | Sidebar | Main */}
      <div className={styles.contentArea}>
        <NavRail activeItem={activeNav} onNavigate={setActiveNav} />
        <Sidebar
          chats={chats}
          selectedChatId={selectedChatId}
          onSelectChat={onSelectChat}
          onNewChat={onNewChat}
        />
        <main id="main-content" className={styles.mainPanel} aria-label="Chat">
          {children || (
            <div className={styles.mainContent}>
              {!hasChats ? (
                <div className={styles.welcomeState}>
                  <div className={styles.welcomeIcon}>
                    <Icon name="chat-bubble" size="xl" />
                  </div>
                  <h2 className={styles.welcomeTitle}>Welcome to Chat</h2>
                  <p className={styles.welcomeDesc}>Start a conversation with someone</p>
                  <button className={styles.welcomeBtn} onClick={onNewChat}>
                    <Icon name="pencil" size="sm" />
                    New chat
                  </button>
                </div>
              ) : (
                'Select a chat to start messaging'
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { LoginPage } from './components/pages/LoginPage/LoginPage';
import { AppShell } from './components/templates/AppShell';
import { ChatView } from './components/templates/ChatView';
import { NewChatDialog } from './components/molecules/NewChatDialog';
import { useChats } from './hooks/useChat';

function AuthenticatedApp() {
  const { user } = useAuth();
  const { chats, clearUnread, refresh } = useChats(user?.id);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [showNewChat, setShowNewChat] = useState(false);

  // Auto-select first chat once loaded, or reset if selected chat disappears
  useEffect(() => {
    if (chats.length === 0) return;
    if (!selectedChatId || !chats.some((c) => c.id === selectedChatId)) {
      setSelectedChatId(chats[0]!.id);
    }
  }, [chats, selectedChatId]);

  const selectedChat = chats.find((c) => c.id === selectedChatId);

  const handleMarkRead = useCallback(() => {
    if (selectedChatId) clearUnread(selectedChatId);
  }, [selectedChatId, clearUnread]);

  const handleNewChatCreated = useCallback((chatId: string) => {
    setShowNewChat(false);
    refresh();
    setSelectedChatId(chatId);
  }, [refresh]);

  return (
    <>
      <AppShell
        chats={chats}
        selectedChatId={selectedChatId}
        onSelectChat={setSelectedChatId}
        onNewChat={() => setShowNewChat(true)}
        currentUser={user}
        hasChats={chats.length > 0}
      >
        {selectedChat && <ChatView key={selectedChat.id} chat={selectedChat} onMarkRead={handleMarkRead} />}
      </AppShell>
      {showNewChat && (
        <NewChatDialog
          onCreateChat={handleNewChatCreated}
          onClose={() => setShowNewChat(false)}
        />
      )}
    </>
  );
}

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        color: 'var(--color-text-secondary)',
      }}>
        Loading...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return <AuthenticatedApp />;
}

export function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

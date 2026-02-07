import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { User } from '../types/chat';
import type { UserResponse } from '../api/client';
import * as api from '../api/client';
import { chatWS } from '../api/websocket';

function mapUser(u: UserResponse): User {
  const words = u.display_name.trim().split(/\s+/);
  const initials = words.map((w) => w[0]?.toUpperCase() ?? '').join('');
  return {
    id: u.id,
    displayName: u.display_name,
    avatarUrl: u.avatar_url,
    initials: initials || '?',
    status: (u.status as User['status']) || 'offline',
  };
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (displayName: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(api.getToken());
  const [isLoading, setIsLoading] = useState(!!api.getToken());

  // Validate existing token on mount
  useEffect(() => {
    const storedToken = api.getToken();
    if (!storedToken) {
      setIsLoading(false);
      return;
    }
    api
      .getMe()
      .then((u) => {
        setUser(mapUser(u));
        setToken(storedToken);
        chatWS.connect(storedToken);
      })
      .catch(() => {
        api.logout();
        setToken(null);
        setUser(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password);
    setUser(mapUser(res.user as unknown as UserResponse));
    setToken(res.token);
    chatWS.connect(res.token);
  }, []);

  const register = useCallback(async (displayName: string, email: string, password: string) => {
    const res = await api.register(displayName, email, password);
    setUser(mapUser(res.user as unknown as UserResponse));
    setToken(res.token);
    chatWS.connect(res.token);
  }, []);

  const logout = useCallback(() => {
    api.logout();
    chatWS.disconnect();
    setUser(null);
    setToken(null);
  }, []);

  const value: AuthContextValue = {
    user,
    token,
    isAuthenticated: !!user,
    isLoading,
    login,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

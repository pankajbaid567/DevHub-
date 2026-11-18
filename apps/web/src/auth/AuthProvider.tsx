import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthResponse, CurrentUser, LoginInput, RegisterInput } from '@devhub/shared';
import { AuthContext, type AuthStatus } from './context';
import { api, mayHaveSession, refreshSession, session } from '../lib/api';
import { connectSocket, disconnectSocket } from '../lib/socket';
import { queryClient } from '../lib/queryClient';

/**
 * Restores the session on load via the refresh cookie (no token in storage), keeps the
 * in-memory access token fresh with a timer, and connects the realtime socket while signed in.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  // No session hint in this browser: we already know the visitor is anonymous.
  const [status, setStatus] = useState<AuthStatus>(() =>
    mayHaveSession() ? 'loading' : 'anonymous',
  );
  const [user, setUserState] = useState<CurrentUser | null>(null);

  useEffect(() => {
    const unsubscribe = session.subscribe(({ user: u }) => {
      setUserState(u);
      setStatus(u ? 'authenticated' : 'anonymous');
    });
    if (mayHaveSession()) {
      void refreshSession().then((auth) => {
        if (!auth) setStatus('anonymous');
      });
    }
    return unsubscribe;
  }, []);

  // Refresh one minute before the access token expires, while the tab is open.
  useEffect(() => {
    if (status !== 'authenticated') return;
    connectSocket();
    const id = window.setInterval(() => void refreshSession(), 13 * 60_000);
    return () => window.clearInterval(id);
  }, [status]);

  const login = useCallback(async (input: LoginInput) => {
    const auth = await api<AuthResponse>('/auth/login', { method: 'POST', body: input });
    session.set(auth);
    return auth.user;
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const auth = await api<AuthResponse>('/auth/register', { method: 'POST', body: input });
    session.set(auth);
    return auth.user;
  }, []);

  const logout = useCallback(async () => {
    await fetch(`${import.meta.env.VITE_API_URL ?? ''}/api/v1/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-Requested-With': 'devhub' },
    }).catch(() => undefined);
    disconnectSocket();
    session.set(null);
    queryClient.clear();
  }, []);

  const setUser = useCallback((u: CurrentUser) => session.updateUser(u), []);

  const value = useMemo(
    () => ({ status, user, login, register, logout, setUser }),
    [status, user, login, register, logout, setUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

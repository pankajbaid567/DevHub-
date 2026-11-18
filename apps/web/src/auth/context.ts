import { createContext, useContext } from 'react';
import type { CurrentUser, LoginInput, MfaChallengeResponse, RegisterInput } from '@devhub/shared';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface AuthContextValue {
  status: AuthStatus;
  user: CurrentUser | null;
  /** Resolves to the user, or to a challenge when the account has two-factor auth on. */
  login: (input: LoginInput) => Promise<CurrentUser | MfaChallengeResponse>;
  /** Second step for two-factor accounts. */
  verifyMfa: (mfaToken: string, code: string) => Promise<CurrentUser>;
  register: (input: RegisterInput) => Promise<CurrentUser>;
  logout: () => Promise<void>;
  setUser: (u: CurrentUser) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

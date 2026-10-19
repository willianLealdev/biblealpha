import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';

import { authApi, clearTokens, meApi, refreshSession, setSessionExpiredHandler, type User } from './api';

type Status = 'loading' | 'signedIn' | 'signedOut';

type SessionContextValue = {
  status: Status;
  user: User | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Atualiza o usuário em memória depois de uma alteração de perfil. */
  setUser: (user: User) => void;
  /** Encerra a sessão local sem chamar a API (ex.: após excluir a conta). */
  forget: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUserState] = useState<User | null>(null);
  const { setMode } = useTheme();
  const { setLocale } = useI18n();

  // As preferências da conta valem em todos os aparelhos
  const applyUser = useCallback(
    (next: User) => {
      setUserState(next);
      setMode(next.preferences.theme);
      setLocale(next.locale);
    },
    [setMode, setLocale],
  );

  const forget = useCallback(async () => {
    await clearTokens();
    setUserState(null);
    setStatus('signedOut');
  }, []);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUserState(null);
      setStatus('signedOut');
    });
    (async () => {
      try {
        if (await refreshSession()) {
          applyUser(await meApi.get());
          setStatus('signedIn');
          return;
        }
      } catch {
        // cai para deslogado
      }
      setStatus('signedOut');
    })();
    return () => setSessionExpiredHandler(null);
  }, [applyUser]);

  const value = useMemo<SessionContextValue>(
    () => ({
      status,
      user,
      async signIn(email, password) {
        await authApi.login(email, password);
        applyUser(await meApi.get());
        setStatus('signedIn');
      },
      async signOut() {
        try {
          await authApi.logout();
        } finally {
          setUserState(null);
          setStatus('signedOut');
        }
      },
      setUser: setUserState,
      forget,
    }),
    [status, user, applyUser, forget],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}

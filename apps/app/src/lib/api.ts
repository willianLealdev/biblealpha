import { Platform } from 'react-native';

import { getItem, setItem } from './storage';

// No PWA a API é servida no mesmo domínio, em /api. No app nativo usa biblealpha.com
// (ou EXPO_PUBLIC_API_URL, como no desenvolvimento local).
const ORIGIN = (process.env.EXPO_PUBLIC_API_URL ?? (Platform.OS === 'web' ? '' : 'https://biblealpha.com')).replace(/\/$/, '');
export const API_BASE = `${ORIGIN}/api/v1`;

const IS_WEB = Platform.OS === 'web';
const REFRESH_KEY = 'ba.refresh';

export type Theme = 'dark' | 'light' | 'system';
// pt-BR, en e es vêm no app; outros idiomas são instalados pelo painel (ex.: 'fr')
export type Locale = string;

export type Preferences = {
  theme: Theme;
  font_scale: number;
  line_height: number;
  reading_mode: 'simple' | 'advanced';
  onboarding_completed: boolean;
};

export type User = {
  id: string;
  email: string;
  name: string | null;
  locale: Locale;
  country: string | null;
  email_verified: boolean;
  roles: string[];
  plan: 'free' | 'pro';
  created_at: string;
  preferences: Preferences;
};

export type SessionInfo = {
  id: string;
  client: 'web' | 'native';
  user_agent: string | null;
  ip: string | null;
  created_at: string;
  last_used_at: string;
  current: boolean;
};

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

let accessToken: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;
let onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler;
}

export function hasAccessToken() {
  return accessToken !== null;
}

export function getAccessToken() {
  return accessToken;
}

type RequestOptions = { method?: string; body?: unknown; auth?: boolean; headers?: Record<string, string> };

async function send(path: string, { method = 'GET', body, auth = true, headers = {} }: RequestOptions) {
  const finalHeaders: Record<string, string> = { Accept: 'application/json', ...headers };
  if (body !== undefined) finalHeaders['Content-Type'] = 'application/json';
  if (auth && accessToken) finalHeaders.Authorization = `Bearer ${accessToken}`;
  if (IS_WEB) finalHeaders['X-BA-Client'] = 'web';
  return fetch(`${API_BASE}${path}`, {
    method,
    headers: finalHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'include',
  });
}

async function parse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  let data: any = null;
  try {
    data = await response.json();
  } catch {
    // resposta sem JSON
  }
  if (!response.ok) {
    const error = data?.error ?? {};
    throw new ApiError(response.status, error.code ?? 'unknown_error', error.message ?? response.statusText, error.details);
  }
  return data as T;
}

/** Chamada à API. Renova o access token uma vez, automaticamente, quando ele expira. */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response: Response;
  try {
    response = await send(path, options);
  } catch {
    throw new ApiError(0, 'network_error', 'Network request failed');
  }
  if (response.status === 401 && options.auth !== false && accessToken) {
    if (await refreshSession()) {
      response = await send(path, options);
    } else {
      onSessionExpired?.();
    }
  }
  return parse<T>(response);
}

type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string };

async function storeTokens(tokens: TokenResponse) {
  accessToken = tokens.access_token;
  if (!IS_WEB && tokens.refresh_token) await setItem(REFRESH_KEY, tokens.refresh_token);
}

export async function clearTokens() {
  accessToken = null;
  if (!IS_WEB) await setItem(REFRESH_KEY, null);
}

/** Tenta obter um novo access token (cookie httpOnly no web, refresh guardado no celular). */
export function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const stored = IS_WEB ? null : await getItem(REFRESH_KEY);
        if (!IS_WEB && !stored) return false;
        const response = await send('/auth/refresh', {
          method: 'POST',
          auth: false,
          body: IS_WEB ? undefined : { refresh_token: stored },
        });
        if (!response.ok) {
          await clearTokens();
          return false;
        }
        await storeTokens(await response.json());
        return true;
      } catch {
        // Sem rede: mantém o refresh guardado para tentar de novo depois
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

export const authApi = {
  async login(email: string, password: string) {
    const tokens = await api<TokenResponse>('/auth/login', {
      method: 'POST',
      auth: false,
      body: { email, password, client: IS_WEB ? 'web' : 'native' },
    });
    await storeTokens(tokens);
  },
  async logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      await clearTokens();
    }
  },
  register: (body: { name: string; email: string; password: string; locale: Locale; country?: string; accept_terms: boolean }) =>
    api<{ status: string }>('/auth/register', { method: 'POST', auth: false, body }),
  verifyEmail: (token: string) => api('/auth/verify-email', { method: 'POST', auth: false, body: { token } }),
  resendVerification: (email: string) =>
    api('/auth/resend-verification', { method: 'POST', auth: false, body: { email } }),
  forgotPassword: (email: string) => api('/auth/forgot-password', { method: 'POST', auth: false, body: { email } }),
  resetPassword: (token: string, password: string) =>
    api('/auth/reset-password', { method: 'POST', auth: false, body: { token, password } }),
};

export const meApi = {
  get: () => api<User>('/me'),
  update: (body: Partial<Pick<User, 'name' | 'locale' | 'country'>>) => api<User>('/me', { method: 'PATCH', body }),
  updatePreferences: (body: Partial<Preferences>) =>
    api<Preferences>('/me/preferences', { method: 'PATCH', body }),
  changePassword: (current_password: string, new_password: string) =>
    api('/me/password', { method: 'POST', body: { current_password, new_password } }),
  sessions: () => api<SessionInfo[]>('/me/sessions'),
  revokeSession: (id: string) => api(`/me/sessions/${id}`, { method: 'DELETE' }),
  revokeOthers: () => api<{ revoked: number }>('/me/sessions/revoke-others', { method: 'POST' }),
  exportData: () => api<Record<string, unknown>>('/me/export'),
  deleteAccount: (password: string) => api('/me', { method: 'DELETE', body: { password } }),
};

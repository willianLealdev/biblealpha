// Telão da igreja: tela aberta no computador (QR code) controlada pelo pregador no celular.

import { Platform } from 'react-native';

import { API_BASE, api } from './api';
import { kvGet, kvSet } from './kv';

export type SlideStyle = {
  text_color: string;
  accent_color: string;
  overlay: number;
  font: 'serif' | 'sans';
  gradient: string[];
};
export type ScreenState = {
  id: string;
  code: string;
  status: 'waiting' | 'paired' | 'ended';
  version: number;
  slide: { text: string; reference: string | null; title?: string | null } | null;
  background: { id: string | null; image: boolean; style: SlideStyle };
  can_generate?: boolean;
  remaining?: number | null;
  library_count?: number;
  library_max?: number;
};

export type Library = {
  items: LibraryBackground[];
  current_id?: string | null;
  background?: ScreenState['background'];
  library_count: number;
  library_max: number;
  can_generate: boolean;
  remaining: number | null;
};

/** Fundo guardado na biblioteca da pessoa (a imagem vem de backgroundUrl) */
export type LibraryBackground = { id: string; label: string | null; image: boolean; style: SlideStyle; created_at: string };

// Endereço do app para abrir o telão no computador
export const APP_URL = (
  (Platform.OS === 'web' ? globalThis.location?.origin : process.env.EXPO_PUBLIC_APP_URL) ?? 'https://biblealpha.com'
).replace(/\/$/, '');

export const backgroundUrl = (id: string) => `${API_BASE}/screens/backgrounds/${id}`;

export const screenApi = {
  open: () => api<ScreenState & { token: string; pair_url: string }>('/screens', { method: 'POST', auth: false }),
  state: (id: string, token: string) =>
    api<ScreenState>(`/screens/${id}/state`, { auth: false, headers: { 'X-Screen-Token': token } }),
  check: (code: string) => api<{ code: string }>('/screens/check', { method: 'POST', body: { code } }),
  pair: (code: string, sermonId?: string | null) =>
    api<ScreenState>('/screens/pair', { method: 'POST', body: { code, sermon_id: sermonId ?? null } }),
  /** A tela já conectada passa a acompanhar esta ministração (troca o fundo) */
  follow: (id: string, sermonId: string) =>
    api<ScreenState>(`/screens/${id}/sermon`, { method: 'PUT', body: { sermon_id: sermonId } }),
  /** Título sozinho (text vazio), ou texto com o título acima */
  show: (id: string, text: string, reference?: string | null, title?: string | null) =>
    api<ScreenState>(`/screens/${id}/slide`, { method: 'PUT', body: { text, reference: reference ?? null, title: title ?? null } }),
  background: (id: string) => api<ScreenState>(`/screens/${id}/background`, { method: 'POST' }),
  library: (sermonId?: string) =>
    api<Library>(`/screens/library${sermonId ? `?sermon_id=${sermonId}` : ''}`),
  /** Direto da ministração (sem tela conectada) */
  useSermonBackground: (sermonId: string, backgroundId: string) =>
    api<Library>(`/screens/sermons/${sermonId}/background`, { method: 'PUT', body: { background_id: backgroundId } }),
  newSermonBackground: (sermonId: string) =>
    api<Library>(`/screens/sermons/${sermonId}/background`, { method: 'POST' }),
  /** Usa um fundo da biblioteca na ministração da tela (não gasta cota nem IA) */
  useBackground: (id: string, backgroundId: string) =>
    api<ScreenState>(`/screens/${id}/background`, { method: 'PUT', body: { background_id: backgroundId } }),
  deleteBackground: (backgroundId: string) => api<void>(`/screens/library/${backgroundId}`, { method: 'DELETE' }),
  end: (id: string) => api<void>(`/screens/${id}`, { method: 'DELETE' }),
};

/** Tela conectada a este aparelho: vale para todas as ministrações abertas no púlpito. */
const ACTIVE_KEY = 'screen:active';
export const rememberScreen = (screen: { id: string; code: string } | null) => kvSet(ACTIVE_KEY, screen);
export const rememberedScreen = () => kvGet<{ id: string; code: string } | null>(ACTIVE_KEY);

/** Código do QR code: aceita o link inteiro lido pela câmera ou o código digitado. */
export function codeFrom(raw: string): string {
  const m = raw.match(/[?&]code=([A-Za-z0-9]+)/);
  return (m ? m[1] : raw).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

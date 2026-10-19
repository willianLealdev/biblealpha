// Perguntas à IA com resposta em tempo real (Server-Sent Events sobre fetch).

import { fetch as expoFetch } from 'expo/fetch';
import { Platform } from 'react-native';

import { API_BASE, ApiError, api, getAccessToken, refreshSession } from './api';

export type AIMode =
  | 'simple'
  | 'deep'
  | 'historical'
  | 'exegesis'
  | 'theological'
  | 'devotional'
  | 'sermon'
  | 'interpretations'
  | 'context';

export const AI_MODES: AIMode[] = [
  'simple',
  'deep',
  'historical',
  'exegesis',
  'theological',
  'devotional',
  'sermon',
  'interpretations',
  'context',
];

export type AskBody = {
  translation: string;
  mode: AIMode;
  question?: string | null;
  verse_key_start?: number | null;
  verse_key_end?: number | null;
  conversation_id?: string | null;
};

export type AIEvent =
  | { type: 'start'; conversation_id: string | null }
  | { type: 'delta'; text: string }
  | { type: 'done'; message_id?: string; invalid_references: string[]; off_topic?: boolean }
  | { type: 'error'; code: string };

export type AIStatus = { plan: 'free' | 'pro'; enabled: boolean; modes: AIMode[]; free_remaining_today?: number };

export type ConversationSummary = {
  id: string;
  title: string;
  translation: string;
  verse_key_start: number | null;
  verse_key_end: number | null;
  mode: AIMode;
  saved: boolean;
  updated_at: string;
};

export type ConversationDetail = ConversationSummary & {
  messages: {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    invalid_references: string[];
    feedback: number | null;
    created_at: string;
  }[];
};

const doFetch = (Platform.OS === 'web' ? globalThis.fetch : expoFetch) as typeof globalThis.fetch;

async function open(body: AskBody, signal?: AbortSignal): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'text/event-stream' };
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (Platform.OS === 'web') headers['X-BA-Client'] = 'web';
  return doFetch(`${API_BASE}/ai/ask`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    credentials: 'include',
    signal,
  });
}

/** Envia a pergunta e chama onEvent a cada trecho recebido. Erros de cota viram ApiError. */
export async function askAI(body: AskBody, onEvent: (e: AIEvent) => void, signal?: AbortSignal): Promise<void> {
  let response: Response;
  try {
    response = await open(body, signal);
    if (response.status === 401 && (await refreshSession())) response = await open(body, signal);
  } catch (e: any) {
    if (e?.name === 'AbortError') return;
    throw new ApiError(0, 'network_error', 'Network request failed');
  }
  if (!response.ok) {
    let data: any = null;
    try {
      data = await response.json();
    } catch {
      // sem corpo
    }
    throw new ApiError(response.status, data?.error?.code ?? 'unknown_error', data?.error?.message ?? '');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new ApiError(0, 'stream_unsupported', 'Streaming not supported');
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index: number;
    while ((index = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      for (const line of chunk.split('\n')) {
        if (line.startsWith('data: ')) onEvent(JSON.parse(line.slice(6)) as AIEvent);
      }
    }
  }
}

export const aiApi = {
  status: () => api<AIStatus>('/ai/status'),
  conversations: (saved?: boolean) =>
    api<{ conversations: ConversationSummary[] }>(`/ai/conversations${saved === undefined ? '' : `?saved=${saved}`}`),
  conversation: (id: string) => api<ConversationDetail>(`/ai/conversations/${id}`),
  save: (id: string, saved: boolean) => api<ConversationSummary>(`/ai/conversations/${id}`, { method: 'PATCH', body: { saved } }),
  remove: (id: string) => api(`/ai/conversations/${id}`, { method: 'DELETE' }),
  feedback: (messageId: string, value: 1 | -1 | 0) =>
    api(`/ai/messages/${messageId}/feedback`, { method: 'POST', body: { value } }),
};

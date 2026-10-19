import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { API_BASE, ApiError, api, getAccessToken, refreshSession } from './api';

export type Kind = 'expository' | 'thematic' | 'textual' | 'bible_study' | 'evangelistic' | 'devotional' | 'small_group';
export const KINDS: Kind[] = ['expository', 'thematic', 'textual', 'bible_study', 'evangelistic', 'devotional', 'small_group'];
export type Role = 'intro' | 'point' | 'application' | 'conclusion' | 'appeal' | 'other';

export type Block =
  | { id: string; type: 'section'; role: Role; title: string }
  | { id: string; type: 'text'; text: string }
  | {
      id: string;
      type: 'scripture';
      reference: string;
      translation: string;
      verse_key_start: number;
      verse_key_end: number;
      verses: { chapter: number; verse: number; text: string }[];
    }
  | { id: string; type: 'note'; text: string };

export type SermonSummary = {
  id: string;
  title: string;
  theme: string | null;
  main_reference: string | null;
  kind: Kind;
  folder: string | null;
  tags: string[];
  scheduled_for: string | null;
  duration_minutes: number | null;
  updated_at: string;
  deleted_at: string | null;
};

export type Sermon = SermonSummary & {
  other_references: string[];
  objective: string | null;
  audience: string | null;
  event: string | null;
  content: { blocks: Block[] };
  pulpit_notes: string;
  version: number;
};

export type SermonMeta = Partial<
  Pick<Sermon, 'title' | 'theme' | 'main_reference' | 'other_references' | 'kind' | 'objective' | 'audience' | 'event' | 'scheduled_for' | 'duration_minutes' | 'folder' | 'tags'>
>;

export const ASSIST_ACTIONS = [
  'explain',
  'context',
  'related',
  'word',
  'summarize',
  'expand',
  'issues',
  'examples',
  'questions',
  'organize',
  'outline',
  'study',
] as const;
export type AssistAction = (typeof ASSIST_ACTIONS)[number];

/** Ações que só esclarecem dúvidas (para todos). As que criam conteúdo para ministrar são do admin. */
export const CLARIFY_ACTIONS: AssistAction[] = ['explain', 'context', 'related', 'word', 'issues'];

export function newBlockId() {
  return Math.random().toString(36).slice(2, 14);
}

export const sermonApi = {
  list: (q = '', folder?: string | null, trash = false) => {
    const params = new URLSearchParams({ q, trash: String(trash) });
    if (folder) params.set('folder', folder);
    return api<{ sermons: SermonSummary[]; folders: string[] }>(`/sermons?${params}`);
  },
  get: (id: string) => api<Sermon>(`/sermons/${id}`),
  create: (body: SermonMeta & { use_template?: boolean }) => api<Sermon>('/sermons', { method: 'POST', body }),
  save: (id: string, body: SermonMeta & { base_version: number; content?: { blocks: Block[] } }) =>
    api<Sermon>(`/sermons/${id}`, { method: 'PUT', body }),
  versions: (id: string) => api<{ versions: { id: string; version: number; title: string; created_at: string }[] }>(`/sermons/${id}/versions`),
  restoreVersion: (id: string, versionId: string) => api<Sermon>(`/sermons/${id}/versions/${versionId}/restore`, { method: 'POST' }),
  duplicate: (id: string) => api<Sermon>(`/sermons/${id}/duplicate`, { method: 'POST' }),
  trash: (id: string) => api(`/sermons/${id}`, { method: 'DELETE' }),
  restore: (id: string) => api<Sermon>(`/sermons/${id}/restore`, { method: 'POST' }),
  pulpitNote: (id: string, text: string) => api<{ pulpit_notes: string }>(`/sermons/${id}/pulpit-notes`, { method: 'POST', body: { text } }),
  generate: (body: { theme: string; main_reference: string; objective?: string; duration_minutes: number; level: string; kind: Kind }) =>
    api<Sermon>('/sermons/generate', { method: 'POST', body }),
  assist: (id: string, action: AssistAction, text: string) =>
    api<{ suggestion: string; invalid_references: string[] }>(`/sermons/${id}/assist`, { method: 'POST', body: { action, text } }),
  passage: (translation: string, ref: string) =>
    api<{ passages: { label: string; translation: string; reference: any; verses: { chapter: number; verse: number; text: string }[] }[] }>(
      `/bible/${translation}/passage?ref=${encodeURIComponent(ref)}`,
      { auth: false },
    ),
};

/** Baixa um arquivo da API com o token (DOCX). Navegador: download; celular: compartilhar. */
export async function downloadFile(path: string, filename: string, mime: string) {
  const go = () =>
    fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${getAccessToken() ?? ''}`, ...(Platform.OS === 'web' ? { 'X-BA-Client': 'web' } : {}) },
      credentials: 'include',
    });
  let res = await go();
  if (res.status === 401 && (await refreshSession())) res = await go();
  if (!res.ok) throw new ApiError(res.status, 'download_failed', 'Download failed');
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(bytes);
  await Sharing.shareAsync(file.uri, { mimeType: mime, dialogTitle: filename });
}

// Referências digitadas no texto ("Jo 3:16", "Romanos 12:1-2", "2 Reis 13:20–21")
const FIND_RE = /(?<![\p{L}\d])((?:[123]\s?)?\p{L}{2,}\.?\s+\d{1,3}[:.]\d{1,3}(?:\s*[-‐‑‒–—]\s*\d{1,3}(?:[:.]\d{1,3})?)?)/gu;

export function findReferenceCandidates(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(FIND_RE)) {
    const candidate = m[1].trim();
    if (!out.includes(candidate)) out.push(candidate);
  }
  return out;
}

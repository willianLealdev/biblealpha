// Painel: histórias do BibleAlpha Kids (rascunho da IA → revisão → publicada).

import { API_BASE, ApiError, api, getAccessToken, refreshSession } from './api';

export type KidsStatus = 'draft' | 'review' | 'published';
export type KidsLevel = 'small' | 'big' | 'both';
export type KidsLanguage = 'pt-BR' | 'en' | 'es';

export type KidsStoryRow = {
  id: string;
  slug: string;
  language: KidsLanguage;
  title: string;
  summary: string;
  reference: string;
  level: KidsLevel;
  status: KidsStatus;
  pages: number;
  published_at: string | null;
  updated_at: string | null;
};

export type KidsPage = { text: string; image_prompt: string };
export type KidsQuiz = { question: string; options: string[]; answer: number; explanation: string };
export type KidsVerse = {
  id: string;
  language: KidsLanguage;
  reference: string;
  text: string;
  level: KidsLevel;
  status: KidsStatus;
  position: number;
};

export type KidsStoryDetail = KidsStoryRow & {
  lesson: string;
  family_question: string;
  translation: string;
  ai_meta: { model?: string; characters?: { name: string; description: string }[] };
  page_list: KidsPage[];
  quiz: KidsQuiz[];
  passage: { chapter: number; verse: number; text: string }[];
};

export type KidsGenerate = {
  reference: string;
  language: KidsLanguage;
  level: KidsLevel;
  tone: 'joyful' | 'calm' | 'adventure';
  length: 'short' | 'medium' | 'long';
};

export const kidsAdminApi = {
  list: (status?: KidsStatus) =>
    api<{ stories: KidsStoryRow[]; totals: Record<KidsStatus, number> }>(
      `/admin/kids/stories${status ? `?status=${status}` : ''}`,
    ),
  get: (id: string) => api<KidsStoryDetail>(`/admin/kids/stories/${id}`),
  // A IA pode levar mais de um minuto escrevendo
  generate: (body: KidsGenerate) =>
    api<KidsStoryDetail>('/admin/kids/stories/generate', { method: 'POST', body, timeoutMs: 300_000 }),
  save: (
    id: string,
    body: Pick<KidsStoryDetail, 'title' | 'summary' | 'level' | 'lesson' | 'family_question' | 'quiz'> & { pages: KidsPage[] },
  ) => api<KidsStoryDetail>(`/admin/kids/stories/${id}`, { method: 'PUT', body }),
  setStatus: (id: string, status: KidsStatus) =>
    api<KidsStoryDetail>(`/admin/kids/stories/${id}/status`, { method: 'POST', body: { status } }),
  remove: (id: string) => api(`/admin/kids/stories/${id}`, { method: 'DELETE' }),
  publishAll: () => api<{ published: number }>('/admin/kids/stories/publish-all', { method: 'POST' }),
  importStarter: (language: KidsLanguage = 'pt-BR') =>
    api<{ created: number }>(`/admin/kids/stories/import?language=${language}`, { method: 'POST' }),
  verses: (language: KidsLanguage) => api<{ verses: KidsVerse[] }>(`/admin/kids/verses?language=${language}`),
  addVerse: (body: { reference: string; language: KidsLanguage; level: KidsLevel }) =>
    api<KidsVerse>('/admin/kids/verses', { method: 'POST', body }),
  addSuggested: (language: KidsLanguage) =>
    api<{ created: number }>(`/admin/kids/verses/suggested?language=${language}`, { method: 'POST' }),
  publishAllVerses: (language: KidsLanguage) =>
    api<{ published: number }>(`/admin/kids/verses/publish-all?language=${language}`, { method: 'POST' }),
  updateVerse: (id: string, body: { status?: KidsStatus; level?: KidsLevel }) =>
    api<KidsVerse>(`/admin/kids/verses/${id}`, { method: 'PATCH', body }),
  removeVerse: (id: string) => api(`/admin/kids/verses/${id}`, { method: 'DELETE' }),
};

// ---------- Vídeos ----------

export type KidsVideo = {
  id: string;
  title: string;
  description: string;
  language: string;
  level: KidsLevel;
  status: 'uploading' | KidsStatus;
  mime: string;
  size: number;
  chunk_size: number;
  chunks: number;
  received_chunks: number;
  received_bytes: number;
  has_poster: boolean;
  published_at: string | null;
};

/** Envio de arquivo bruto (pedaço do vídeo ou capa), com o login do administrador. */
async function sendRaw(path: string, data: Blob, contentType: string) {
  const send = () => {
    const headers: Record<string, string> = { 'Content-Type': contentType, Accept: 'application/json', 'X-BA-Client': 'web' };
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${API_BASE}${path}`, { method: 'PUT', body: data, headers, credentials: 'include' });
  };
  let r = await send();
  // Envio longo: o acesso pode vencer no meio; renova uma vez e manda de novo
  if (r.status === 401 && (await refreshSession())) r = await send();
  if (!r.ok) {
    let code = 'unknown_error';
    try {
      code = (await r.json())?.error?.code ?? code;
    } catch {
      // resposta sem JSON
    }
    throw new ApiError(r.status, code, r.statusText);
  }
}

export const kidsVideosApi = {
  list: () => api<{ videos: KidsVideo[] }>('/admin/kids/videos'),
  update: (id: string, body: Partial<Pick<KidsVideo, 'title' | 'description' | 'language' | 'level'>> & { status?: KidsStatus }) =>
    api<KidsVideo>(`/admin/kids/videos/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => api(`/admin/kids/videos/${id}`, { method: 'DELETE' }),
  /** Envia o vídeo em pedaços (cada um cabe no limite do site), com até 3 tentativas por pedaço. */
  async upload(
    file: File,
    info: { title: string; description: string; language: string; level: KidsLevel },
    onProgress: (fraction: number) => void,
    poster?: File | null,
  ): Promise<KidsVideo> {
    const video = await api<KidsVideo>('/admin/kids/videos', {
      method: 'POST',
      body: { ...info, mime: file.type || 'video/mp4', size: file.size },
    });
    for (let n = 0; n < video.chunks; n++) {
      const part = file.slice(n * video.chunk_size, Math.min(file.size, (n + 1) * video.chunk_size));
      for (let attempt = 1; ; attempt++) {
        try {
          await sendRaw(`/admin/kids/videos/${video.id}/chunks/${n}`, part, 'application/octet-stream');
          break;
        } catch (e) {
          if (attempt >= 3) throw e;
        }
      }
      onProgress((n + 1) / video.chunks);
    }
    if (poster) await sendRaw(`/admin/kids/videos/${video.id}/poster`, poster, poster.type);
    return api<KidsVideo>(`/admin/kids/videos/${video.id}/complete`, { method: 'POST' });
  },
  setPoster: (id: string, poster: File) => sendRaw(`/admin/kids/videos/${id}/poster`, poster, poster.type),
};

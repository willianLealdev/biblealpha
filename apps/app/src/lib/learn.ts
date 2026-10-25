// Página Aprender: capas (geradas pelo admin com a IA de imagem).

import { API_BASE, api } from './api';

export const learnApi = {
  covers: () => api<{ covers: Record<string, string> }>('/learn/covers', { auth: false }),
  adminCovers: () => api<{ items: { key: string; image_id: string | null }[] }>('/admin/learn/covers'),
  generate: (key: string) =>
    api<{ key: string; image_id: string }>(`/admin/learn/covers/${encodeURIComponent(key)}`, { method: 'POST', timeoutMs: 280_000 }),
  remove: (key: string) => api<void>(`/admin/learn/covers/${encodeURIComponent(key)}`, { method: 'DELETE' }),
};

export const coverUrl = (imageId: string) => `${API_BASE}/learn/covers/image/${imageId}`;

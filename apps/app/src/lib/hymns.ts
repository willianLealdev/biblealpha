// Harpa Cristã: 640 hinos em ordem (hinário das Assembleias de Deus).

import { api } from './api';

export type HymnSummary = { n: number; title: string; first_line: string };
export type Hymn = { n: number; title: string; chorus: string | null; verses: string[]; prev: number | null; next: number | null };

export const hymnsApi = {
  list: (q = '') => api<{ total: number; hymns: HymnSummary[] }>(`/hymns${q ? `?q=${encodeURIComponent(q)}` : ''}`, { auth: false }),
  get: (n: number) => api<Hymn>(`/hymns/${n}`, { auth: false }),
};

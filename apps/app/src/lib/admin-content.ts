// Painel: Bíblias e idiomas do app (aparecem para os usuários sem atualizar o app).

import { api } from './api';

export type AdminBible = {
  code: string;
  name: string;
  abbreviation: string;
  language: string;
  language_name: string | null;
  license: string;
  verse_count: number;
  is_active: boolean;
  is_default: boolean;
  ebible_id: string | null;
  books: string[] | null;
  incomplete_books: string[];
  imported_at: string | null;
};

export type CatalogItem = {
  id: string;
  language_code: string;
  language: string;
  language_name: string;
  language_name_en: string;
  title: string;
  description: string;
  copyright: string;
  public_domain: boolean;
  ot_books: number;
  nt_books: number;
  updated: string;
  imported_as: string | null;
};

export type AdminLanguage = { code: string; name: string; enabled: boolean; version: number; direction?: string; keys?: number };

export const biblesApi = {
  list: () => api<{ translations: AdminBible[] }>('/admin/bibles'),
  catalog: (params: { q?: string; language?: string; full_only?: boolean }) => {
    const qs = new URLSearchParams({
      q: params.q ?? '',
      language: params.language ?? '',
      full_only: String(!!params.full_only),
    });
    return api<{ items: CatalogItem[]; total: number; languages: { code: string; name: string }[] }>(`/admin/bibles/catalog?${qs}`);
  },
  import: (ebible_id: string, code?: string) => api<AdminBible>('/admin/bibles/import', { method: 'POST', body: { ebible_id, code } }),
  update: (code: string, body: Partial<Pick<AdminBible, 'name' | 'abbreviation' | 'is_active'>>) =>
    api<AdminBible>(`/admin/bibles/${code}`, { method: 'PATCH', body }),
  setDefault: (code: string) => api('/admin/bibles/default', { method: 'PUT', body: { code } }),
  remove: (code: string) => api(`/admin/bibles/${code}`, { method: 'DELETE' }),
  importAll: (update = false) => api('/admin/bibles/import-all', { method: 'POST', body: { update } }),
  importAllStatus: () => api<BulkStatus>('/admin/bibles/import-all'),
};

export type BulkStatus = {
  running?: boolean;
  total?: number;
  done?: number;
  imported?: number;
  failed?: { id: string; error: string }[];
  current?: string | null;
  finished_at?: string | null;
};

export const languagesApi = {
  list: () => api<{ builtin: AdminLanguage[]; items: AdminLanguage[] }>('/admin/languages'),
  get: (code: string) =>
    api<AdminLanguage & { texts: Record<string, string>; books: Record<string, { name: string; abbr: string }> }>(
      `/admin/languages/${code}`,
    ),
  create: (body: { code: string; name: string; source: object }) =>
    api<AdminLanguage & { translated: number; total: number; books: number }>('/admin/languages', { method: 'POST', body }),
  update: (code: string, body: { name?: string; enabled?: boolean; texts?: Record<string, string> }) =>
    api<AdminLanguage>(`/admin/languages/${code}`, { method: 'PATCH', body }),
  remove: (code: string) => api(`/admin/languages/${code}`, { method: 'DELETE' }),
};

export type AgendaDay = {
  day: string;
  locale: 'pt-BR' | 'en' | 'es';
  theme: string;
  reference: string;
  status: 'none' | 'auto' | 'edited';
  content: {
    title: string;
    context?: string;
    reflection?: string;
    application?: string;
    questions?: string[];
    prayer?: string;
  } | null;
};

export const devotionalAdminApi = {
  agenda: (locale: string, start?: string, days = 30) =>
    api<{ themes: { code: string; label: string }[]; days: AgendaDay[] }>(
      `/admin/devotionals?locale=${locale}&days=${days}${start ? `&start=${start}` : ''}`,
    ),
  generate: (body: { day: string; locales: string[]; theme?: string; reference?: string; length?: string }) =>
    api<{ days: AgendaDay[] }>('/admin/devotionals/generate', { method: 'POST', body }),
  save: (body: { day: string; locale: string; theme: string; reference: string; content: NonNullable<AgendaDay['content']> }) =>
    api<AgendaDay>('/admin/devotionals', { method: 'PUT', body }),
  reset: (day: string, locale: string) => api<AgendaDay>(`/admin/devotionals/${day}/${locale}`, { method: 'DELETE' }),
};

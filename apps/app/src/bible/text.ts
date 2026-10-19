// Texto bíblico: lê do pacote offline (se baixado), depois do cache de capítulos, depois da API.

import { api, API_BASE } from '@/lib/api';
import { kvGet, kvSet } from '@/lib/kv';

import { BOOKS } from './books';

export type Verse = { verse: number; text: string };
export type ChapterData = {
  translation: string;
  book: string;
  chapter: number;
  verses: Verse[];
  prev: { book: string; chapter: number } | null;
  next: { book: string; chapter: number } | null;
};

export type Translation = {
  code: string;
  name: string;
  abbreviation: string;
  language: string;
  /** Nome do idioma nele mesmo (ex.: "Français") e em inglês */
  language_name: string;
  language_name_en: string;
  description: string;
  year: number | null;
  license: string;
  verse_count: number;
  sha256: string;
  /** Padrão do idioma (escolhida no painel) */
  is_default: boolean;
  /** Livros disponíveis quando a tradução é incompleta (ex.: só o Novo Testamento); null = todos */
  books: string[] | null;
  direction: 'ltr' | 'rtl';
};

export type TranslationDetail = Translation & {
  edition: string;
  license_url: string | null;
  attribution: string;
  source_url: string;
  notes: Record<string, unknown>;
};

type OfflineMeta = { sha256: string; downloadedAt: string };
type BookPack = [number, number, string][]; // [capítulo, versículo, texto]

const TRANSLATIONS_KEY = 'bible:translations:v2';
let memory: { at: number; list: Translation[] } | null = null;

/** Mais de mil traduções: guarda a lista no aparelho e só baixa de novo se mudou (ETag). */
export async function listTranslations(): Promise<Translation[]> {
  if (memory && Date.now() - memory.at < 10 * 60_000) return memory.list;
  const cached = await kvGet<{ etag: string | null; list: Translation[] }>(TRANSLATIONS_KEY);
  try {
    const res = await fetch(`${API_BASE}/bible/translations`, {
      headers: cached?.etag ? { 'If-None-Match': cached.etag } : {},
    });
    if (res.status === 304 && cached) {
      memory = { at: Date.now(), list: cached.list };
      return cached.list;
    }
    if (!res.ok) throw new Error(`translations: ${res.status}`);
    const list = (await res.json()) as Translation[];
    await kvSet(TRANSLATIONS_KEY, { etag: res.headers.get('etag'), list });
    memory = { at: Date.now(), list };
    return list;
  } catch (e) {
    if (cached) return cached.list;
    throw e;
  }
}

export function getTranslationDetail(code: string) {
  return api<TranslationDetail>(`/bible/translations/${code}`, { auth: false });
}

function neighbors(book: string, chapter: number) {
  const index = BOOKS.findIndex((b) => b.code === book);
  const b = BOOKS[index];
  const prev =
    chapter > 1
      ? { book, chapter: chapter - 1 }
      : index > 0
        ? { book: BOOKS[index - 1].code, chapter: BOOKS[index - 1].chapters }
        : null;
  const next =
    chapter < b.chapters ? { book, chapter: chapter + 1 } : index < BOOKS.length - 1 ? { book: BOOKS[index + 1].code, chapter: 1 } : null;
  return { prev, next };
}

export async function getChapter(translation: string, book: string, chapter: number): Promise<ChapterData> {
  // 1. Pacote completo baixado para uso offline
  const pack = await kvGet<BookPack>(`bible:${translation}:book:${book}`);
  if (pack) {
    return {
      translation,
      book,
      chapter,
      verses: pack.filter(([c]) => c === chapter).map(([, verse, text]) => ({ verse, text })),
      ...neighbors(book, chapter),
    };
  }
  // 2. API (e guarda o capítulo para reler sem internet)
  const cacheKey = `bible:${translation}:chapter:${book}:${chapter}`;
  try {
    const data = await api<ChapterData>(`/bible/${translation}/chapters/${book}/${chapter}`, { auth: false });
    kvSet(cacheKey, data);
    return data;
  } catch (e) {
    const cached = await kvGet<ChapterData>(cacheKey);
    if (cached) return cached;
    throw e;
  }
}

export async function offlineStatus(translation: string): Promise<OfflineMeta | null> {
  return kvGet<OfflineMeta>(`bible:${translation}:offline`);
}

/** Baixa a tradução inteira (~5 MB) e guarda livro por livro. */
export async function downloadTranslation(translation: string, onProgress?: (fraction: number) => void) {
  onProgress?.(0.05);
  const response = await fetch(`${API_BASE}/bible/${translation}/download`);
  if (!response.ok) throw new Error(`download failed: ${response.status}`);
  const data = (await response.json()) as { sha256: string; books: Record<string, BookPack> };
  onProgress?.(0.5);
  const codes = Object.keys(data.books);
  for (let i = 0; i < codes.length; i++) {
    await kvSet(`bible:${translation}:book:${codes[i]}`, data.books[codes[i]]);
    onProgress?.(0.5 + (0.5 * (i + 1)) / codes.length);
  }
  const meta: OfflineMeta = { sha256: data.sha256, downloadedAt: new Date().toISOString() };
  await kvSet(`bible:${translation}:offline`, meta);
  return meta;
}

// BibleAlpha Kids: leitura do conteúdo publicado. Sem login, sem token, nada da criança é enviado.

import { Platform } from 'react-native';

import type { KidsLanguage } from './strings';

const ORIGIN = (process.env.EXPO_PUBLIC_API_URL ?? (Platform.OS === 'web' ? '' : 'https://biblealpha.com')).replace(/\/$/, '');
const BASE = `${ORIGIN}/api/v1`;

export type KidsLevel = 'small' | 'big';

export type StoryCard = {
  slug: string;
  title: string;
  summary: string;
  reference: string;
  level: 'small' | 'big' | 'both';
  pages: number;
  quiz: number;
};

export type QuizQuestion = { question: string; options: string[]; answer: number; explanation: string };
export type Verse = { reference: string; text: string };
export type BibleInfo = { code: string; name: string; abbreviation: string };
export type BibleBook = {
  code: string;
  testament: 'OT' | 'NT';
  chapters: number;
  names: Record<'pt-BR' | 'en' | 'es', { name: string; abbr: string }>;
};

export type Story = Omit<StoryCard, 'pages' | 'quiz'> & {
  pages: { text: string }[];
  quiz: QuizQuestion[];
  lesson: string;
  family_question: string;
};

export class KidsNotFound extends Error {}
/** A história ainda está sendo traduzida para o idioma (a primeira vez demora um pouco). */
export class KidsPreparing extends Error {}

export async function kidsFetch<T>(path: string, method = 'GET'): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const r = await fetch(`${BASE}${path}`, { method, headers: { Accept: 'application/json' }, signal: controller.signal });
    if (r.status === 404) throw new KidsNotFound();
    if (r.status === 503) throw new KidsPreparing();
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export const kidsPost = <T = unknown>(path: string) => kidsFetch<T>(path, 'POST');
const get = kidsFetch;

export type VideoCard = { id: string; title: string; description: string; language: string; has_poster: boolean };

export const kidsApi = {
  stories: (language: KidsLanguage, level: KidsLevel) =>
    get<{ stories: StoryCard[]; preparing: number }>(`/kids/stories?language=${encodeURIComponent(language)}&level=${level}`),
  story: (slug: string, language: KidsLanguage) => get<Story>(`/kids/stories/${encodeURIComponent(slug)}?language=${encodeURIComponent(language)}`),
  verses: (language: KidsLanguage, level: KidsLevel) =>
    get<{ verses: Verse[] }>(`/kids/verses?language=${encodeURIComponent(language)}&level=${level}`).then((r) => r.verses),
  bibles: (language: KidsLanguage) => get<{ bibles: BibleInfo[] }>(`/kids/bibles?language=${encodeURIComponent(language)}`).then((r) => r.bibles),
  videos: (language: KidsLanguage, level: KidsLevel) =>
    get<{ videos: VideoCard[] }>(`/kids/videos?language=${encodeURIComponent(language)}&level=${level}`).then((r) => r.videos),
  videoUrl: (id: string) => `${BASE}/kids/videos/${id}/file`,
  posterUrl: (id: string) => `${BASE}/kids/videos/${id}/poster`,
  // Texto bíblico: as mesmas rotas públicas da Bíblia do app oficial (só leitura)
  books: () => get<BibleBook[]>('/bible/books'),
  chapter: (code: string, book: string, chapter: number) =>
    get<{ verses: { verse: number; text: string }[] }>(`/bible/${code}/chapters/${book}/${chapter}`).then((r) => r.verses),
};

/** Nome do livro no idioma: os que vêm prontos, os traduzidos para o app, senão em inglês. */
export function bookName(book: BibleBook, language: string, translated: Record<string, { name: string }>): string {
  return (book.names as Record<string, { name: string }>)[language]?.name ?? translated[book.code]?.name ?? book.names.en.name;
}

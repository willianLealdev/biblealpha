// Fase 6: texto original, léxico, referências cruzadas e comparador.

import { api } from './api';

export type OriginalWord = {
  text: string;
  translit: string;
  gloss_en: string;
  gloss_es: string | null;
  /** Significado no idioma do usuário */
  gloss: string;
  strong: string | null;
  morph: string;
};
export type OriginalChapter = {
  book: string;
  chapter: number;
  language: 'hebrew' | 'greek';
  direction: 'rtl' | 'ltr';
  verses: { verse: number; words: OriginalWord[] }[];
  credit: string;
};
export type LexiconEntry = {
  strong: string;
  lemma: string;
  translit: string;
  morph: string;
  gloss: string;
  definition: string;
  occurrences: number;
  verses: number[];
  credit: string;
};
export type CrossRef = { start: number; end: number; votes: number; text: string };
export type Compared = { code: string; name: string; abbreviation: string; language: string; verses: { verse: number; text: string }[] };

export const studyTools = {
  original: (book: string, chapter: number, locale: string, verse?: number) =>
    api<OriginalChapter>(`/bible/original/${book}/${chapter}?locale=${encodeURIComponent(locale)}${verse ? `&verse=${verse}` : ''}`, { auth: false }),
  lexicon: (strong: string, locale: string) =>
    api<LexiconEntry>(`/bible/lexicon/${encodeURIComponent(strong)}?locale=${encodeURIComponent(locale)}`, { auth: false }),
  crossrefs: (key: number, translation: string) =>
    api<{ items: CrossRef[]; credit: string }>(`/bible/crossrefs/${key}?translation=${translation}&limit=30`, { auth: false }),
  compare: (start: number, end: number, translations: string[]) =>
    api<{ items: Compared[] }>(`/bible/compare?start=${start}&end=${end}&translations=${translations.join(',')}`, { auth: false }),
};

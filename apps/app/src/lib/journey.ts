// Acompanhamento dos planos de leitura: texto de cada leitura e sugestões de próximos planos.

import { getChapter, listTranslations, type Verse } from '@/bible/text';
import { loadTranslation } from '@/bible/reader-state';

import type { Enrollment, PlanSummary, Reading } from './devotional';

export type ReadingText = { chapter: number; verses: Verse[] }[];

/** Versículos de uma leitura do plano (pode atravessar capítulos: "GEN 1-3", "JHN 2:1-11"). */
export async function readingText(translation: string, r: Reading): Promise<ReadingText> {
  const out: ReadingText = [];
  for (let c = r.chapter; c <= r.chapter_end; c++) {
    const data = await getChapter(translation, r.book, c);
    const from = c === r.chapter && r.verse_start ? r.verse_start : 1;
    const to = c === r.chapter_end && r.verse_end ? r.verse_end : Number.MAX_SAFE_INTEGER;
    out.push({ chapter: c, verses: data.verses.filter((v) => v.verse >= from && v.verse <= to) });
  }
  return out;
}

/** Tradução do leitor (a mesma que a pessoa usa na Bíblia) e o idioma dela, para a voz. */
export async function readerTranslation(locale: string): Promise<{ code: string; language: string }> {
  const code = await loadTranslation(locale);
  const list = await listTranslations().catch(() => []);
  return { code, language: list.find((x) => x.code === code)?.language ?? locale };
}

/** Próximos planos: os da mesma categoria primeiro, nunca os que a pessoa já está fazendo ou fez. */
export function suggestPlans(all: PlanSummary[], mine: Enrollment[], after: string, n = 4): PlanSummary[] {
  const taken = new Set(mine.map((e) => e.plan.code));
  const category = all.find((p) => p.code === after)?.category;
  const free = all.filter((p) => !taken.has(p.code) && p.code !== after);
  return [...free.filter((p) => p.category === category), ...free.filter((p) => p.category !== category)].slice(0, n);
}

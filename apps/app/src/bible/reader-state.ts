// Tradução e posição de leitura atuais, guardadas no aparelho e na conta.

import { api } from '@/lib/api';
import { kvGet, kvSet } from '@/lib/kv';
import { loadWorld } from '@/lib/world';

import { listTranslations } from './text';

export type Position = { book: string; chapter: number; verse?: number | null };

const POSITION_KEY = 'reader:position';

function lang2(code: string) {
  return code.toLowerCase().split('-')[0];
}

// A escolha fica guardada por idioma do app: trocar o idioma troca a Bíblia junto
const translationKey = (locale: string) => `reader:translation:${lang2(locale)}`;

const FALLBACK: Record<string, string> = { pt: 'blivre', en: 'web', es: 'rv1909' };

/** Tradução padrão do idioma (definida no painel); sem conexão, a padrão embutida. */
export async function defaultTranslation(locale: string): Promise<string> {
  try {
    // Lista mundial: a Bíblia do idioma (ex.: iorubá → "yor"), mesmo com código diferente
    const world = await loadWorld().catch(() => null);
    const fromWorld = world?.languages.find((l) => l.code === locale)?.bible;
    if (fromWorld) return fromWorld;
    const list = await listTranslations();
    const lang = lang2(locale);
    const pick =
      list.find((t) => t.is_default && lang2(t.language) === lang) ??
      list.find((t) => lang2(t.language) === lang) ??
      list.find((t) => t.is_default && lang2(t.language) === 'en') ??
      list[0];
    if (pick) return pick.code;
  } catch {
    // offline e sem lista guardada
  }
  return FALLBACK[lang2(locale)] ?? 'web';
}

export async function loadTranslation(locale: string): Promise<string> {
  return (await kvGet<string>(translationKey(locale))) ?? defaultTranslation(locale);
}

export function saveTranslation(code: string, locale: string) {
  return kvSet(translationKey(locale), code);
}

/** Onde parar: posição local; senão a da conta (outro aparelho); senão Gênesis 1. */
export async function loadPosition(): Promise<Position> {
  const local = await kvGet<Position>(POSITION_KEY);
  if (local) return local;
  try {
    const { progress } = await api<{ progress: (Position & { translation_code: string }) | null }>(
      '/me/reading-progress',
    );
    if (progress) return { book: progress.book, chapter: progress.chapter, verse: progress.verse };
  } catch {
    // offline
  }
  return { book: 'GEN', chapter: 1 };
}

let pending: ReturnType<typeof setTimeout> | null = null;

export function savePosition(position: Position, translation: string) {
  kvSet(POSITION_KEY, position);
  if (pending) clearTimeout(pending);
  // Envia para a conta só quando o leitor para num capítulo (não a cada toque)
  pending = setTimeout(() => {
    api('/me/reading-progress', {
      method: 'PUT',
      body: { translation_code: translation, book: position.book, chapter: position.chapter, verse: position.verse ?? null },
    }).catch(() => {});
  }, 1500);
}

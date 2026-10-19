// Referências bíblicas em português, inglês e espanhol ("Jo 3:16", "2 Reis 13:20–21", "Rm 12:1,2"...).
// Mesmas regras de services/api/app/bible/reference.py; os dois usam tests/fixtures/references.json.

import { BOOKS, type Book } from './books';

export type Reference = {
  book: string;
  chapter: number;
  verseStart: number | null;
  chapterEnd: number;
  verseEnd: number | null;
};

export class ReferenceError extends Error {}

type BuiltinLang = 'pt' | 'en' | 'es';

/** Nomes dos livros de idiomas instalados pelo painel (sem atualizar o app). */
const extraNames = new Map<string, Record<string, { name: string; abbr: string }>>();

export function registerBookNames(locale: string, names: Record<string, { name: string; abbr: string }>) {
  extraNames.set(locale, names);
  tables.delete(locale);
}

export const bookByCode: Record<string, Book> = Object.fromEntries(BOOKS.map((b) => [b.code, b]));
export const bookById: Record<number, Book> = Object.fromEntries(BOOKS.map((b) => [b.id, b]));

const ORDINALS: Record<string, string> = {
  iii: '3',
  ii: '2',
  i: '1',
  primeiro: '1',
  primeira: '1',
  segundo: '2',
  segunda: '2',
  terceiro: '3',
  terceira: '3',
  primero: '1',
  primer: '1',
  primera: '1',
  tercero: '3',
  tercera: '3',
  first: '1',
  second: '2',
  third: '3',
};

function stripAccents(text: string) {
  return text.normalize('NFD').replace(/\p{M}/gu, '');
}

function normBook(text: string, keepAccents: boolean): string {
  let t = text.toLowerCase().replace(/\./g, ' ').trim();
  if (!keepAccents) t = stripAccents(t);
  t = t.replace(/\s+/g, ' ');
  const m = t.match(/^(iii|ii|i|primeir[oa]|primer[oa]?|segund[oa]|terceir[oa]|tercer[oa]|first|second|third)\s+(?:de\s+)?(.+)$/);
  if (m) t = `${ORDINALS[m[1]]}${m[2]}`;
  return t.replace(/^([123])\s+/, '$1');
}

const tables = new Map<string, [Map<string, string>, Map<string, string>]>();

function aliasTables(locale: string) {
  const lang2 = locale.toLowerCase().slice(0, 2);
  const pt = lang2 === 'pt';
  const key: BuiltinLang = lang2 === 'pt' || lang2 === 'es' ? lang2 : 'en';
  const extra = extraNames.get(locale);
  const cacheKey = extra ? locale : key;
  const cached = tables.get(cacheKey);
  if (cached) return cached;
  const exact = new Map<string, string>();
  const loose = new Map<string, string>();
  // O idioma preferido vem por último e vence em abreviações ambíguas ("Jn")
  const order = [...(['es', 'pt', 'en'] as const).filter((l) => l !== key), key];
  for (const lang of order) {
    for (const b of BOOKS) {
      const names = b[lang];
      for (const alias of [names.name, names.abbr, b.code, ...names.aliases]) {
        exact.set(normBook(alias, true), b.code);
        loose.set(normBook(alias, false), b.code);
      }
    }
  }
  for (const [code, names] of Object.entries(extra ?? {})) {
    for (const alias of [names.name, names.abbr]) {
      exact.set(normBook(alias, true), code);
      loose.set(normBook(alias, false), code);
    }
  }
  // Convenção brasileira: "Jo" é João e "Jó" é Jó
  exact.set('jó', 'JOB');
  if (pt) loose.set('jo', 'JHN');
  const result: [Map<string, string>, Map<string, string>] = [exact, loose];
  tables.set(cacheKey, result);
  return result;
}

export function resolveBook(name: string, locale = 'pt-BR'): string | null {
  const [exact, loose] = aliasTables(locale);
  return exact.get(normBook(name, true)) ?? loose.get(normBook(name, false)) ?? null;
}

const DASH = '[-‐‑‒–—]';
const REF_RE = /^\s*((?:[123]|i{1,3})?\s*\.?\s*\p{L}[^\d:;,]*?)\s*\.?\s*(\d.*)?$/iu;
const SPEC_RE = new RegExp(`^(\\d+)(?:\\s*[:.]\\s*(\\d+))?(?:\\s*${DASH}\\s*(?:(\\d+)\\s*[:.]\\s*)?(\\d+))?$`);
const BARE_RE = new RegExp(`^(\\d+)(?:\\s*${DASH}\\s*(\\d+))?$`);

function parseSpec(book: Book, spec: string): Reference[] {
  const refs: Reference[] = [];
  let currentChapter: number | null = null;
  for (const raw of spec.split(',').map((p) => p.trim())) {
    if (!raw) continue;
    const bare = currentChapter !== null ? raw.match(BARE_RE) : null;
    if (bare && currentChapter !== null) {
      // Depois de "12:1", um número solto é versículo do mesmo capítulo
      const v1 = Number(bare[1]);
      const v2 = Number(bare[2] ?? bare[1]);
      refs.push({ book: book.code, chapter: currentChapter, verseStart: v1, chapterEnd: currentChapter, verseEnd: v2 });
      continue;
    }
    const m = raw.match(SPEC_RE);
    if (!m) throw new ReferenceError(`invalid reference: ${raw}`);
    const c1 = Number(m[1]);
    const v1 = m[2] ? Number(m[2]) : null;
    let c2 = m[3] ? Number(m[3]) : null;
    let v2 = m[4] ? Number(m[4]) : null;
    if (v1 === null && v2 !== null) {
      // "Gn 1-3" = capítulos 1 a 3
      c2 = v2;
      v2 = null;
    }
    refs.push({ book: book.code, chapter: c1, verseStart: v1, chapterEnd: c2 ?? c1, verseEnd: v2 ?? v1 });
    currentChapter = v1 !== null && c2 === null ? c1 : null;
  }
  for (const r of refs) {
    if (r.chapter < 1 || r.chapter > book.chapters || r.chapterEnd < r.chapter || r.chapterEnd > book.chapters) {
      throw new ReferenceError(`chapter out of range: ${book.code} ${r.chapter}`);
    }
    if (r.verseStart !== null && r.verseStart < 1) throw new ReferenceError('verse out of range');
    if (r.verseEnd !== null && r.chapterEnd === r.chapter && r.verseEnd < (r.verseStart ?? 1)) {
      throw new ReferenceError('verse range is reversed');
    }
  }
  return refs;
}

/** Interpreta uma ou várias referências. Lança ReferenceError se algo não for reconhecido. */
export function parseReferences(text: string, locale = 'pt-BR'): Reference[] {
  const refs: Reference[] = [];
  let lastBook: Book | null = null;
  for (const segment of text.split(';').map((s) => s.trim())) {
    if (!segment) continue;
    for (const part of segment.split(/,\s*(?=(?:[123]\s*)?\p{L})/u)) {
      const m = part.match(REF_RE);
      if (m && m[1].trim()) {
        const code = resolveBook(m[1], locale);
        if (!code) throw new ReferenceError(`unknown book: ${m[1].trim()}`);
        lastBook = bookByCode[code];
        const spec = (m[2] ?? '').trim();
        if (!spec) throw new ReferenceError('missing chapter');
        refs.push(...parseSpec(lastBook, spec));
      } else if (lastBook && /^\s*\d/.test(part)) {
        refs.push(...parseSpec(lastBook, part.trim()));
      } else {
        throw new ReferenceError(`invalid reference: ${part}`);
      }
    }
  }
  if (!refs.length) throw new ReferenceError('empty reference');
  return refs;
}

export function tryParseReferences(text: string, locale = 'pt-BR'): Reference[] | null {
  try {
    return parseReferences(text, locale);
  } catch {
    return null;
  }
}

export function bookName(code: string, locale: string, abbreviated = false) {
  const lang2 = locale.toLowerCase().slice(0, 2);
  const names = extraNames.get(locale)?.[code] ?? bookByCode[code][lang2 === 'pt' || lang2 === 'es' ? lang2 : 'en'];
  return abbreviated ? names.abbr : names.name;
}

export function formatReference(ref: Reference, locale = 'pt-BR', abbreviated = false): string {
  let out = `${bookName(ref.book, locale, abbreviated)} ${ref.chapter}`;
  if (ref.verseStart !== null) out += `:${ref.verseStart}`;
  if (ref.chapterEnd !== ref.chapter) {
    out += `–${ref.chapterEnd}${ref.verseEnd !== null ? `:${ref.verseEnd}` : ''}`;
  } else if (ref.verseEnd !== null && ref.verseEnd !== ref.verseStart) {
    out += `–${ref.verseEnd}`;
  }
  return out;
}

// ---------- Chave canônica BBCCCVVV ----------

export function verseKey(bookCode: string, chapter: number, verse: number) {
  return bookByCode[bookCode].id * 1_000_000 + chapter * 1_000 + verse;
}

export function splitKey(key: number) {
  const book = bookById[Math.floor(key / 1_000_000)];
  return { book: book.code, chapter: Math.floor(key / 1_000) % 1_000, verse: key % 1_000 };
}

/** Rótulo de um intervalo de chaves: "João 3:16", "João 3:16–18", "João 3". */
export function formatKeyRange(start: number, end: number, locale: string, abbreviated = false) {
  const a = splitKey(start);
  const b = splitKey(end);
  return formatReference(
    {
      book: a.book,
      chapter: a.chapter,
      verseStart: a.verse || null,
      chapterEnd: b.chapter,
      verseEnd: b.verse || null,
    },
    locale,
    abbreviated,
  );
}

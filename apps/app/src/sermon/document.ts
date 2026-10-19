// Lógica do editor de ministrações sem dependência de tela: histórico (desfazer/refazer),
// metadados, operações em blocos, detecção de referências digitadas, modos do púlpito e HTML do PDF.

import { formatReference, tryParseReferences, verseKey, type Reference } from '@/bible/reference';
import type { Block, Kind, Role, Sermon, SermonMeta } from '@/lib/sermons';

// ---------- Metadados (campos do formulário como texto) ----------

export type MetaForm = {
  title: string;
  theme: string;
  main_reference: string;
  other_references: string;
  kind: Kind;
  objective: string;
  audience: string;
  event: string;
  scheduled_for: string;
  duration: string;
  folder: string;
  tags: string;
};

export type Doc = { meta: MetaForm; blocks: Block[] };

const list = (text: string) =>
  text
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);

export function docFromSermon(s: Sermon): Doc {
  return {
    meta: {
      title: s.title,
      theme: s.theme ?? '',
      main_reference: s.main_reference ?? '',
      other_references: s.other_references.join('; '),
      kind: s.kind,
      objective: s.objective ?? '',
      audience: s.audience ?? '',
      event: s.event ?? '',
      scheduled_for: s.scheduled_for ?? '',
      duration: s.duration_minutes ? String(s.duration_minutes) : '',
      folder: s.folder ?? '',
      tags: s.tags.join(', '),
    },
    blocks: s.content.blocks,
  };
}

/** Converte o formulário no corpo aceito pela API; valores inválidos viram vazio em vez de quebrar o salvamento. */
export function metaToPayload(m: MetaForm): SermonMeta {
  const opt = (v: string) => v.trim() || null;
  const minutes = Number(m.duration);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(m.scheduled_for.trim()) && !Number.isNaN(Date.parse(m.scheduled_for.trim()));
  return {
    title: m.title.trim() || undefined,
    theme: opt(m.theme),
    main_reference: opt(m.main_reference),
    other_references: list(m.other_references).slice(0, 50),
    kind: m.kind,
    objective: opt(m.objective),
    audience: opt(m.audience),
    event: opt(m.event),
    scheduled_for: date ? m.scheduled_for.trim() : null,
    duration_minutes: Number.isInteger(minutes) && minutes >= 1 && minutes <= 600 ? minutes : null,
    folder: opt(m.folder),
    tags: list(m.tags).map((t) => t.slice(0, 40)).slice(0, 20),
  };
}

// ---------- Histórico ----------

export type History = { past: Doc[]; future: Doc[]; lastKey: string; lastAt: number };

export const emptyHistory = (): History => ({ past: [], future: [], lastKey: '', lastAt: 0 });

const LIMIT = 100;
const COALESCE_MS = 1200;

/** Registra a mudança. Digitação seguida no mesmo campo vira um único passo de desfazer. */
export function record(h: History, before: Doc, key: string, now = Date.now()): History {
  const coalesce = key !== '' && key === h.lastKey && now - h.lastAt < COALESCE_MS;
  const past = coalesce ? h.past : [...h.past, before].slice(-LIMIT);
  return { past, future: [], lastKey: key, lastAt: now };
}

export function undo(h: History, current: Doc): [History, Doc] | null {
  if (!h.past.length) return null;
  const prev = h.past[h.past.length - 1];
  return [{ past: h.past.slice(0, -1), future: [current, ...h.future], lastKey: '', lastAt: 0 }, prev];
}

export function redo(h: History, current: Doc): [History, Doc] | null {
  if (!h.future.length) return null;
  const [next, ...rest] = h.future;
  return [{ past: [...h.past, current], future: rest, lastKey: '', lastAt: 0 }, next];
}

// ---------- Blocos ----------

export function newId() {
  return Math.random().toString(36).slice(2, 14);
}

export function makeBlock(type: 'section' | 'text' | 'note', role: Role = 'point'): Block {
  if (type === 'section') return { id: newId(), type, role, title: '' };
  return { id: newId(), type, text: '' };
}

export function moveBlock(blocks: Block[], id: string, delta: -1 | 1): Block[] {
  const i = blocks.findIndex((b) => b.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= blocks.length) return blocks;
  const out = [...blocks];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

export function insertAfter(blocks: Block[], afterId: string | null, block: Block): Block[] {
  if (afterId === null) return [...blocks, block];
  const i = blocks.findIndex((b) => b.id === afterId);
  if (i < 0) return [...blocks, block];
  return [...blocks.slice(0, i + 1), block, ...blocks.slice(i + 1)];
}

export function updateBlock(blocks: Block[], id: string, patch: Partial<Block>): Block[] {
  return blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b));
}

// ---------- Referências digitadas ----------

// Mesmo padrão de lib/sermons.ts, repetido aqui para manter este arquivo sem dependências nativas
const FIND_RE = /(?<![\p{L}\d])((?:[123]\s?)?\p{L}{2,}\.?\s+\d{1,3}[:.]\d{1,3}(?:\s*[-‐‑‒–—]\s*\d{1,3}(?:[:.]\d{1,3})?)?)/gu;

export type Candidate = { text: string; ref: Reference; label: string };

const refId = (r: Reference) => `${r.book}.${r.chapter}.${r.verseStart}.${r.chapterEnd}.${r.verseEnd}`;

/**
 * Referências digitadas num texto que podem virar bloco bíblico ("Jo 3:16", "2 Reis 13:20–21").
 * Ignora as que já estão inseridas na ministração e as recusadas pelo usuário.
 */
export function insertableReferences(text: string, blocks: Block[], locale: string, dismissed: string[] = []): Candidate[] {
  const present = new Set(
    blocks.flatMap((b) => (b.type === 'scripture' ? (tryParseReferences(b.reference, locale) ?? []).map(refId) : [])),
  );
  const out: Candidate[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(FIND_RE)) {
    const raw = m[1].trim();
    const refs = tryParseReferences(raw, locale);
    if (!refs || refs.length !== 1 || refs[0].verseStart === null) continue;
    const id = refId(refs[0]);
    if (present.has(id) || seen.has(id) || dismissed.includes(id)) continue;
    seen.add(id);
    out.push({ text: raw, ref: refs[0], label: formatReference(refs[0], locale, true) });
  }
  return out;
}

export const candidateId = (c: Candidate) => refId(c.ref);

/** Bloco bíblico a partir do texto retornado pela API (ou pelo cache offline). */
export function scriptureBlock(
  ref: Reference,
  translation: string,
  verses: { chapter: number; verse: number; text: string }[],
  locale: string,
): Block {
  const first = verses[0];
  const last = verses[verses.length - 1];
  return {
    id: newId(),
    type: 'scripture',
    reference: formatReference(ref, locale),
    translation: translation.toUpperCase(),
    verse_key_start: verseKey(ref.book, first.chapter, first.verse),
    verse_key_end: verseKey(ref.book, last.chapter, last.verse),
    verses,
  };
}

/** Onde entra o versículo: depois do bloco de texto e de outros versículos já inseridos logo abaixo dele. */
export function scriptureInsertPoint(blocks: Block[], textBlockId: string): string {
  let i = blocks.findIndex((b) => b.id === textBlockId);
  while (i >= 0 && i + 1 < blocks.length && blocks[i + 1].type === 'scripture') i++;
  return blocks[i]?.id ?? textBlockId;
}

// ---------- Púlpito ----------

export type PulpitMode = 'full' | 'outline' | 'memorize' | 'pulpit';

export function stripMarkdown(text: string) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/==(.+?)==/g, '$1')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1$2')
    .replace(/^#+\s*/gm, '');
}

/** Esboço: tópicos da lista ou, se não houver, a primeira frase de cada parágrafo. */
export function outlineLines(text: string): string[] {
  const lines = stripMarkdown(text)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const bullets = lines.filter((l) => /^([-*•]|\d+[.)])\s+/.test(l)).map((l) => l.replace(/^([-*•]|\d+[.)])\s+/, ''));
  if (bullets.length) return bullets;
  return lines.map((l) => {
    const m = l.match(/^(.+?[.!?])(\s|$)/);
    return m ? m[1] : l;
  });
}

/** Memorização: só a inicial de cada palavra, mantendo a pontuação ("Porque Deus amou" → "P D a"). */
export function memorize(text: string) {
  return stripMarkdown(text).replace(/(\p{L})[\p{L}\p{M}'’-]*/gu, '$1');
}

/** Duração estimada de leitura em voz alta (≈ 130 palavras por minuto). */
export function speakingMinutes(blocks: Block[]) {
  const words = blocks
    .map((b) => (b.type === 'text' ? b.text : b.type === 'scripture' ? b.verses.map((v) => v.text).join(' ') : ''))
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 130));
}

export function formatClock(totalSeconds: number) {
  const sign = totalSeconds < 0 ? '-' : '';
  const s = Math.abs(Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${sign}${h ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

// ---------- Exportação em PDF (HTML impresso pelo expo-print) ----------

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inlineMd(text: string) {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/==(.+?)==/g, '<mark>$1</mark>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>');
}

function textHtml(text: string) {
  const out: string[] = [];
  let listOpen = false;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    if (bullet) {
      if (!listOpen) out.push('<ul>');
      listOpen = true;
      out.push(`<li>${inlineMd(bullet[1])}</li>`);
      continue;
    }
    if (listOpen) out.push('</ul>');
    listOpen = false;
    if (line) out.push(`<p>${inlineMd(line)}</p>`);
  }
  if (listOpen) out.push('</ul>');
  return out.join('');
}

export type HtmlLabels = { main: string; theme: string; objective: string; date: string; duration: string; note: string; minutes: string };

export function sermonHtml(doc: Doc, labels: HtmlLabels, locale: string): string {
  const m = doc.meta;
  const info = [
    m.main_reference && `<b>${esc(labels.main)}:</b> ${esc(m.main_reference)}`,
    m.theme && `<b>${esc(labels.theme)}:</b> ${esc(m.theme)}`,
    m.objective && `<b>${esc(labels.objective)}:</b> ${esc(m.objective)}`,
    m.scheduled_for &&
      `<b>${esc(labels.date)}:</b> ${esc(new Date(`${m.scheduled_for}T12:00:00`).toLocaleDateString(locale))}`,
    m.duration && `<b>${esc(labels.duration)}:</b> ${esc(m.duration)} ${esc(labels.minutes)}`,
  ].filter(Boolean);
  const body = doc.blocks
    .map((b) => {
      switch (b.type) {
        case 'section':
          return `<h2>${esc(b.title)}</h2>`;
        case 'text':
          return textHtml(b.text);
        case 'note':
          return b.text.trim() ? `<div class="note"><b>${esc(labels.note)}:</b> ${inlineMd(b.text)}</div>` : '';
        case 'scripture':
          return `<blockquote><div class="ref">${esc(b.reference)} (${esc(b.translation)})</div>${b.verses
            .map((v) => `<sup>${v.verse}</sup>${esc(v.text)}`)
            .join(' ')}</blockquote>`;
      }
    })
    .join('\n');
  return `<!doctype html><html lang="${esc(locale)}"><head><meta charset="utf-8"><title>${esc(m.title)}</title>
<style>
@page { margin: 2cm; }
body { font-family: Georgia, 'Times New Roman', serif; color: #16120C; font-size: 12pt; line-height: 1.5; }
h1 { font-size: 22pt; margin: 0 0 8pt; }
h2 { font-size: 15pt; margin: 18pt 0 6pt; color: #5c4210; }
.info { font-size: 10.5pt; color: #444; margin-bottom: 14pt; }
.info div { margin: 2pt 0; }
blockquote { margin: 8pt 0; padding: 6pt 12pt; border-left: 3pt solid #B8892A; background: #F8F5EF; font-style: italic; }
blockquote .ref { font-style: normal; font-weight: bold; margin-bottom: 4pt; }
sup { font-size: 8pt; margin-right: 2pt; font-style: normal; }
.note { font-size: 10.5pt; color: #555; border: 1pt dashed #B8892A; padding: 6pt; margin: 8pt 0; }
mark { background: #F6E3A6; }
</style></head><body><h1>${esc(m.title)}</h1><div class="info">${info.map((i) => `<div>${i}</div>`).join('')}</div>
${body}</body></html>`;
}

import type { Block } from '@/lib/sermons';
import {
  emptyHistory,
  formatClock,
  insertableReferences,
  memorize,
  metaToPayload,
  moveBlock,
  outlineLines,
  record,
  redo,
  scriptureBlock,
  scriptureInsertPoint,
  sermonHtml,
  undo,
  type Doc,
  type MetaForm,
} from '@/sermon/document';

const meta: MetaForm = {
  title: 'A graça',
  theme: '',
  main_reference: 'Ef 2:8',
  other_references: 'Rm 3:23; Rm 6:23',
  kind: 'thematic',
  objective: '',
  audience: '',
  event: '',
  scheduled_for: '2026-11-01',
  duration: '35',
  folder: '',
  tags: 'graça, fé',
};

describe('inserção automática de versículos', () => {
  test.each([
    ['Leia João 3:16–18 com atenção', 'João 3:16–18'],
    ['Romanos 12:1-2 fala de sacrifício vivo', 'Romanos 12:1–2'],
    ['O milagre de 2 Reis 13:20–21.', '2 Reis 13:20–21'],
    ['Paulo ora em Ef 1:18 pela iluminação', 'Efésios 1:18'],
    ['Jo 3:16', 'João 3:16'],
    ['veja Rm 12:2', 'Romanos 12:2'],
    ['No princípio (Gn 1:1)', 'Gênesis 1:1'],
  ])('%s', (text, label) => {
    const found = insertableReferences(text, [], 'pt-BR');
    expect(found).toHaveLength(1);
    const block = scriptureBlock(found[0].ref, 'blivre', [{ chapter: found[0].ref.chapter, verse: found[0].ref.verseStart!, text: 'x' }], 'pt-BR');
    expect(block.type === 'scripture' && block.reference).toBe(label);
  });

  test('ignora o que não é referência e o que já foi inserido', () => {
    expect(insertableReferences('capítulo 3:16 e versão 2.0', [], 'pt-BR')).toEqual([]);
    const existing = scriptureBlock(insertableReferences('Jo 3:16', [], 'pt-BR')[0].ref, 'blivre', [{ chapter: 3, verse: 16, text: 'x' }], 'pt-BR');
    expect(insertableReferences('Como diz João 3:16 e Rm 5:8', [existing], 'pt-BR').map((c) => c.label)).toEqual(['Rm 5:8']);
  });

  test('o versículo entra depois dos que já estão abaixo do texto', () => {
    const blocks: Block[] = [
      { id: 'a', type: 'text', text: '' },
      { id: 'b', type: 'scripture', reference: '', translation: '', verse_key_start: 0, verse_key_end: 0, verses: [] },
      { id: 'c', type: 'text', text: '' },
    ];
    expect(scriptureInsertPoint(blocks, 'a')).toBe('b');
    expect(scriptureInsertPoint(blocks, 'c')).toBe('c');
  });
});

describe('histórico', () => {
  const d = (title: string): Doc => ({ meta: { ...meta, title }, blocks: [] });

  test('desfaz e refaz, juntando digitação seguida', () => {
    let h = emptyHistory();
    h = record(h, d('a'), 'title', 1000);
    h = record(h, d('ab'), 'title', 1500); // mesma digitação: não cria passo novo
    h = record(h, d('abc'), 'blocks', 1600);
    expect(h.past.map((x) => x.meta.title)).toEqual(['a', 'abc']);
    const [h2, prev] = undo(h, d('abcd'))!;
    expect(prev.meta.title).toBe('abc');
    const [, next] = redo(h2, prev)!;
    expect(next.meta.title).toBe('abcd');
    expect(undo(emptyHistory(), d('x'))).toBeNull();
  });
});

test('metadados viram o corpo da API', () => {
  const p = metaToPayload({ ...meta, duration: 'abc', scheduled_for: '01/11/2026' });
  expect(p.other_references).toEqual(['Rm 3:23', 'Rm 6:23']);
  expect(p.tags).toEqual(['graça', 'fé']);
  expect(p.duration_minutes).toBeNull();
  expect(p.scheduled_for).toBeNull();
  expect(p.theme).toBeNull();
  expect(metaToPayload(meta).duration_minutes).toBe(35);
});

test('mover blocos respeita os limites', () => {
  const blocks: Block[] = [
    { id: 'a', type: 'text', text: '1' },
    { id: 'b', type: 'text', text: '2' },
  ];
  expect(moveBlock(blocks, 'a', 1).map((b) => b.id)).toEqual(['b', 'a']);
  expect(moveBlock(blocks, 'a', -1)).toBe(blocks);
});

test('modos do púlpito', () => {
  expect(memorize('Porque Deus amou o **mundo**.')).toBe('P D a o m.');
  expect(outlineLines('- Primeiro\n- Segundo')).toEqual(['Primeiro', 'Segundo']);
  expect(outlineLines('Deus ama. E salva.\nSegundo parágrafo')).toEqual(['Deus ama.', 'Segundo parágrafo']);
  expect(formatClock(65)).toBe('1:05');
  expect(formatClock(-30)).toBe('-0:30');
  expect(formatClock(3725)).toBe('1:02:05');
});

test('HTML do PDF escapa o conteúdo', () => {
  const html = sermonHtml(
    { meta: { ...meta, title: '<script>' }, blocks: [{ id: 'a', type: 'text', text: '**forte** & <b>' }] },
    { main: 'Texto', theme: 'Tema', objective: 'Objetivo', date: 'Data', duration: 'Duração', note: 'Nota', minutes: 'min' },
    'pt-BR',
  );
  expect(html).toContain('&lt;script&gt;');
  expect(html).toContain('<strong>forte</strong> &amp; &lt;b&gt;');
  expect(html).not.toContain('<script>');
});

// Os mesmos casos do backend (services/api/tests/fixtures/references.json)
import fixtures from '../../../../services/api/tests/fixtures/references.json';
import { formatKeyRange, parseReferences, splitKey, verseKey } from '@/bible/reference';

type Valid = { input: string; locale: string; expected: (string | number | null)[][] };

describe.each(fixtures.valid as Valid[])('referência válida: $input', ({ input, locale, expected }) => {
  test('interpreta igual ao backend', () => {
    const got = parseReferences(input, locale).map((r) => [r.book, r.chapter, r.verseStart, r.chapterEnd, r.verseEnd]);
    expect(got).toEqual(expected);
  });
});

describe.each(fixtures.invalid)('referência inválida: $input', ({ input, locale }) => {
  test('é recusada', () => {
    expect(() => parseReferences(input, locale)).toThrow();
  });
});

test('chave canônica e rótulos', () => {
  expect(verseKey('JHN', 3, 16)).toBe(43003016);
  expect(splitKey(43003016)).toEqual({ book: 'JHN', chapter: 3, verse: 16 });
  expect(formatKeyRange(43003016, 43003018, 'pt-BR')).toBe('João 3:16–18');
  expect(formatKeyRange(19023000, 19023000, 'en')).toBe('Psalms 23');
});

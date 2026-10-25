import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { GameEnd, GameShell, shuffled } from '@/kids/game-ui';
import { useKidsProgress } from '@/kids/progress';
import { type KidsKey, useKidsText } from '@/kids/strings';
import { kidsColors, kidsFonts, kidsRadius, tileColors } from '@/kids/theme';
import { PillButton } from '@/kids/ui';

const THEMES = ['creation', 'noah', 'jesus', 'david'] as const;
type Theme = (typeof THEMES)[number];

// Letras sem acento e sem símbolos: o caça-palavras usa só letras simples
const plain = (w: string) =>
  w
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[^\p{L}]/gu, '');

type Placed = { word: string; label: string; cells: number[] };

function build(words: string[], size: number, diagonal: boolean): { grid: string[]; placed: Placed[] } {
  const dirs = diagonal ? [[0, 1], [1, 0], [1, 1]] : [[0, 1], [1, 0]];
  const grid: (string | null)[] = Array(size * size).fill(null);
  const placed: Placed[] = [];
  for (const label of words) {
    const word = plain(label);
    if (word.length < 2 || word.length > size) continue;
    for (let tries = 0; tries < 300; tries++) {
      const [dr, dc] = dirs[Math.floor(Math.random() * dirs.length)];
      const r0 = Math.floor(Math.random() * (size - dr * (word.length - 1)));
      const c0 = Math.floor(Math.random() * (size - dc * (word.length - 1)));
      const cells = [...word].map((_, i) => (r0 + dr * i) * size + (c0 + dc * i));
      if (cells.every((cell, i) => grid[cell] === null || grid[cell] === word[i])) {
        cells.forEach((cell, i) => (grid[cell] = word[i]));
        placed.push({ word, label, cells });
        break;
      }
    }
  }
  // Letras de enchimento tiradas das próprias palavras (funciona em qualquer alfabeto)
  const letters = [...new Set(placed.flatMap((p) => [...p.word]))];
  return { grid: grid.map((g) => g ?? letters[Math.floor(Math.random() * letters.length)] ?? 'A'), placed };
}

/** Caça-palavras com palavras das histórias da Bíblia. */
export default function WordSearch() {
  const { t } = useKidsText();
  const { level } = useKidsProgress();
  const { width } = useWindowDimensions();
  const [theme, setTheme] = useState<Theme | null>(null);
  const [round, setRound] = useState(0);
  const [start, setStart] = useState<number | null>(null);
  const [found, setFound] = useState<string[]>([]);
  const [misses, setMisses] = useState(0);
  const size = level === 'big' ? 10 : 8;

  // A lista de palavras (texto) é o que importa: a grade só muda com o tema, o nível ou "jogar de novo"
  const wordList = theme ? t(`ws_words_${theme}` as KidsKey) : '';
  const puzzle = useMemo(() => {
    if (!wordList) return null;
    const all = wordList
      .split(/[,،、，]/)
      .map((w) => w.trim())
      .filter(Boolean);
    const pick = shuffled(all.filter((w) => plain(w).length <= size)).slice(0, level === 'big' ? 7 : 5);
    return build(pick, size, level === 'big');
    // round: "jogar de novo" monta outra grade com as mesmas palavras
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wordList, size, level, round]);

  const foundCells = new Set(puzzle?.placed.filter((p) => found.includes(p.word)).flatMap((p) => p.cells));
  const done = !!puzzle && puzzle.placed.length > 0 && found.length === puzzle.placed.length;
  const cell = Math.floor(Math.min(width - 40, 560) / size);

  function tap(i: number) {
    if (!puzzle) return;
    if (start === null || start === i) {
      setStart(start === i ? null : i);
      return;
    }
    const [r1, c1, r2, c2] = [Math.floor(start / size), start % size, Math.floor(i / size), i % size];
    const dr = Math.sign(r2 - r1);
    const dc = Math.sign(c2 - c1);
    const len = Math.max(Math.abs(r2 - r1), Math.abs(c2 - c1)) + 1;
    const straight = r1 === r2 || c1 === c2 || Math.abs(r2 - r1) === Math.abs(c2 - c1);
    setStart(null);
    if (!straight) return setMisses((m) => m + 1);
    const cells = Array.from({ length: len }, (_, k) => (r1 + dr * k) * size + (c1 + dc * k));
    const text = cells.map((c) => puzzle.grid[c]).join('');
    const hit = puzzle.placed.find((p) => !found.includes(p.word) && (p.word === text || p.word === [...text].reverse().join('')));
    if (hit) setFound((f) => [...f, hit.word]);
    else setMisses((m) => m + 1);
  }

  function again() {
    setFound([]);
    setMisses(0);
    setStart(null);
    setRound((r) => r + 1);
  }

  if (!theme || !puzzle) {
    return (
      <GameShell game="wordsearch">
        <Text style={styles.pick}>{t('ws_pick')}</Text>
        <View style={styles.themes}>
          {THEMES.map((th, i) => (
            <PillButton key={th} label={t(`ws_theme_${th}` as KidsKey)} color={tileColors[i]} onPress={() => setTheme(th)} style={{ flexGrow: 1 }} />
          ))}
        </View>
      </GameShell>
    );
  }

  if (done) {
    return (
      <GameShell game="wordsearch">
        <GameEnd game="wordsearch" stars={misses <= 2 ? 3 : misses <= 6 ? 2 : 1} onAgain={again} />
      </GameShell>
    );
  }

  return (
    <GameShell game="wordsearch" status={t('ws_found', { n: found.length, total: puzzle.placed.length })}>
      {/* + 6: a borda da moldura (3 de cada lado) não pode tirar espaço das letras */}
      <View style={[styles.grid, { width: cell * size + 6 }]}>
        {puzzle.grid.map((letter, i) => {
          const isFound = foundCells.has(i);
          return (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityLabel={letter}
              onPress={() => tap(i)}
              style={[
                styles.cell,
                { width: cell, height: cell },
                isFound && { backgroundColor: kidsColors.yellow },
                start === i && { backgroundColor: kidsColors.purple },
              ]}>
              <Text style={[styles.letter, { fontSize: cell * 0.5 }, start === i && { color: kidsColors.onColor }]}>{letter}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.words}>
        {puzzle.placed.map((p, i) => {
          const ok = found.includes(p.word);
          return (
            <View key={p.word} style={[styles.word, { borderColor: tileColors[i % tileColors.length] }, ok && { backgroundColor: tileColors[i % tileColors.length] }]}>
              <Text style={[styles.wordText, ok && { color: kidsColors.onColor, textDecorationLine: 'line-through' }]}>{p.label}</Text>
            </View>
          );
        })}
      </View>
    </GameShell>
  );
}

const styles = StyleSheet.create({
  pick: { fontFamily: kidsFonts.bold, fontSize: 20, color: kidsColors.textMuted },
  themes: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'center', backgroundColor: kidsColors.card, borderRadius: kidsRadius.md, overflow: 'hidden', borderWidth: 3, borderColor: kidsColors.border },
  cell: { alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: kidsColors.border },
  letter: { fontFamily: kidsFonts.bold, color: kidsColors.text },
  words: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  word: { borderWidth: 3, borderRadius: kidsRadius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  wordText: { fontFamily: kidsFonts.bold, fontSize: 16, color: kidsColors.text },
});

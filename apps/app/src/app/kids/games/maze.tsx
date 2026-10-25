import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { GameEnd, GameShell, gameStyles } from '@/kids/game-ui';
import { useKidsProgress } from '@/kids/progress';
import { type KidsKey, useKidsText } from '@/kids/strings';
import { kidsColors, kidsFonts, tileColors } from '@/kids/theme';
import { PillButton } from '@/kids/ui';

// Fases: quem anda e aonde chega (o pastor e a ovelha, Lucas 15; o povo e a terra prometida,
// Josué 3; os magos seguindo a estrela até Jesus, Mateus 2:9–11)
const THEMES = [
  { id: 'sheep', walker: '🧑‍🌾', goal: '🐑', floor: '#E4F6E1' },
  { id: 'land', walker: '🚶', goal: '🏞️', floor: '#FFF1DA' },
  { id: 'star', walker: '🐫', goal: '👶', floor: '#E6ECF7' },
];

type Cell = { n: boolean; e: boolean; s: boolean; w: boolean };

/** Labirinto perfeito (um único caminho entre dois pontos), feito com "busca em profundidade". */
function makeMaze(size: number): Cell[] {
  const cells: Cell[] = Array.from({ length: size * size }, () => ({ n: true, e: true, s: true, w: true }));
  const seen = new Set<number>([0]);
  const stack = [0];
  while (stack.length) {
    const cur = stack[stack.length - 1];
    const [r, c] = [Math.floor(cur / size), cur % size];
    const next = (
      [
        [r - 1, c, 'n', 's'],
        [r + 1, c, 's', 'n'],
        [r, c - 1, 'w', 'e'],
        [r, c + 1, 'e', 'w'],
      ] as const
    ).filter(([nr, nc]) => nr >= 0 && nc >= 0 && nr < size && nc < size && !seen.has(nr * size + nc));
    if (!next.length) {
      stack.pop();
      continue;
    }
    const [nr, nc, wall, back] = next[Math.floor(Math.random() * next.length)];
    const id = nr * size + nc;
    cells[cur][wall] = false;
    cells[id][back] = false;
    seen.add(id);
    stack.push(id);
  }
  return cells;
}

function shortest(cells: Cell[], size: number): number {
  const dist = new Map<number, number>([[0, 0]]);
  const queue = [0];
  while (queue.length) {
    const cur = queue.shift()!;
    const [r, c] = [Math.floor(cur / size), cur % size];
    const moves: [boolean, number][] = [
      [!cells[cur].n, cur - size],
      [!cells[cur].s, cur + size],
      [!cells[cur].w && c > 0, cur - 1],
      [!cells[cur].e && c < size - 1, cur + 1],
    ];
    for (const [open, to] of moves) {
      if (open && r >= 0 && !dist.has(to)) {
        dist.set(to, dist.get(cur)! + 1);
        queue.push(to);
      }
    }
  }
  return dist.get(size * size - 1) ?? 0;
}

export default function Maze() {
  const { t } = useKidsText();
  const { level } = useKidsProgress();
  const { width } = useWindowDimensions();
  const size = level === 'big' ? 10 : 6;
  const [theme, setTheme] = useState<(typeof THEMES)[number] | null>(null);
  const [cells, setCells] = useState<Cell[]>(() => makeMaze(size));
  const [pos, setPos] = useState(0);
  const [moves, setMoves] = useState(0);
  const done = pos === size * size - 1;
  const cell = Math.floor(Math.min(width - 40, 520) / size);

  function move(dir: 'n' | 's' | 'w' | 'e') {
    if (done || cells[pos][dir]) return;
    const delta = { n: -size, s: size, w: -1, e: 1 }[dir];
    setPos((p) => p + delta);
    setMoves((m) => m + 1);
  }

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !theme) return;
    const onKey = (e: KeyboardEvent) => {
      const dir = ({ ArrowUp: 'n', ArrowDown: 's', ArrowLeft: 'w', ArrowRight: 'e' } as const)[e.key as 'ArrowUp'];
      if (dir) {
        e.preventDefault();
        move(dir);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function start(th: (typeof THEMES)[number]) {
    setTheme(th);
    setCells(makeMaze(size));
    setPos(0);
    setMoves(0);
  }

  if (!theme) {
    return (
      <GameShell game="maze">
        <Text style={styles.pick}>{t('mz_pick')}</Text>
        {THEMES.map((th, i) => (
          <PillButton key={th.id} label={`${th.walker} → ${th.goal}  ${t(`mz_${th.id}` as KidsKey)}`} color={tileColors[i]} onPress={() => start(th)} />
        ))}
      </GameShell>
    );
  }

  if (done) {
    const best = shortest(cells, size);
    return (
      <GameShell game="maze">
        <View style={[gameStyles.card, { alignItems: 'center' }]}>
          <Text style={{ fontSize: 60 }}>
            {theme.walker}
            {theme.goal}💛
          </Text>
        </View>
        <GameEnd game="maze" stars={moves <= best * 1.3 ? 3 : moves <= best * 2 ? 2 : 1} onAgain={() => start(theme)} />
      </GameShell>
    );
  }

  return (
    <GameShell game="maze" status={`${t(`mz_${theme.id}` as KidsKey)} · ${t('mz_moves', { n: moves })}`}>
      <View style={[styles.board, { width: cell * size + 8, backgroundColor: theme.floor }]}>
        {cells.map((c, i) => (
          <View
            key={i}
            style={[
              styles.cell,
              {
                width: cell,
                height: cell,
                borderTopWidth: c.n ? 3 : 0,
                borderRightWidth: c.e ? 3 : 0,
                borderBottomWidth: c.s ? 3 : 0,
                borderLeftWidth: c.w ? 3 : 0,
              },
            ]}>
            <Text style={{ fontSize: cell * 0.6 }}>{i === pos ? theme.walker : i === size * size - 1 ? theme.goal : ''}</Text>
          </View>
        ))}
      </View>
      <View style={styles.pad}>
        <PillButton label="▲" accessibilityLabel="up" color={kidsColors.purple} onPress={() => move('n')} style={styles.key} textSize={28} />
        <View style={styles.row}>
          <PillButton label="◀︎" accessibilityLabel="left" color={kidsColors.purple} onPress={() => move('w')} style={styles.key} textSize={28} />
          <PillButton label="▼" accessibilityLabel="down" color={kidsColors.purple} onPress={() => move('s')} style={styles.key} textSize={28} />
          <PillButton label="▶︎" accessibilityLabel="right" color={kidsColors.purple} onPress={() => move('e')} style={styles.key} textSize={28} />
        </View>
      </View>
    </GameShell>
  );
}

const styles = StyleSheet.create({
  pick: { fontFamily: kidsFonts.bold, fontSize: 20, color: kidsColors.textMuted },
  board: { flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'center', borderRadius: 8, borderWidth: 4, borderColor: kidsColors.text },
  cell: { borderColor: kidsColors.text, alignItems: 'center', justifyContent: 'center' },
  pad: { alignItems: 'center', gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  key: { width: 84, minHeight: 64 },
});

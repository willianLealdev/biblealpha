import { useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { GameEnd, GameShell, gameStyles, shuffled } from '@/kids/game-ui';
import { useKidsProgress } from '@/kids/progress';
import { useKidsText } from '@/kids/strings';
import { kidsColors, kidsFonts, kidsRadius } from '@/kids/theme';
import { PillButton } from '@/kids/ui';

// Cenas das histórias (só emojis que todo celular desenha)
const SCENES = [
  { bg: '#E8F6FF', items: ['🦁', '🐘', '🦒', '🐑', '🐄', '🐒', '🐇', '🐢', '🦓', '🐴', '🐓', '🐕'] },
  { bg: '#E4F6E1', items: ['🌷', '🌻', '🌳', '🌼', '🌿', '🦋', '🐝', '🌸', '🍎', '🐞'] },
  { bg: '#E6ECF7', items: ['⭐', '🐑', '🐫', '🌙', '🏠', '🌴', '🕯️', '🐂', '🎁'] },
  { bg: '#DCEFFF', items: ['🐟', '🐠', '🐙', '🦀', '🐚', '🐋', '🐬', '⛵', '🌊'] },
];

function makeRound(cols: number, rows: number, count: number) {
  const scene = SCENES[Math.floor(Math.random() * SCENES.length)];
  const top = Array.from({ length: cols * rows }, () => scene.items[Math.floor(Math.random() * scene.items.length)]);
  const diffs = shuffled(top.map((_, i) => i)).slice(0, count);
  const bottom = top.map((e, i) => (diffs.includes(i) ? shuffled(scene.items.filter((x) => x !== e))[0] : e));
  return { bg: scene.bg, top, bottom, diffs };
}

/** Encontre as diferenças entre duas figuras quase iguais (2 cenas seguidas). */
export default function Differences() {
  const { t } = useKidsText();
  const { level } = useKidsProgress();
  const { width } = useWindowDimensions();
  const [cols, rows, count] = level === 'big' ? [5, 4, 7] : [4, 3, 4];
  const [round, setRound] = useState(() => makeRound(cols, rows, count));
  const [found, setFound] = useState<number[]>([]);
  const [misses, setMisses] = useState(0);
  const [scene, setScene] = useState(1);
  const [finished, setFinished] = useState(false);
  const cell = Math.floor(Math.min(width - 48, 440) / cols);
  const left = round.diffs.length - found.length;

  function tap(i: number) {
    if (found.includes(i)) return;
    if (round.diffs.includes(i)) setFound((f) => [...f, i]);
    else setMisses((m) => m + 1);
  }

  function nextScene() {
    if (scene >= 2) return setFinished(true);
    setScene(2);
    setRound(makeRound(cols, rows, count));
    setFound([]);
  }

  function again() {
    setScene(1);
    setRound(makeRound(cols, rows, count));
    setFound([]);
    setMisses(0);
    setFinished(false);
  }

  if (finished) {
    return (
      <GameShell game="differences">
        <GameEnd game="differences" stars={misses <= 2 ? 3 : misses <= 6 ? 2 : 1} onAgain={again} />
      </GameShell>
    );
  }

  const grid = (items: string[], interactive: boolean) => (
    <View style={[styles.grid, { width: cell * cols + 6, backgroundColor: round.bg }]}>
      {items.map((e, i) => {
        const ok = interactive && found.includes(i);
        const body = <Text style={{ fontSize: cell * 0.55 }}>{e}</Text>;
        return interactive ? (
          <Pressable key={i} accessibilityRole="button" accessibilityLabel={`${i + 1}`} onPress={() => tap(i)} style={[styles.cell, { width: cell, height: cell }, ok && styles.found]}>
            {body}
          </Pressable>
        ) : (
          <View key={i} style={[styles.cell, { width: cell, height: cell }]}>
            {body}
          </View>
        );
      })}
    </View>
  );

  return (
    <GameShell game="differences" status={`${scene}/2 · ${t('df_left', { n: left })}`}>
      <Text style={styles.label}>{t('df_top')}</Text>
      {grid(round.top, false)}
      <Text style={styles.label}>{t('df_bottom')}</Text>
      {grid(round.bottom, true)}
      {left === 0 ? <PillButton label={t('nextQuestion')} color={kidsColors.green} onPress={nextScene} /> : null}
      {left === 0 ? <Text style={gameStyles.info}>{t('right')}</Text> : null}
    </GameShell>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: kidsFonts.bold, fontSize: 17, color: kidsColors.textMuted, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'center', borderRadius: kidsRadius.md, borderWidth: 3, borderColor: kidsColors.border, overflow: 'hidden' },
  cell: { alignItems: 'center', justifyContent: 'center' },
  found: { backgroundColor: 'rgba(255,194,51,0.6)', borderRadius: 999 },
});

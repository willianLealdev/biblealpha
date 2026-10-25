import { useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { GameEnd, GameShell } from '@/kids/game-ui';
import { useStoredState } from '@/kids/local-state';
import { useSpeaker } from '@/kids/speak';
import { type KidsKey, useKidsText } from '@/kids/strings';
import { kidsColors, kidsFonts, kidsRadius } from '@/kids/theme';
import { PillButton } from '@/kids/ui';

// Construções dos tempos da Bíblia, cada uma com um fato e a passagem
const ITEMS = [
  { id: 'house', emoji: '🏠' },
  { id: 'well', emoji: '⛲' },
  { id: 'market', emoji: '🧺' },
  { id: 'synagogue', emoji: '🕍' },
  { id: 'wall', emoji: '🧱' },
  { id: 'gate', emoji: '🚪' },
  { id: 'tent', emoji: '⛺' },
  { id: 'palm', emoji: '🌴' },
  { id: 'sheep', emoji: '🐑' },
  { id: 'camel', emoji: '🐪' },
  { id: 'boat', emoji: '⛵' },
  { id: 'field', emoji: '🌾' },
];
const SIZE = 6;
const ERASE = 'erase';

/** Construa a sua cidade bíblica: escolher uma construção e tocar no terreno. Fica salva no aparelho. */
export default function City() {
  const { t, language } = useKidsText();
  const { speak } = useSpeaker(language);
  const { width } = useWindowDimensions();
  const [tiles, setTiles] = useStoredState<(string | null)[]>('city', Array(SIZE * SIZE).fill(null));
  const [tool, setTool] = useState<string>('house');
  const [finished, setFinished] = useState(false);
  const cell = Math.floor(Math.min(width - 40, 480) / SIZE);
  const placed = tiles.filter(Boolean).length;
  const info = ITEMS.find((i) => i.id === tool);

  function choose(id: string) {
    setTool(id);
    if (id !== ERASE) speak(`${t(`ci_${id}` as KidsKey)}. ${t(`ci_${id}_f` as KidsKey)}`);
  }

  const emojiOf = (id: string | null) => ITEMS.find((i) => i.id === id)?.emoji ?? '';

  const map = (
    <View style={[styles.map, { width: cell * SIZE + 6 }]}>
      {tiles.map((id, i) => (
        <Pressable
          key={i}
          accessibilityRole="button"
          accessibilityLabel={id ? t(`ci_${id}` as KidsKey) : `${i + 1}`}
          disabled={finished}
          onPress={() => setTiles((list) => list.map((x, j) => (j === i ? (tool === ERASE ? null : tool) : x)))}
          style={[styles.tile, { width: cell, height: cell }]}>
          <Text style={{ fontSize: cell * 0.6 }}>{emojiOf(id)}</Text>
        </Pressable>
      ))}
    </View>
  );

  if (finished) {
    return (
      <GameShell game="city">
        {map}
        <GameEnd game="city" stars={placed >= 15 ? 3 : placed >= 8 ? 2 : 1} onAgain={() => setFinished(false)} />
      </GameShell>
    );
  }

  return (
    <GameShell game="city">
      {map}
      <View style={styles.palette}>
        {ITEMS.map((it) => (
          <Pressable
            key={it.id}
            accessibilityRole="button"
            accessibilityLabel={t(`ci_${it.id}` as KidsKey)}
            onPress={() => choose(it.id)}
            style={[styles.tool, tool === it.id && styles.toolOn]}>
            <Text style={styles.toolEmoji}>{it.emoji}</Text>
          </Pressable>
        ))}
        <Pressable accessibilityRole="button" accessibilityLabel={t('ci_erase')} onPress={() => choose(ERASE)} style={[styles.tool, tool === ERASE && styles.toolOn]}>
          <Text style={styles.toolEmoji}>🧽</Text>
        </Pressable>
      </View>
      {info ? (
        <View style={styles.fact}>
          <Text style={styles.factTitle}>
            {info.emoji} {t(`ci_${info.id}` as KidsKey)}
          </Text>
          <Text style={styles.factText}>{t(`ci_${info.id}_f` as KidsKey)}</Text>
          <Text style={styles.factRef}>📜 {t(`ci_${info.id}_r` as KidsKey)}</Text>
        </View>
      ) : null}
      <View style={styles.row}>
        <PillButton label={`🗑️ ${t('ci_clear')}`} color={kidsColors.pink} active={false} onPress={() => setTiles(Array(SIZE * SIZE).fill(null))} style={{ flex: 1 }} textSize={16} />
        <PillButton label={`✅ ${t('ci_done')}`} color={kidsColors.green} disabled={placed < 5} onPress={() => setFinished(true)} style={{ flex: 1 }} textSize={16} />
      </View>
    </GameShell>
  );
}

const styles = StyleSheet.create({
  map: { flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'center', backgroundColor: '#EBD9A8', borderRadius: kidsRadius.md, borderWidth: 3, borderColor: '#C9A46A', overflow: 'hidden' },
  tile: { alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: 'rgba(201,164,106,0.5)' },
  palette: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  tool: { width: 56, height: 56, borderRadius: 28, backgroundColor: kidsColors.card, borderWidth: 3, borderColor: kidsColors.border, alignItems: 'center', justifyContent: 'center' },
  toolOn: { borderColor: kidsColors.orange, borderWidth: 4, transform: [{ scale: 1.1 }] },
  toolEmoji: { fontSize: 28 },
  fact: { backgroundColor: kidsColors.card, borderRadius: kidsRadius.md, borderWidth: 3, borderColor: kidsColors.border, padding: 12, gap: 4 },
  factTitle: { fontFamily: kidsFonts.bold, fontSize: 18, color: kidsColors.text },
  factText: { fontFamily: kidsFonts.regular, fontSize: 17, lineHeight: 24, color: kidsColors.text },
  factRef: { fontFamily: kidsFonts.regular, fontSize: 14, color: kidsColors.textMuted },
  row: { flexDirection: 'row', gap: 12 },
});

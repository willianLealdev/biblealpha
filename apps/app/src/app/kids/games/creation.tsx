import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GameEnd, GameShell, gameStyles, shuffled } from '@/kids/game-ui';
import { useKidsProgress } from '@/kids/progress';
import { useSpeaker } from '@/kids/speak';
import { type KidsKey, useKidsText } from '@/kids/strings';
import { kidsColors, kidsFonts, kidsRadius } from '@/kids/theme';

// O que Deus criou em cada dia (Gênesis 1:3–2:3)
const ITEMS: { emoji: string; day: number; big?: boolean }[] = [
  { emoji: '💡', day: 1 },
  { emoji: '☁️', day: 2 },
  { emoji: '🌊', day: 2, big: true },
  { emoji: '🌳', day: 3 },
  { emoji: '🌻', day: 3, big: true },
  { emoji: '☀️', day: 4 },
  { emoji: '🌙', day: 4, big: true },
  { emoji: '⭐', day: 4, big: true },
  { emoji: '🐟', day: 5 },
  { emoji: '🐦', day: 5, big: true },
  { emoji: '🦁', day: 6 },
  { emoji: '👨‍👩‍👧', day: 6, big: true },
  { emoji: '😴', day: 7 },
];
const DAY_COLORS = ['#FFC233', '#3D9BFF', '#2FBF84', '#FF8A3D', '#1A4FB5', '#FF5FA2', '#9B6BFF'];

/** Os 7 dias da criação: colocar cada coisa no dia em que Deus a criou. */
export default function Creation() {
  const { t, language } = useKidsText();
  const { level } = useKidsProgress();
  const { speak } = useSpeaker(language);
  const deal = () => shuffled(ITEMS.map((it, i) => ({ ...it, i })).filter((it) => level === 'big' || !it.big));
  const [items, setItems] = useState(deal);
  const [placed, setPlaced] = useState<number[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [wrong, setWrong] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const done = placed.length === items.length;

  function choose(day: number) {
    if (selected === null) return setMessage(t('creation_pick'));
    const item = items.find((it) => it.i === selected)!;
    if (item.day === day) {
      setPlaced((p) => [...p, selected]);
      setSelected(null);
      setMessage(null);
      speak(t(`creation_d${day}` as KidsKey));
    } else {
      setWrong((w) => w + 1);
      setMessage(t('creation_wrong'));
    }
  }

  function again() {
    setItems(deal());
    setPlaced([]);
    setSelected(null);
    setWrong(0);
    setMessage(null);
  }

  if (done) {
    return (
      <GameShell game="creation">
        <GameEnd game="creation" stars={wrong <= 1 ? 3 : wrong <= 4 ? 2 : 1} onAgain={again} />
      </GameShell>
    );
  }

  return (
    <GameShell game="creation">
      <View style={styles.pool}>
        {items
          .filter((it) => !placed.includes(it.i))
          .map((it) => (
            <Pressable
              key={it.i}
              accessibilityRole="button"
              accessibilityLabel={it.emoji}
              onPress={() => {
                setSelected(it.i);
                setMessage(t('creation_pick'));
              }}
              style={[styles.item, selected === it.i && styles.itemOn]}>
              <Text style={styles.itemEmoji}>{it.emoji}</Text>
            </Pressable>
          ))}
      </View>
      {message ? <Text style={gameStyles.info}>{message}</Text> : null}
      <View style={styles.days}>
        {[1, 2, 3, 4, 5, 6, 7].map((day) => (
          <Pressable
            key={day}
            accessibilityRole="button"
            accessibilityLabel={`${t('creation_day', { n: day })}: ${t(`creation_d${day}` as KidsKey)}`}
            onPress={() => choose(day)}
            style={[styles.day, { borderColor: DAY_COLORS[day - 1] }]}>
            <Text style={[styles.dayTitle, { color: DAY_COLORS[day - 1] }]}>{t('creation_day', { n: day })}</Text>
            <Text style={styles.dayText}>{t(`creation_d${day}` as KidsKey)}</Text>
            <Text style={styles.dayItems}>
              {items
                .filter((it) => it.day === day && placed.includes(it.i))
                .map((it) => it.emoji)
                .join(' ')}
            </Text>
          </Pressable>
        ))}
      </View>
    </GameShell>
  );
}

const styles = StyleSheet.create({
  pool: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  item: { width: 72, height: 72, borderRadius: 36, backgroundColor: kidsColors.card, borderWidth: 3, borderColor: kidsColors.border, alignItems: 'center', justifyContent: 'center' },
  itemOn: { borderColor: kidsColors.purple, borderWidth: 5, transform: [{ scale: 1.12 }] },
  itemEmoji: { fontSize: 38 },
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  day: { flexBasis: '46%', flexGrow: 1, minHeight: 104, backgroundColor: kidsColors.card, borderRadius: kidsRadius.md, borderWidth: 4, padding: 10, gap: 2 },
  dayTitle: { fontFamily: kidsFonts.bold, fontSize: 18 },
  dayText: { fontFamily: kidsFonts.regular, fontSize: 15, color: kidsColors.text },
  dayItems: { fontSize: 28 },
});

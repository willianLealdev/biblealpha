import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GameEnd, GameShell, gameStyles, shuffled } from '@/kids/game-ui';
import { useKidsProgress } from '@/kids/progress';
import { useKidsText } from '@/kids/strings';
import { kidsColors, kidsRadius } from '@/kids/theme';

const ANIMALS = ['🦁', '🐘', '🦒', '🐑', '🐄', '🐒', '🐇', '🐢', '🦓', '🐴', '🐓', '🐕'];

type Card = { key: number; animal: string };

/** Arca de Noé: levar os casais de animais para a arca antes da chuva (Gênesis 6:19–20). */
export default function Ark() {
  const { t } = useKidsText();
  const { level } = useKidsProgress();
  const pairs = level === 'big' ? 8 : 4;
  const seconds = level === 'big' ? 75 : 60;
  const deal = (): Card[] =>
    shuffled(shuffled(ANIMALS).slice(0, pairs).flatMap((animal) => [animal, animal])).map((animal, key) => ({ key, animal }));
  const [cards, setCards] = useState<Card[]>(deal);
  const [inside, setInside] = useState<string[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [left, setLeft] = useState(seconds);
  const rain = left <= 0 && inside.length < pairs;
  const done = inside.length === pairs || rain;

  // A chuva vem quando o tempo acaba (sem castigo: a história continua)
  useEffect(() => {
    if (done) return;
    const timer = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(timer);
  }, [done]);

  function tap(card: Card) {
    if (done || inside.includes(card.animal)) return;
    if (selected === null) return setSelected(card.key);
    const first = cards.find((c) => c.key === selected)!;
    if (first.key !== card.key && first.animal === card.animal) setInside((list) => [...list, card.animal]);
    setSelected(null);
  }

  function again() {
    setCards(deal());
    setInside([]);
    setSelected(null);
    setLeft(seconds);
  }

  if (done) {
    const stars = rain ? Math.max(1, Math.round((inside.length / pairs) * 3)) : left > seconds / 2 ? 3 : 2;
    return (
      <GameShell game="ark">
        <View style={[gameStyles.card, { alignItems: 'center' }]}>
          <Text style={styles.arkBig}>{rain ? '🌧️🚢' : '🌈🚢'}</Text>
          <Text style={styles.inside}>{inside.join(' ')}</Text>
          <Text style={gameStyles.info}>{rain ? t('ark_rain') : t('ark_rainbow')}</Text>
        </View>
        <GameEnd game="ark" stars={stars} onAgain={again} />
      </GameShell>
    );
  }

  return (
    <GameShell game="ark" status={`${t('ark_inside', { n: inside.length, total: pairs })} · ⏱️ ${left}`}>
      <View style={styles.arkBox}>
        <Text style={styles.arkEmoji}>🚢</Text>
        <Text style={styles.inside}>{inside.map((a) => `${a}${a}`).join('  ')}</Text>
        <View style={[styles.rainBar, { width: `${Math.max(0, (left / seconds) * 100)}%` }]} />
      </View>
      <View style={styles.grid}>
        {cards.map((c) => {
          const gone = inside.includes(c.animal);
          return (
            <Pressable
              key={c.key}
              accessibilityRole="button"
              accessibilityLabel={c.animal}
              onPress={() => tap(c)}
              style={[styles.card, gone && { opacity: 0 }, selected === c.key && styles.cardOn]}>
              <Text style={styles.animal}>{c.animal}</Text>
            </Pressable>
          );
        })}
      </View>
    </GameShell>
  );
}

const styles = StyleSheet.create({
  arkBox: { backgroundColor: kidsColors.card, borderRadius: kidsRadius.lg, borderWidth: 3, borderColor: kidsColors.blue, padding: 12, alignItems: 'center', gap: 4, overflow: 'hidden' },
  arkEmoji: { fontSize: 54 },
  arkBig: { fontSize: 64 },
  inside: { fontSize: 24, textAlign: 'center', minHeight: 30 },
  rainBar: { position: 'absolute', left: 0, bottom: 0, height: 6, backgroundColor: kidsColors.blue },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  card: { width: 76, height: 76, borderRadius: kidsRadius.md, backgroundColor: kidsColors.card, borderWidth: 3, borderColor: kidsColors.border, alignItems: 'center', justifyContent: 'center' },
  cardOn: { borderColor: kidsColors.orange, borderWidth: 5, transform: [{ scale: 1.1 }] },
  animal: { fontSize: 42 },
});

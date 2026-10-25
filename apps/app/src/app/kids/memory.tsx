import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Celebrate } from '@/kids/celebrate';
import { MEMORY_CARDS, shuffle } from '@/kids/memory-cards';
import { useKidsProgress } from '@/kids/progress';
import { useSpeaker } from '@/kids/speak';
import { type KidsKey, useKidsText } from '@/kids/strings';
import { kidsColors, kidsFonts, kidsRadius } from '@/kids/theme';
import { BackButton, KidsScreen, PillButton } from '@/kids/ui';

type Card = { key: string; id: string; emoji: string; name: string };
const SIZES = { easy: 3, medium: 4, hard: 6 } as const;
type Size = keyof typeof SIZES;

/** Jogo da memória: achar os pares (6, 8 ou 12 cartas). */
export default function KidsMemory() {
  const { t, language } = useKidsText();
  const { level, addStars } = useKidsProgress();
  const { speak } = useSpeaker(language);
  const { width } = useWindowDimensions();
  const [size, setSize] = useState<Size>(level === 'big' ? 'medium' : 'easy');
  const [cards, setCards] = useState<Card[]>(() => deal(SIZES[size]));
  const [open, setOpen] = useState<number[]>([]);
  const [found, setFound] = useState<string[]>([]);
  const [moves, setMoves] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const won = found.length === cards.length / 2;

  function deal(pairs: number): Card[] {
    const chosen = shuffle(MEMORY_CARDS).slice(0, pairs);
    return shuffle(chosen.flatMap((c) => [0, 1].map((n) => ({ key: `${c.id}-${n}`, id: c.id, emoji: c.emoji, name: t(`card_${c.id}` as KidsKey) }))));
  }

  function restart(next: Size = size) {
    if (timer.current) clearTimeout(timer.current);
    setSize(next);
    setCards(deal(SIZES[next]));
    setOpen([]);
    setFound([]);
    setMoves(0);
    setMessage(null);
  }

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  function flip(i: number) {
    if (open.length === 2 || open.includes(i) || found.includes(cards[i].id)) return;
    const next = [...open, i];
    setOpen(next);
    if (next.length < 2) return;
    setMoves((m) => m + 1);
    const [a, b] = next;
    if (cards[a].id === cards[b].id) {
      const total = found.length + 1;
      setFound((f) => [...f, cards[a].id]);
      setOpen([]);
      setMessage(t('pairFound', { name: cards[a].name }));
      speak(cards[a].name);
      if (total === cards.length / 2) addStars(SIZES[size]);
    } else {
      // Mostra as duas por um instante e vira de volta
      timer.current = setTimeout(() => setOpen([]), 900);
    }
  }

  const columns = cards.length <= 6 ? 3 : 4;
  const cardSize = Math.min(150, (Math.min(width, 760) - 32 - (columns - 1) * 10) / columns);

  return (
    <KidsScreen>
      <BackButton />
      <Text style={styles.title} accessibilityRole="header">
        🧩 {t('memoryTitle')}
      </Text>
      <View style={styles.row}>
        {(Object.keys(SIZES) as Size[]).map((s) => (
          <PillButton key={s} label={t(s)} active={size === s} color={kidsColors.blue} onPress={() => restart(s)} style={{ flex: 1 }} textSize={17} />
        ))}
      </View>
      {won ? (
        <Celebrate title={t('memoryWin')} subtitle={t('moves', { n: moves })} />
      ) : (
        <Text style={styles.info}>{message ?? t('moves', { n: moves })}</Text>
      )}
      <View style={[styles.grid, { maxWidth: columns * (cardSize + 10) }]}>
        {cards.map((card, i) => {
          const shown = open.includes(i) || found.includes(card.id);
          const done = found.includes(card.id);
          return (
            <Pressable
              key={card.key}
              accessibilityRole="button"
              accessibilityLabel={shown ? card.name : `?`}
              onPress={() => flip(i)}
              style={[
                styles.card,
                {
                  width: cardSize,
                  height: cardSize * 1.15,
                  backgroundColor: shown ? kidsColors.card : kidsColors.purple,
                  borderColor: done ? kidsColors.green : shown ? kidsColors.yellow : kidsColors.purple,
                },
              ]}>
              {shown ? (
                <>
                  <Text style={{ fontSize: cardSize * 0.42 }}>{card.emoji}</Text>
                  <Text style={styles.cardName} numberOfLines={2}>
                    {card.name}
                  </Text>
                </>
              ) : (
                <Text style={[styles.back, { fontSize: cardSize * 0.35 }]}>✝︎</Text>
              )}
            </Pressable>
          );
        })}
      </View>
      {won ? <PillButton label={t('playAgain')} color={kidsColors.green} onPress={() => restart()} /> : null}
    </KidsScreen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: kidsFonts.bold, fontSize: 30, color: kidsColors.text },
  row: { flexDirection: 'row', gap: 10 },
  info: { fontFamily: kidsFonts.bold, fontSize: 20, color: kidsColors.purple, textAlign: 'center', minHeight: 28 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', alignSelf: 'center' },
  card: { borderRadius: kidsRadius.md, borderWidth: 4, alignItems: 'center', justifyContent: 'center', padding: 4 },
  cardName: { fontFamily: kidsFonts.bold, fontSize: 13, color: kidsColors.text, textAlign: 'center' },
  back: { color: kidsColors.onColor, fontFamily: kidsFonts.bold },
});

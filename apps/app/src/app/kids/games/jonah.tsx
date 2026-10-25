import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AnswerButton, GameEnd, GameShell, gameStyles, shuffled } from '@/kids/game-ui';
import { useKidsProgress } from '@/kids/progress';
import { useSpeaker } from '@/kids/speak';
import { type KidsKey, useKidsText } from '@/kids/strings';
import { kidsColors, kidsFonts, kidsRadius, tileColors } from '@/kids/theme';

// Os acontecimentos de Jonas 1–3, em ordem (os Pequenos ordenam só os principais)
const EVENTS = [
  { n: 1, emoji: '🏙️' },
  { n: 2, emoji: '⛵' },
  { n: 3, emoji: '⛈️', big: true },
  { n: 4, emoji: '🐋' },
  { n: 5, emoji: '🙏', big: true },
  { n: 6, emoji: '💛' },
];

/** A jornada de Jonas: colocar a história na ordem certa. */
export default function Jonah() {
  const { t, language } = useKidsText();
  const { level } = useKidsProgress();
  const { speak } = useSpeaker(language);
  const list = EVENTS.filter((e) => level === 'big' || !e.big);
  const [options, setOptions] = useState(() => shuffled(list));
  const [timeline, setTimeline] = useState<number[]>([]);
  const [wrong, setWrong] = useState<number | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const done = timeline.length === list.length;

  function pick(n: number) {
    const expected = list[timeline.length].n;
    if (n === expected) {
      setTimeline((tl) => [...tl, n]);
      setWrong(null);
      speak(t(`jonah_e${n}` as KidsKey));
    } else {
      setWrong(n);
      setMistakes((m) => m + 1);
    }
  }

  function again() {
    setOptions(shuffled(list));
    setTimeline([]);
    setWrong(null);
    setMistakes(0);
  }

  return (
    <GameShell game="jonah">
      <View style={styles.timeline}>
        {timeline.map((n, i) => {
          const e = EVENTS.find((x) => x.n === n)!;
          return (
            <View key={n} style={styles.step}>
              <Text style={styles.stepNumber}>{i + 1}</Text>
              <Text style={styles.stepEmoji}>{e.emoji}</Text>
              <Text style={styles.stepText}>{t(`jonah_e${n}` as KidsKey)}</Text>
            </View>
          );
        })}
      </View>
      {done ? (
        <GameEnd game="jonah" stars={mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1} onAgain={again} />
      ) : (
        <>
          <Text style={gameStyles.info}>{timeline.length ? t('jonah_next') : t('jonah_first')}</Text>
          {options
            .filter((e) => !timeline.includes(e.n))
            .map((e, i) => (
              <AnswerButton
                key={e.n}
                label={`${e.emoji}  ${t(`jonah_e${e.n}` as KidsKey)}`}
                color={tileColors[i % tileColors.length]}
                state={wrong === e.n ? 'wrong' : undefined}
                onPress={() => pick(e.n)}
              />
            ))}
          {wrong !== null ? <Text style={gameStyles.info}>{t('wrong')}</Text> : null}
        </>
      )}
    </GameShell>
  );
}

const styles = StyleSheet.create({
  timeline: { gap: 8 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: kidsColors.card, borderRadius: kidsRadius.md, borderWidth: 3, borderColor: kidsColors.blue, padding: 10 },
  stepNumber: { fontFamily: kidsFonts.bold, fontSize: 20, color: kidsColors.blue, width: 24, textAlign: 'center' },
  stepEmoji: { fontSize: 30 },
  stepText: { flex: 1, fontFamily: kidsFonts.bold, fontSize: 17, lineHeight: 23, color: kidsColors.text },
});

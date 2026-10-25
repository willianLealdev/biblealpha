import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AnswerButton, GameEnd, GameShell, gameStyles, shuffled } from '@/kids/game-ui';
import { useKidsProgress } from '@/kids/progress';
import { useSpeaker } from '@/kids/speak';
import { type KidsKey, useKidsText } from '@/kids/strings';
import { kidsColors, kidsFonts, kidsRadius, tileColors } from '@/kids/theme';
import { PillButton } from '@/kids/ui';

// Acontecimentos em ordem, de Gênesis a Atos
const EVENTS = ['🌍', '🚢', '⛺', '🌾', '🌊', '🎺', '👑', '🦁', '⭐', '✝️', '🔥', '⛵'];
const TRIPS = 3;

function deal(count: number) {
  return Array.from({ length: TRIPS }, () => shuffled(EVENTS.map((_, i) => i + 1)).slice(0, count).sort((a, b) => a - b));
}

/** Máquina do tempo bíblica: colocar os acontecimentos em ordem cronológica (3 viagens). */
export default function TimeMachine() {
  const { t, language } = useKidsText();
  const { level } = useKidsProgress();
  const { speak } = useSpeaker(language);
  const count = level === 'big' ? 6 : 4;
  const [trips, setTrips] = useState(() => deal(count));
  const [trip, setTrip] = useState(0);
  const [placed, setPlaced] = useState<number[]>([]);
  const [order, setOrder] = useState(() => shuffled(trips[0]));
  const [wrong, setWrong] = useState<number | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const done = trip >= TRIPS;
  const events = trips[trip] ?? [];
  const tripDone = !done && placed.length === events.length;

  function pick(n: number) {
    if (n === events[placed.length]) {
      setPlaced((p) => [...p, n]);
      setWrong(null);
      speak(t(`tm_e${n}` as KidsKey));
    } else {
      setWrong(n);
      setMistakes((m) => m + 1);
    }
  }

  function nextTrip() {
    const next = trip + 1;
    setTrip(next);
    setPlaced([]);
    setWrong(null);
    if (next < TRIPS) setOrder(shuffled(trips[next]));
  }

  function again() {
    const fresh = deal(count);
    setTrips(fresh);
    setTrip(0);
    setPlaced([]);
    setOrder(shuffled(fresh[0]));
    setMistakes(0);
  }

  if (done) {
    return (
      <GameShell game="timemachine">
        <GameEnd game="timemachine" stars={mistakes === 0 ? 3 : mistakes <= 3 ? 2 : 1} onAgain={again} />
      </GameShell>
    );
  }

  return (
    <GameShell game="timemachine" status={`⏳ ${t('tm_trip', { n: trip + 1, total: TRIPS })}`}>
      <View style={styles.line}>
        {placed.map((n, i) => (
          <View key={n} style={styles.step}>
            <Text style={styles.stepNumber}>{i + 1}</Text>
            <Text style={styles.stepEmoji}>{EVENTS[n - 1]}</Text>
            <Text style={styles.stepText}>{t(`tm_e${n}` as KidsKey)}</Text>
          </View>
        ))}
      </View>
      {tripDone ? (
        <PillButton label={t('nextQuestion')} color={kidsColors.green} onPress={nextTrip} />
      ) : (
        <>
          <Text style={gameStyles.info}>{placed.length ? t('tm_next') : t('tm_first')}</Text>
          {order
            .filter((n) => !placed.includes(n))
            .map((n, i) => (
              <AnswerButton key={n} label={`${EVENTS[n - 1]}  ${t(`tm_e${n}` as KidsKey)}`} color={tileColors[i % tileColors.length]} state={wrong === n ? 'wrong' : undefined} onPress={() => pick(n)} />
            ))}
          {wrong !== null ? <Text style={gameStyles.info}>{t('wrong')}</Text> : null}
        </>
      )}
    </GameShell>
  );
}

const styles = StyleSheet.create({
  line: { gap: 8 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: kidsColors.card, borderRadius: kidsRadius.md, borderWidth: 3, borderColor: kidsColors.blue, padding: 10 },
  stepNumber: { fontFamily: kidsFonts.bold, fontSize: 20, color: kidsColors.blue, width: 24, textAlign: 'center' },
  stepEmoji: { fontSize: 30 },
  stepText: { flex: 1, fontFamily: kidsFonts.bold, fontSize: 17, lineHeight: 23, color: kidsColors.text },
});

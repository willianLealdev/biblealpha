import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { GameEnd, GameShell, gameStyles } from '@/kids/game-ui';
import { useKidsProgress } from '@/kids/progress';
import { useSpeaker } from '@/kids/speak';
import { useKidsText } from '@/kids/strings';
import { kidsColors, kidsFonts, kidsRadius } from '@/kids/theme';
import { trumpet } from '@/kids/tones';
import { PillButton } from '@/kids/ui';

type Phase = 'march' | 'trumpet' | 'shout' | 'fallen';

/** As muralhas de Jericó: 6 dias com uma volta, no 7º sete voltas, trombetas no tempo certo e o grito (Josué 6). */
export default function Jericho() {
  const { t, language } = useKidsText();
  const { level } = useKidsProgress();
  const { speak } = useSpeaker(language);
  const blasts = level === 'big' ? 3 : 2;
  const zone = level === 'big' ? 0.18 : 0.3;
  const [phase, setPhase] = useState<Phase>('march');
  const [day, setDay] = useState(1);
  const [laps, setLaps] = useState(0);
  const [good, setGood] = useState(0);
  const [misses, setMisses] = useState(0);
  const [beat, setBeat] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const lapsToday = day < 7 ? 1 : 7;
  const pos = Math.sin(beat);

  useEffect(() => {
    if (phase !== 'trumpet') return;
    const timer = setInterval(() => setBeat((b) => b + (level === 'big' ? 0.1 : 0.07)), 30);
    return () => clearInterval(timer);
  }, [phase, level]);

  function march() {
    const done = laps + 1;
    if (done < lapsToday) return setLaps(done);
    setLaps(0);
    if (day < 7) {
      setDay((d) => d + 1);
      speak(t('jer_day', { n: day + 1 }));
    } else {
      setPhase('trumpet');
      setMessage(t('jer_ready'));
    }
  }

  function blow() {
    if (Math.abs(pos) <= zone) {
      trumpet();
      const now = good + 1;
      setGood(now);
      setMessage(t('jer_good'));
      if (now >= blasts) setPhase('shout');
    } else {
      setMisses((m) => m + 1);
      setMessage(t('jer_early'));
    }
  }

  function again() {
    setPhase('march');
    setDay(1);
    setLaps(0);
    setGood(0);
    setMisses(0);
    setMessage(null);
  }

  if (phase === 'fallen') {
    return (
      <GameShell game="jericho">
        <View style={[gameStyles.card, { alignItems: 'center' }]}>
          <Text style={styles.fallen}>🧱💥🧱</Text>
          <Text style={gameStyles.info}>{t('jer_fell')}</Text>
        </View>
        <GameEnd game="jericho" stars={misses === 0 ? 3 : misses <= 3 ? 2 : 1} onAgain={again} />
      </GameShell>
    );
  }

  return (
    <GameShell game="jericho" status={`${t('jer_day', { n: day })} · ${t('jer_lap', { n: Math.min(laps + (phase === 'march' ? 0 : lapsToday), lapsToday), total: lapsToday })}`}>
      <View style={styles.field}>
        <View style={styles.days}>
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <View key={d} style={[styles.dayDot, d < day || phase !== 'march' ? styles.dayDone : d === day ? styles.dayNow : null]}>
              <Text style={styles.dayText}>{d}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.city}>🏰</Text>
        <Text style={styles.people}>{'🚶'.repeat(Math.max(1, laps + 1))}🎺</Text>
      </View>
      {phase === 'march' ? <PillButton label={t('jer_march')} color={kidsColors.orange} onPress={march} style={{ minHeight: 72 }} textSize={24} /> : null}
      {phase === 'trumpet' ? (
        <>
          <View style={styles.track}>
            <View style={[styles.zone, { width: `${zone * 100}%`, left: `${50 - zone * 50}%` }]} />
            <Text style={[styles.note, { left: `${(pos + 1) * 50}%` }]}>🎵</Text>
          </View>
          <Text style={gameStyles.info}>
            {'🎺'.repeat(good)}
            {'▫️'.repeat(blasts - good)}
          </Text>
          <PillButton label={t('jer_trumpet')} color={kidsColors.yellow} onPress={blow} style={{ minHeight: 72 }} textSize={24} />
        </>
      ) : null}
      {phase === 'shout' ? (
        <PillButton
          label={t('jer_shout')}
          color={kidsColors.pink}
          onPress={() => {
            setPhase('fallen');
            speak(t('jer_fell'));
          }}
          style={{ minHeight: 80 }}
          textSize={28}
        />
      ) : null}
      {message ? <Text style={gameStyles.info}>{message}</Text> : null}
    </GameShell>
  );
}

const styles = StyleSheet.create({
  field: { backgroundColor: '#FFF1DA', borderRadius: kidsRadius.lg, borderWidth: 3, borderColor: kidsColors.orange, padding: 14, alignItems: 'center', gap: 8 },
  days: { flexDirection: 'row', gap: 6 },
  dayDot: { width: 34, height: 34, borderRadius: 17, backgroundColor: kidsColors.card, borderWidth: 2, borderColor: kidsColors.border, alignItems: 'center', justifyContent: 'center' },
  dayNow: { borderColor: kidsColors.orange, borderWidth: 3 },
  dayDone: { backgroundColor: kidsColors.yellow, borderColor: kidsColors.yellow },
  dayText: { fontFamily: kidsFonts.bold, fontSize: 15, color: kidsColors.text },
  city: { fontSize: 80 },
  people: { fontSize: 26, textAlign: 'center' },
  fallen: { fontSize: 64 },
  track: { height: 52, borderRadius: 26, backgroundColor: kidsColors.card, borderWidth: 3, borderColor: kidsColors.border, justifyContent: 'center' },
  zone: { position: 'absolute', top: 0, bottom: 0, backgroundColor: kidsColors.yellow, opacity: 0.5, borderRadius: 22 },
  note: { position: 'absolute', marginLeft: -14, fontSize: 28 },
});

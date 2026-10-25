import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AnswerButton, GameEnd, GameShell, gameStyles, shuffled } from '@/kids/game-ui';
import { useKidsProgress } from '@/kids/progress';
import { useSpeaker } from '@/kids/speak';
import { type KidsKey, useKidsText } from '@/kids/strings';
import { kidsColors, kidsFonts, kidsRadius, tileColors } from '@/kids/theme';
import { PillButton } from '@/kids/ui';

const HARVEST = 10;
const YEARS = 7;

type Phase = 'dream' | 'plenty' | 'famine';

/** José no Egito: entender o sonho e guardar comida nos 7 anos de fartura para os 7 de fome (Gênesis 41). */
export default function Joseph() {
  const { t, language } = useKidsText();
  const { level } = useKidsProgress();
  const { speak } = useSpeaker(language);
  const need = level === 'big' ? 3 : 2;
  const [phase, setPhase] = useState<Phase>('dream');
  const [question, setQuestion] = useState(1);
  const [options, setOptions] = useState(() => shuffled(['a', 'b', 'c']));
  const [tried, setTried] = useState<string[]>([]);
  const [year, setYear] = useState(1);
  const [store, setStore] = useState(2);
  const [barn, setBarn] = useState(0);
  const [fed, setFed] = useState(0);
  const [report, setReport] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  function answer(o: string) {
    if (tried.includes(o)) return;
    if (o !== 'a') return setTried((l) => [...l, o]);
    setTried([]);
    setOptions(shuffled(['a', 'b', 'c']));
    if (question === 1) setQuestion(2);
    else setPhase('plenty');
    speak(t('right'));
  }

  function nextPlenty() {
    setBarn((b) => b + store);
    if (year < YEARS) return setYear((y) => y + 1);
    setYear(1);
    setPhase('famine');
  }

  function nextFamine() {
    const give = Math.min(barn, need);
    setBarn((b) => b - give);
    setFed((f) => f + give);
    const text = give === need ? t('jo_fed') : t('jo_short', { n: need - give });
    setReport(text);
    speak(text);
    if (year < YEARS) setYear((y) => y + 1);
    else setFinished(true);
  }

  function again() {
    setPhase('dream');
    setQuestion(1);
    setTried([]);
    setYear(1);
    setStore(2);
    setBarn(0);
    setFed(0);
    setReport(null);
    setFinished(false);
  }

  if (finished) {
    const total = need * YEARS;
    return (
      <GameShell game="joseph">
        <View style={[gameStyles.card, { alignItems: 'center' }]}>
          <Text style={{ fontSize: 56 }}>🌾🍞👨‍👩‍👧</Text>
          <Text style={gameStyles.info}>{t('jo_result', { n: fed, total })}</Text>
        </View>
        <GameEnd game="joseph" stars={fed >= total ? 3 : fed >= total * 0.6 ? 2 : 1} onAgain={again} />
      </GameShell>
    );
  }

  if (phase === 'dream') {
    const q = `jo_q${question}`;
    return (
      <GameShell game="joseph">
        <View style={gameStyles.card}>
          <Text style={styles.emoji}>{question === 1 ? '🐄🐄 / 🐄' : '💭👑'}</Text>
          <Text style={gameStyles.big}>{t(q as KidsKey)}</Text>
        </View>
        {options.map((o, i) => (
          <AnswerButton key={o} label={t(`${q}_${o}` as KidsKey)} color={tileColors[i]} state={tried.includes(o) ? 'wrong' : undefined} onPress={() => answer(o)} />
        ))}
        {tried.length ? <Text style={gameStyles.info}>{t('wrong')}</Text> : null}
      </GameShell>
    );
  }

  return (
    <GameShell game="joseph" status={phase === 'plenty' ? t('jo_good_year', { n: year }) : t('jo_famine', { n: year })}>
      <View style={styles.barn}>
        <Text style={styles.barnEmoji}>🏚️</Text>
        <Text style={styles.barnText}>{t('jo_barn', { n: barn })}</Text>
        <Text style={styles.sacks}>{'🌾'.repeat(Math.min(barn, 30))}</Text>
      </View>
      {phase === 'plenty' ? (
        <View style={gameStyles.card}>
          <Text style={gameStyles.big}>{t('jo_harvest', { n: HARVEST })}</Text>
          <Text style={gameStyles.info}>{t('jo_store', { n: store })}</Text>
          <View style={styles.row}>
            <PillButton label="−" color={kidsColors.orange} onPress={() => setStore((s) => Math.max(0, s - 1))} style={{ flex: 1 }} textSize={30} />
            <PillButton label="+" color={kidsColors.green} onPress={() => setStore((s) => Math.min(HARVEST, s + 1))} style={{ flex: 1 }} textSize={30} />
          </View>
          <Text style={styles.tip}>💡 {t('jo_tip')}</Text>
          <PillButton label={t('jo_next')} color={kidsColors.blue} onPress={nextPlenty} />
        </View>
      ) : (
        <View style={gameStyles.card}>
          <Text style={gameStyles.big}>
            {'👨‍👩‍👧'.repeat(need)} {t('jo_families', { n: need })}
          </Text>
          {report ? <Text style={gameStyles.info}>{report}</Text> : null}
          <PillButton label={`🍞 ${t('jo_next')}`} color={kidsColors.blue} onPress={nextFamine} />
        </View>
      )}
    </GameShell>
  );
}

const styles = StyleSheet.create({
  emoji: { fontSize: 44, textAlign: 'center' },
  barn: { backgroundColor: '#FFF4D6', borderRadius: kidsRadius.lg, borderWidth: 3, borderColor: kidsColors.yellow, padding: 14, alignItems: 'center', gap: 4 },
  barnEmoji: { fontSize: 50 },
  barnText: { fontFamily: kidsFonts.bold, fontSize: 20, color: kidsColors.text },
  sacks: { fontSize: 18, textAlign: 'center' },
  row: { flexDirection: 'row', gap: 12 },
  tip: { fontFamily: kidsFonts.regular, fontSize: 15, color: kidsColors.textMuted, textAlign: 'center' },
});

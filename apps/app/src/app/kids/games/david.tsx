import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AnswerButton, GameEnd, GameShell, gameStyles, shuffled } from '@/kids/game-ui';
import { useKidsProgress } from '@/kids/progress';
import { useSpeaker } from '@/kids/speak';
import { type KidsKey, useKidsText } from '@/kids/strings';
import { kidsColors, kidsFonts, kidsRadius, tileColors } from '@/kids/theme';
import { PillButton } from '@/kids/ui';

const GOAL = 3;
// Perguntas de 1 Samuel 17 para ganhar pedras (a resposta certa é sempre a "_a")
const QUESTIONS = [1, 2, 3, 4];

/** Davi e Golias: acertar o alvo com a funda; responder perguntas da história para ganhar pedras. */
export default function David() {
  const { t, language } = useKidsText();
  const { level } = useKidsProgress();
  const { speak } = useSpeaker(language);
  const zone = level === 'big' ? 0.16 : 0.28;
  const [phase, setPhase] = useState(0);
  const [stones, setStones] = useState(3);
  const [hits, setHits] = useState(0);
  const [throws, setThrows] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [question, setQuestion] = useState<{ n: number; options: string[] } | null>(null);
  const [tried, setTried] = useState<string[]>([]);
  const done = hits >= GOAL;
  const aim = Math.sin(phase);

  // A mira vai e volta sozinha (mais rápida para os Grandes)
  useEffect(() => {
    if (done || question) return;
    const speed = level === 'big' ? 0.11 : 0.07;
    const timer = setInterval(() => setPhase((p) => p + speed), 30);
    return () => clearInterval(timer);
  }, [done, question, level]);

  function ask() {
    const n = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
    setTried([]);
    setQuestion({ n, options: shuffled(['a', 'b', 'c']) });
  }

  function throwStone() {
    if (stones <= 0) return ask();
    setStones((s) => s - 1);
    setThrows((n) => n + 1);
    if (Math.abs(aim) <= zone) {
      setHits((h) => h + 1);
      setMessage(t('david_hit'));
      speak(t('david_hit'));
    } else {
      setMessage(t('david_miss'));
    }
    if (stones - 1 <= 0 && hits + (Math.abs(aim) <= zone ? 1 : 0) < GOAL) setTimeout(ask, 600);
  }

  function answer(option: string) {
    if (!question) return;
    if (option === 'a') {
      setStones((s) => s + 2);
      setQuestion(null);
      setMessage(t('right'));
    } else {
      setTried((list) => [...list, option]);
    }
  }

  function again() {
    setStones(3);
    setHits(0);
    setThrows(0);
    setMessage(null);
    setQuestion(null);
  }

  if (done) {
    return (
      <GameShell game="david">
        <GameEnd game="david" stars={throws <= 4 ? 3 : throws <= 7 ? 2 : 1} onAgain={again} />
      </GameShell>
    );
  }

  if (question) {
    const q = `david_q${question.n}`;
    return (
      <GameShell game="david" status={t('david_earn')}>
        <View style={gameStyles.card}>
          <Text style={gameStyles.big}>{t(q as KidsKey)}</Text>
        </View>
        {question.options.map((o, i) => (
          <AnswerButton
            key={o}
            label={t(`${q}_${o}` as KidsKey)}
            color={tileColors[i % tileColors.length]}
            state={tried.includes(o) ? 'wrong' : undefined}
            onPress={() => answer(o)}
          />
        ))}
        {tried.length ? <Text style={gameStyles.info}>{t('wrong')}</Text> : null}
      </GameShell>
    );
  }

  return (
    <GameShell game="david" status={`${t('david_hits', { n: hits })} · ⚪ ${t('david_stones', { n: stones })}`}>
      <View style={styles.field}>
        <Text style={styles.target}>🎯</Text>
        <View style={styles.track}>
          {/* A faixa verde é exatamente a área que conta como acerto */}
          <View style={[styles.zone, { width: `${zone * 100}%`, left: `${50 - zone * 50}%` }]} />
          <View style={[styles.marker, { left: `${(aim + 1) * 50}%` }]}>
            <Text style={styles.stone}>⚪</Text>
          </View>
        </View>
        <Text style={styles.david}>🧒</Text>
      </View>
      {message ? <Text style={gameStyles.info}>{message}</Text> : null}
      <PillButton label={t('david_throw')} color={kidsColors.orange} onPress={throwStone} style={{ minHeight: 80 }} textSize={30} />
    </GameShell>
  );
}

const styles = StyleSheet.create({
  field: { backgroundColor: '#E8F6FF', borderRadius: kidsRadius.lg, borderWidth: 3, borderColor: kidsColors.blue, padding: 12, alignItems: 'center', gap: 10 },
  target: { fontSize: 60 },
  track: { width: '100%', height: 44, borderRadius: 22, backgroundColor: kidsColors.card, borderWidth: 3, borderColor: kidsColors.border, justifyContent: 'center' },
  zone: { position: 'absolute', top: 0, bottom: 0, backgroundColor: kidsColors.green, opacity: 0.45, borderRadius: 18 },
  marker: { position: 'absolute', marginLeft: -16, width: 32, alignItems: 'center' },
  stone: { fontSize: 26 },
  david: { fontSize: 40 },
  hint: { fontFamily: kidsFonts.regular, fontSize: 15, color: kidsColors.textMuted },
});

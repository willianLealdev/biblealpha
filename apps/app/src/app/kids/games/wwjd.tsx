import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AnswerButton, GameEnd, GameShell, gameStyles, shuffled } from '@/kids/game-ui';
import { useKidsProgress } from '@/kids/progress';
import { useSpeaker } from '@/kids/speak';
import { type KidsKey, useKidsText } from '@/kids/strings';
import { kidsColors, kidsFonts, kidsRadius, tileColors } from '@/kids/theme';
import { PillButton } from '@/kids/ui';

const SITUATIONS = [1, 2, 3, 4, 5, 6, 7, 8];
const k = (n: number, rest = '') => `wwjd_${n}${rest}` as KidsKey;

/** O que Jesus faria? Escolher como agir; toda escolha mostra o ensinamento (sem castigo). */
export default function WhatWouldJesusDo() {
  const { t, language } = useKidsText();
  const { level } = useKidsProgress();
  const { speak } = useSpeaker(language);
  const count = level === 'big' ? 8 : 5;
  const deal = () => shuffled(SITUATIONS).slice(0, count).map((n) => ({ n, options: shuffled(['a', 'b', 'c']) }));
  const [rounds, setRounds] = useState(deal);
  const [index, setIndex] = useState(0);
  const [choice, setChoice] = useState<string | null>(null);
  const [tried, setTried] = useState<string[]>([]);
  const [firstTry, setFirstTry] = useState(0);

  function again() {
    setRounds(deal());
    setIndex(0);
    setChoice(null);
    setTried([]);
    setFirstTry(0);
  }

  if (index >= rounds.length) {
    return (
      <GameShell game="wwjd">
        <GameEnd game="wwjd" stars={firstTry >= rounds.length - 1 ? 3 : firstTry >= rounds.length / 2 ? 2 : 1} onAgain={again} />
      </GameShell>
    );
  }

  const r = rounds[index];
  const good = choice === 'a';

  function pick(o: string) {
    if (good) return;
    setChoice(o);
    if (!tried.length && o === 'a') setFirstTry((n) => n + 1);
    setTried((list) => [...list, o]);
    speak(`${o === 'a' ? t('wwjd_right') : t('wwjd_think')} ${t(k(r.n, '_t'))}`);
  }

  return (
    <GameShell game="wwjd" status={t('questionOf', { n: index + 1, total: rounds.length })}>
      <View style={gameStyles.card}>
        <Text style={styles.emoji}>🤔</Text>
        <Text style={gameStyles.big} onPress={() => speak(t(k(r.n)))}>
          {t(k(r.n))}
        </Text>
      </View>
      {r.options.map((o, i) => (
        <AnswerButton
          key={o}
          label={t(k(r.n, `_${o}`))}
          color={tileColors[i % tileColors.length]}
          state={good && o === 'a' ? 'right' : tried.includes(o) && o !== 'a' ? 'wrong' : undefined}
          onPress={() => pick(o)}
        />
      ))}
      {choice ? (
        <View style={[styles.teach, { borderColor: good ? kidsColors.green : kidsColors.yellow }]}>
          <Text style={[styles.teachTitle, { color: good ? kidsColors.green : kidsColors.orange }]}>{good ? t('wwjd_right') : t('wwjd_think')}</Text>
          <Text style={styles.teachText}>{t(k(r.n, '_t'))}</Text>
          <Text style={styles.ref}>📜 {t(k(r.n, '_r'))}</Text>
        </View>
      ) : null}
      {good ? (
        <PillButton
          label={t('nextQuestion')}
          color={kidsColors.green}
          onPress={() => {
            setIndex((i) => i + 1);
            setChoice(null);
            setTried([]);
          }}
        />
      ) : null}
    </GameShell>
  );
}

const styles = StyleSheet.create({
  emoji: { fontSize: 40, textAlign: 'center' },
  teach: { backgroundColor: kidsColors.card, borderRadius: kidsRadius.lg, borderWidth: 3, padding: 16, gap: 6 },
  teachTitle: { fontFamily: kidsFonts.bold, fontSize: 20 },
  teachText: { fontFamily: kidsFonts.regular, fontSize: 19, lineHeight: 27, color: kidsColors.text },
  ref: { fontFamily: kidsFonts.regular, fontSize: 15, color: kidsColors.textMuted },
});

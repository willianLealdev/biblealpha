import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AnswerButton, GameEnd, GameShell, gameStyles, shuffled } from '@/kids/game-ui';
import { useKidsProgress } from '@/kids/progress';
import { useSpeaker } from '@/kids/speak';
import { type KidsKey, useKidsText } from '@/kids/strings';
import { kidsColors, kidsFonts, kidsRadius, tileColors } from '@/kids/theme';
import { PillButton } from '@/kids/ui';

// Situações do dia a dia e o mandamento que ensina o que fazer (numeração de Êxodo 20:3–17)
const SITUATIONS = [
  { s: 1, answer: 5 },
  { s: 2, answer: 8 },
  { s: 3, answer: 9 },
  { s: 4, answer: 10 },
  { s: 5, answer: 1 },
  { s: 6, answer: 3 },
  { s: 7, answer: 4 },
  { s: 8, answer: 6 },
];
// Mandamentos usados como alternativas (os que têm situação para criança)
const CHOICES = [1, 3, 4, 5, 6, 8, 9, 10];
const cmd = (n: number) => `cmd_${n}` as KidsKey;

type Round = { s: number; answer: number; options: number[] };

function deal(count: number): Round[] {
  return shuffled(SITUATIONS)
    .slice(0, count)
    .map((x) => ({ ...x, options: shuffled([x.answer, ...shuffled(CHOICES.filter((c) => c !== x.answer)).slice(0, 2)]) }));
}

/** Desafio dos 10 mandamentos: completar as tábuas respondendo situações do dia a dia. */
export default function Commandments() {
  const { t, language } = useKidsText();
  const { level } = useKidsProgress();
  const { speak } = useSpeaker(language);
  const count = level === 'big' ? 8 : 5;
  const [rounds, setRounds] = useState(() => deal(count));
  const [index, setIndex] = useState(0);
  const [tried, setTried] = useState<number[]>([]);
  const [solved, setSolved] = useState(false);
  const [lit, setLit] = useState<number[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const round = rounds[index];

  function pick(n: number) {
    if (solved || tried.includes(n)) return;
    if (n === round.answer) {
      setSolved(true);
      setLit((l) => [...l, n]);
      speak(`${t('right')} ${t(cmd(n))}`);
    } else {
      setTried((list) => [...list, n]);
      setMistakes((m) => m + 1);
    }
  }

  function next() {
    setIndex((i) => i + 1);
    setTried([]);
    setSolved(false);
  }

  function again() {
    setRounds(deal(count));
    setIndex(0);
    setTried([]);
    setSolved(false);
    setLit([]);
    setMistakes(0);
  }

  const tablets = (
    <View style={styles.tablets} accessibilityLabel={t('cmd_tablets')}>
      {[
        [1, 2, 3, 4, 5],
        [6, 7, 8, 9, 10],
      ].map((side, k) => (
        <View key={k} style={styles.tablet}>
          {side.map((n) => (
            <Text key={n} style={[styles.law, lit.includes(n) && styles.lawOn]} numberOfLines={2}>
              {n}. {t(cmd(n))}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );

  if (index >= rounds.length) {
    return (
      <GameShell game="commandments">
        {tablets}
        <GameEnd game="commandments" stars={mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1} onAgain={again} />
      </GameShell>
    );
  }

  return (
    <GameShell game="commandments" status={t('questionOf', { n: index + 1, total: rounds.length })}>
      <View style={gameStyles.card}>
        <Text style={gameStyles.big} onPress={() => speak(t(`cmd_s${round.s}` as KidsKey))}>
          {t(`cmd_s${round.s}` as KidsKey)}
        </Text>
      </View>
      {round.options.map((n, i) => (
        <AnswerButton
          key={n}
          label={t(cmd(n))}
          color={tileColors[i % tileColors.length]}
          state={solved && n === round.answer ? 'right' : tried.includes(n) ? 'wrong' : undefined}
          onPress={() => pick(n)}
        />
      ))}
      {tried.length && !solved ? <Text style={gameStyles.info}>{t('wrong')}</Text> : null}
      {solved ? <PillButton label={t('nextQuestion')} color={kidsColors.green} onPress={next} /> : null}
      {tablets}
    </GameShell>
  );
}

const styles = StyleSheet.create({
  tablets: { flexDirection: 'row', gap: 10 },
  tablet: { flex: 1, backgroundColor: '#ECE6DA', borderTopLeftRadius: 60, borderTopRightRadius: 60, borderBottomLeftRadius: kidsRadius.md, borderBottomRightRadius: kidsRadius.md, borderWidth: 3, borderColor: '#B8A98C', paddingTop: 24, padding: 10, gap: 6 },
  law: { fontFamily: kidsFonts.regular, fontSize: 13, lineHeight: 17, color: '#8C7E66' },
  lawOn: { fontFamily: kidsFonts.bold, color: kidsColors.text, backgroundColor: kidsColors.yellow, borderRadius: 6, overflow: 'hidden', paddingHorizontal: 3 },
});

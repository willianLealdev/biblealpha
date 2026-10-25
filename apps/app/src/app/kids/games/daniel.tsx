import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AnswerButton, GameEnd, GameShell, gameStyles, shuffled } from '@/kids/game-ui';
import { useKidsProgress } from '@/kids/progress';
import { useSpeaker } from '@/kids/speak';
import { type KidsKey, useKidsText } from '@/kids/strings';
import { kidsColors, kidsRadius, tileColors } from '@/kids/theme';
import { PillButton } from '@/kids/ui';

// Perguntas de Daniel 6 (a resposta certa é sempre a "_a"; as alternativas são embaralhadas)
const QUESTIONS = [1, 2, 3, 4, 5];

function deal(count: number) {
  return shuffled(QUESTIONS)
    .slice(0, count)
    .map((n) => ({ n, options: shuffled(['a', 'b', 'c']) }));
}

/** Daniel na cova dos leões: cada resposta certa faz um leão dormir. */
export default function Daniel() {
  const { t, language } = useKidsText();
  const { level } = useKidsProgress();
  const { speak } = useSpeaker(language);
  const count = level === 'big' ? 5 : 3;
  const [rounds, setRounds] = useState(() => deal(count));
  const [index, setIndex] = useState(0);
  const [tried, setTried] = useState<string[]>([]);
  const [solved, setSolved] = useState(false);
  const [mistakes, setMistakes] = useState(0);
  const sleeping = index + (solved ? 1 : 0);

  const lions = (
    <View style={styles.den}>
      <Text style={styles.daniel}>🙏</Text>
      <View style={styles.lions}>
        {rounds.map((_, i) => (
          <Text key={i} style={styles.lion}>
            {i < sleeping ? '😴' : '🦁'}
          </Text>
        ))}
      </View>
      <Text style={gameStyles.info}>{t('daniel_sleeping', { n: Math.min(sleeping, rounds.length), total: rounds.length })}</Text>
    </View>
  );

  function again() {
    setRounds(deal(count));
    setIndex(0);
    setTried([]);
    setSolved(false);
    setMistakes(0);
  }

  if (index >= rounds.length) {
    return (
      <GameShell game="daniel">
        {lions}
        <GameEnd game="daniel" stars={mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1} onAgain={again} />
      </GameShell>
    );
  }

  const round = rounds[index];
  const q = `daniel_q${round.n}`;

  function pick(o: string) {
    if (solved || tried.includes(o)) return;
    if (o === 'a') {
      setSolved(true);
      speak(t('right'));
    } else {
      setTried((list) => [...list, o]);
      setMistakes((m) => m + 1);
    }
  }

  return (
    <GameShell game="daniel">
      {lions}
      <View style={gameStyles.card}>
        <Text style={gameStyles.big} onPress={() => speak(t(q as KidsKey))}>
          {t(q as KidsKey)}
        </Text>
      </View>
      {round.options.map((o, i) => (
        <AnswerButton
          key={o}
          label={t(`${q}_${o}` as KidsKey)}
          color={tileColors[i % tileColors.length]}
          state={solved && o === 'a' ? 'right' : tried.includes(o) ? 'wrong' : undefined}
          onPress={() => pick(o)}
        />
      ))}
      {tried.length && !solved ? <Text style={gameStyles.info}>{t('daniel_wrong')}</Text> : null}
      {solved ? (
        <PillButton
          label={t('nextQuestion')}
          color={kidsColors.green}
          onPress={() => {
            setIndex((i) => i + 1);
            setTried([]);
            setSolved(false);
          }}
        />
      ) : null}
    </GameShell>
  );
}

const styles = StyleSheet.create({
  den: { backgroundColor: '#F3E3C7', borderRadius: kidsRadius.lg, borderWidth: 3, borderColor: '#C9A46A', padding: 14, alignItems: 'center', gap: 6 },
  daniel: { fontSize: 52 },
  lions: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center' },
  lion: { fontSize: 44 },
});

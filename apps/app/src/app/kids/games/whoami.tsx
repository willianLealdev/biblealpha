import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AnswerButton, GameEnd, GameShell, gameStyles, shuffled } from '@/kids/game-ui';
import { useKidsProgress } from '@/kids/progress';
import { useSpeaker } from '@/kids/speak';
import { type KidsKey, useKidsText } from '@/kids/strings';
import { kidsColors, kidsFonts, tileColors } from '@/kids/theme';
import { PillButton } from '@/kids/ui';

const PEOPLE = ['noah', 'david', 'daniel', 'jonah', 'moses', 'mary', 'zacchaeus', 'peter', 'abraham', 'joseph', 'esther', 'samson', 'paul', 'adam', 'ruth'];
const clue = (id: string, n: number) => `who_${id}_${n}` as KidsKey;
const nameOf = (id: string) => `who_${id}_name` as KidsKey;

type Round = { id: string; options: string[] };

function deal(count: number): Round[] {
  return shuffled(PEOPLE)
    .slice(0, count)
    .map((id) => ({ id, options: shuffled([id, ...shuffled(PEOPLE.filter((p) => p !== id)).slice(0, 2)]) }));
}

/** Quem sou eu? Pistas sobre um personagem da Bíblia; menos pistas, mais estrelas. */
export default function WhoAmI() {
  const { t, language } = useKidsText();
  const { level } = useKidsProgress();
  const { speak } = useSpeaker(language);
  const count = level === 'big' ? 8 : 5;
  const [rounds, setRounds] = useState<Round[]>(() => deal(count));
  const [index, setIndex] = useState(0);
  const [clues, setClues] = useState(1);
  const [wrong, setWrong] = useState<string[]>([]);
  const [solved, setSolved] = useState(false);
  const [points, setPoints] = useState<number[]>([]);

  const round = rounds[index];

  function pick(id: string) {
    if (solved || wrong.includes(id)) return;
    if (id === round.id) {
      setSolved(true);
      setPoints((p) => [...p, Math.max(1, 3 - (clues - 1) - wrong.length)]);
      speak(`${t('right')} ${t(nameOf(round.id))}`);
    } else {
      setWrong((w) => [...w, id]);
      speak(t('wrong'));
    }
  }

  function next() {
    setIndex((i) => i + 1);
    setClues(1);
    setWrong([]);
    setSolved(false);
  }

  function again() {
    setRounds(deal(count));
    setIndex(0);
    setClues(1);
    setWrong([]);
    setSolved(false);
    setPoints([]);
  }

  if (index >= rounds.length) {
    const avg = points.reduce((a, b) => a + b, 0) / Math.max(1, points.length);
    return (
      <GameShell game="whoami">
        <GameEnd game="whoami" stars={avg} onAgain={again} />
      </GameShell>
    );
  }

  return (
    <GameShell game="whoami" status={t('questionOf', { n: index + 1, total: rounds.length })}>
      <View style={gameStyles.card}>
        <Text style={styles.question}>🤔 {t('who_question')}</Text>
        {[1, 2, 3].slice(0, clues).map((n) => (
          <Text key={n} style={styles.clue} onPress={() => speak(t(clue(round.id, n)))}>
            {n}. {t(clue(round.id, n))}
          </Text>
        ))}
        {clues < 3 && !solved ? (
          <PillButton
            label={`💡 ${t('who_more')}`}
            color={kidsColors.yellow}
            active={false}
            onPress={() => {
              setClues((c) => c + 1);
              speak(t(clue(round.id, clues + 1)));
            }}
            textSize={17}
          />
        ) : null}
      </View>
      {round.options.map((id, i) => (
        <AnswerButton
          key={id}
          label={t(nameOf(id))}
          color={tileColors[i % tileColors.length]}
          state={solved && id === round.id ? 'right' : wrong.includes(id) ? 'wrong' : undefined}
          onPress={() => pick(id)}
        />
      ))}
      {wrong.length && !solved ? <Text style={gameStyles.info}>{t('wrong')}</Text> : null}
      {solved ? <PillButton label={t('nextQuestion')} color={kidsColors.green} onPress={next} /> : null}
    </GameShell>
  );
}

const styles = StyleSheet.create({
  question: { fontFamily: kidsFonts.bold, fontSize: 24, color: kidsColors.purple, textAlign: 'center' },
  clue: { fontFamily: kidsFonts.bold, fontSize: 20, lineHeight: 28, color: kidsColors.text },
});

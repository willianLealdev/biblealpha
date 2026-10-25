import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AnswerButton, GameEnd, GameShell, gameStyles, shuffled } from '@/kids/game-ui';
import { useKidsProgress } from '@/kids/progress';
import { useSpeaker } from '@/kids/speak';
import { type KidsKey, useKidsText } from '@/kids/strings';
import { kidsColors, kidsFonts, kidsRadius, tileColors } from '@/kids/theme';
import { PillButton } from '@/kids/ui';

// 3 rodadas de 5 perguntas, da mais fácil para a mais difícil (a certa é sempre a "_a")
const ROUNDS = [
  [1, 2, 3, 4, 5],
  [6, 7, 8, 9, 10],
  [11, 12, 13, 14, 15],
];
const HELPS = 2;

type Q = { n: number; options: string[] };

function deal(perRound: number): Q[][] {
  return ROUNDS.map((r) => shuffled(r).slice(0, perRound).map((n) => ({ n, options: shuffled(['a', 'b', 'c']) })));
}

/** Show do conhecimento bíblico: rodadas, ajudas e, se quiser, 2 equipes no mesmo aparelho (sem ranking). */
export default function Show() {
  const { t, language } = useKidsText();
  const { level } = useKidsProgress();
  const { speak } = useSpeaker(language);
  const perRound = level === 'big' ? 5 : 3;
  const [mode, setMode] = useState<'solo' | 'teams' | null>(null);
  const [rounds, setRounds] = useState(() => deal(perRound));
  const [round, setRound] = useState(0);
  const [index, setIndex] = useState(0);
  const [tried, setTried] = useState<string[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [solved, setSolved] = useState(false);
  const [helps, setHelps] = useState(HELPS);
  const [firstTry, setFirstTry] = useState(0);
  const [scores, setScores] = useState([0, 0]);
  const [turn, setTurn] = useState(0);
  const total = rounds.flat().length;
  const done = round >= rounds.length;

  function again() {
    setRounds(deal(perRound));
    setRound(0);
    setIndex(0);
    setTried([]);
    setRemoved([]);
    setSolved(false);
    setHelps(HELPS);
    setFirstTry(0);
    setScores([0, 0]);
    setTurn(0);
    setMode(null);
  }

  if (!mode) {
    return (
      <GameShell game="show">
        <PillButton label={`🙋 ${t('sh_solo')}`} color={kidsColors.pink} onPress={() => setMode('solo')} />
        <PillButton label={`👥 ${t('sh_teams')}`} color={kidsColors.purple} onPress={() => setMode('teams')} />
      </GameShell>
    );
  }

  if (done) {
    return (
      <GameShell game="show">
        {mode === 'teams' ? (
          <View style={[gameStyles.card, { alignItems: 'center' }]}>
            <Text style={styles.scores}>
              {t('sh_team', { n: 1 })}: {t('sh_points', { n: scores[0] })}
              {'\n'}
              {t('sh_team', { n: 2 })}: {t('sh_points', { n: scores[1] })}
            </Text>
            <Text style={gameStyles.info}>{t('sh_both')}</Text>
          </View>
        ) : null}
        <GameEnd game="show" stars={mode === 'teams' ? 3 : firstTry >= total * 0.8 ? 3 : firstTry >= total * 0.5 ? 2 : 1} onAgain={again} />
      </GameShell>
    );
  }

  const q = rounds[round][index];
  const key = `sq_${q.n}`;

  function pick(o: string) {
    if (solved || tried.includes(o) || removed.includes(o)) return;
    if (o === 'a') {
      setSolved(true);
      if (!tried.length) setFirstTry((n) => n + 1);
      if (mode === 'teams') setScores((s) => s.map((v, i) => (i === turn ? v + (tried.length ? 5 : 10) : v)));
      speak(t('right'));
    } else {
      setTried((l) => [...l, o]);
    }
  }

  function help() {
    if (helps <= 0 || solved) return;
    const wrong = q.options.filter((o) => o !== 'a' && !tried.includes(o) && !removed.includes(o));
    if (!wrong.length) return;
    setRemoved((r) => [...r, wrong[0]]);
    setHelps((h) => h - 1);
  }

  function next() {
    setTried([]);
    setRemoved([]);
    setSolved(false);
    if (mode === 'teams') setTurn((tn) => 1 - tn);
    if (index + 1 < rounds[round].length) setIndex((i) => i + 1);
    else {
      setRound((r) => r + 1);
      setIndex(0);
    }
  }

  return (
    <GameShell game="show" status={`${t('sh_round', { n: round + 1 })} · ${index + 1}/${rounds[round].length}`}>
      {mode === 'teams' ? (
        <View style={styles.teams}>
          {[0, 1].map((i) => (
            <View key={i} style={[styles.team, turn === i && styles.teamOn]}>
              <Text style={styles.teamName}>{t('sh_team', { n: i + 1 })}</Text>
              <Text style={styles.teamScore}>{scores[i]}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {mode === 'teams' ? <Text style={gameStyles.info}>{t('sh_turn', { n: turn + 1 })}</Text> : null}
      <View style={gameStyles.card}>
        <Text style={gameStyles.big} onPress={() => speak(t(key as KidsKey))}>
          🎤 {t(key as KidsKey)}
        </Text>
      </View>
      {q.options
        .filter((o) => !removed.includes(o))
        .map((o, i) => (
          <AnswerButton
            key={o}
            label={t(`${key}_${o}` as KidsKey)}
            color={tileColors[i % tileColors.length]}
            state={solved && o === 'a' ? 'right' : tried.includes(o) ? 'wrong' : undefined}
            onPress={() => pick(o)}
          />
        ))}
      {!solved ? <PillButton label={t('sh_help', { n: helps })} color={kidsColors.blue} active={false} disabled={helps <= 0} onPress={help} textSize={16} /> : null}
      {solved ? <PillButton label={t('nextQuestion')} color={kidsColors.green} onPress={next} /> : null}
    </GameShell>
  );
}

const styles = StyleSheet.create({
  scores: { fontFamily: kidsFonts.bold, fontSize: 22, lineHeight: 32, color: kidsColors.text, textAlign: 'center' },
  teams: { flexDirection: 'row', gap: 10 },
  team: { flex: 1, backgroundColor: kidsColors.card, borderRadius: kidsRadius.md, borderWidth: 3, borderColor: kidsColors.border, padding: 10, alignItems: 'center' },
  teamOn: { borderColor: kidsColors.purple, borderWidth: 4 },
  teamName: { fontFamily: kidsFonts.bold, fontSize: 16, color: kidsColors.text },
  teamScore: { fontFamily: kidsFonts.bold, fontSize: 28, color: kidsColors.purple },
});

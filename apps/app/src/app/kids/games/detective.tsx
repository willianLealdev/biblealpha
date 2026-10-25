import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AnswerButton, GameEnd, GameShell, gameStyles, shuffled } from '@/kids/game-ui';
import { useKidsProgress } from '@/kids/progress';
import { useSpeaker } from '@/kids/speak';
import { type KidsKey, useKidsText } from '@/kids/strings';
import { kidsColors, kidsFonts, kidsRadius, tileColors } from '@/kids/theme';
import { PillButton } from '@/kids/ui';

// Casos com testemunhas. As falas são textos prontos e revisados, cada uma com a passagem
// (a criança não conversa com IA)
const CASES = [
  { n: 1, emojis: ['🛡️', '👑', '🧔'] },
  { n: 2, emojis: ['⛵', '🏘️', '👑'] },
  { n: 3, emojis: ['🛡️', '👩', '🧔'] },
  { n: 4, emojis: ['👩', '🧔', '📜'] },
];
const k = (c: number, rest: string) => `det_c${c}_${rest}` as KidsKey;

/** Detetive da Bíblia: conversar com testemunhas, juntar pistas e resolver o caso. */
export default function Detective() {
  const { t, language } = useKidsText();
  const { level } = useKidsProgress();
  const { speak } = useSpeaker(language);
  const count = level === 'big' ? 4 : 2;
  const deal = () => shuffled(CASES).slice(0, count).map((c) => ({ ...c, options: shuffled(['a', 'b', 'c']) }));
  const [cases, setCases] = useState(deal);
  const [index, setIndex] = useState(0);
  const [heard, setHeard] = useState<number[]>([]);
  const [solving, setSolving] = useState(false);
  const [tried, setTried] = useState<string[]>([]);
  const [solved, setSolved] = useState(false);
  const [mistakes, setMistakes] = useState(0);
  const [warn, setWarn] = useState(false);

  function again() {
    setCases(deal());
    setIndex(0);
    setHeard([]);
    setSolving(false);
    setTried([]);
    setSolved(false);
    setMistakes(0);
  }

  if (index >= cases.length) {
    return (
      <GameShell game="detective">
        <GameEnd game="detective" stars={mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1} onAgain={again} />
      </GameShell>
    );
  }

  const c = cases[index];

  function listen(w: number) {
    setHeard((h) => (h.includes(w) ? h : [...h, w]));
    setWarn(false);
    speak(`${t(k(c.n, `w${w}`))}: ${t(k(c.n, `s${w}`))}`);
  }

  function pick(o: string) {
    if (solved || tried.includes(o)) return;
    if (o === 'a') {
      setSolved(true);
      speak(t('det_solved'));
    } else {
      setTried((list) => [...list, o]);
      setMistakes((m) => m + 1);
    }
  }

  function next() {
    setIndex((i) => i + 1);
    setHeard([]);
    setSolving(false);
    setTried([]);
    setSolved(false);
  }

  return (
    <GameShell game="detective" status={t('det_case', { n: index + 1, total: cases.length })}>
      <Text style={styles.caseTitle}>🕵️ {t(k(c.n, 'title'))}</Text>
      <View style={gameStyles.card}>
        <Text style={gameStyles.big}>{t(k(c.n, 'q'))}</Text>
      </View>
      {!solving ? (
        <>
          <Text style={styles.hint}>{t('det_talk')}</Text>
          <View style={styles.witnesses}>
            {[1, 2, 3].map((w, i) => (
              <Pressable
                key={w}
                accessibilityRole="button"
                accessibilityLabel={t(k(c.n, `w${w}`))}
                onPress={() => listen(w)}
                style={[styles.witness, { borderColor: tileColors[i] }, heard.includes(w) && { backgroundColor: '#F3ECFF' }]}>
                <Text style={styles.witnessEmoji}>{c.emojis[i]}</Text>
                <Text style={styles.witnessName}>{t(k(c.n, `w${w}`))}</Text>
                {heard.includes(w) ? <Text style={styles.check}>✓</Text> : null}
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
      {heard.length ? (
        <View style={styles.notebook}>
          <Text style={styles.notebookTitle}>{t('det_notebook')}</Text>
          {heard.map((w) => (
            <Text key={w} style={styles.clue}>
              • <Text style={{ fontFamily: kidsFonts.bold }}>{t(k(c.n, `w${w}`))}:</Text> “{t(k(c.n, `s${w}`))}”{' '}
              <Text style={styles.ref}>({t(k(c.n, `r${w}`))})</Text>
            </Text>
          ))}
        </View>
      ) : null}
      {!solving ? (
        <>
          {warn ? <Text style={gameStyles.info}>{t('det_need')}</Text> : null}
          <PillButton
            label={`🔍 ${t('det_solve')}`}
            color={kidsColors.purple}
            onPress={() => (heard.length === 3 ? setSolving(true) : setWarn(true))}
          />
        </>
      ) : (
        <>
          {c.options.map((o, i) => (
            <AnswerButton
              key={o}
              label={t(k(c.n, o))}
              color={tileColors[i % tileColors.length]}
              state={solved && o === 'a' ? 'right' : tried.includes(o) ? 'wrong' : undefined}
              onPress={() => pick(o)}
            />
          ))}
          {tried.length && !solved ? <Text style={gameStyles.info}>{t('wrong')}</Text> : null}
          {solved ? (
            <>
              <Text style={gameStyles.info}>{t('det_solved')}</Text>
              <PillButton label={t('nextQuestion')} color={kidsColors.green} onPress={next} />
            </>
          ) : null}
        </>
      )}
    </GameShell>
  );
}

const styles = StyleSheet.create({
  caseTitle: { fontFamily: kidsFonts.bold, fontSize: 22, color: kidsColors.purple, textAlign: 'center' },
  hint: { fontFamily: kidsFonts.bold, fontSize: 17, color: kidsColors.textMuted, textAlign: 'center' },
  witnesses: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  witness: { width: 108, minHeight: 120, borderRadius: kidsRadius.md, borderWidth: 4, backgroundColor: kidsColors.card, alignItems: 'center', justifyContent: 'center', padding: 6, gap: 4 },
  witnessEmoji: { fontSize: 40 },
  witnessName: { fontFamily: kidsFonts.bold, fontSize: 14, color: kidsColors.text, textAlign: 'center' },
  check: { position: 'absolute', top: 4, right: 8, fontFamily: kidsFonts.bold, fontSize: 18, color: kidsColors.green },
  notebook: { backgroundColor: '#FFFBEA', borderRadius: kidsRadius.md, borderWidth: 2, borderColor: kidsColors.yellow, padding: 14, gap: 6 },
  notebookTitle: { fontFamily: kidsFonts.bold, fontSize: 18, color: kidsColors.text },
  clue: { fontFamily: kidsFonts.regular, fontSize: 16, lineHeight: 23, color: kidsColors.text },
  ref: { color: kidsColors.textMuted, fontSize: 14 },
});

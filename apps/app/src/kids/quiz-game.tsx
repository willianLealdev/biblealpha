// Quiz de uma história: resposta errada não pune (explica com carinho e deixa tentar de novo).

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { QuizQuestion } from './api';
import { Celebrate } from './celebrate';
import { useKidsProgress } from './progress';
import { useSpeaker } from './speak';
import { useKidsText } from './strings';
import { kidsColors, kidsFonts, kidsRadius, tileColors } from './theme';
import { PillButton } from './ui';

export function QuizGame({ questions, onExit }: { questions: QuizQuestion[]; onExit: () => void }) {
  const { t, language } = useKidsText();
  const { addStars } = useKidsProgress();
  const { speak, stop } = useSpeaker(language);
  const [index, setIndex] = useState(0);
  const [tried, setTried] = useState<number[]>([]);
  const [solved, setSolved] = useState(false);
  const [score, setScore] = useState(0);
  const done = index >= questions.length;

  const q = questions[index];

  function pick(i: number) {
    if (solved || tried.includes(i)) return;
    if (i === q.answer) {
      setSolved(true);
      // Estrela só para quem acertou de primeira
      if (!tried.length) setScore((s) => s + 1);
      speak(`${t('right')} ${q.explanation}`);
    } else {
      setTried((list) => [...list, i]);
      speak(t('wrong'));
    }
  }

  function next() {
    stop();
    const last = index + 1 >= questions.length;
    if (last) addStars(score);
    setIndex((n) => n + 1);
    setTried([]);
    setSolved(false);
  }

  function restart() {
    setIndex(0);
    setTried([]);
    setSolved(false);
    setScore(0);
  }

  if (done) {
    return (
      <View style={{ gap: 14 }}>
        <Celebrate title={t('quizDone', { n: score, total: questions.length })} subtitle={'⭐'.repeat(score)} />
        <View style={styles.row}>
          <PillButton label={t('playAgain')} color={kidsColors.blue} onPress={restart} style={{ flex: 1 }} />
          <PillButton label={t('back')} color={kidsColors.orange} onPress={onExit} style={{ flex: 1 }} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: 14 }}>
      <Text style={styles.counter}>{t('questionOf', { n: index + 1, total: questions.length })}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={t('listen')} onPress={() => speak([q.question, ...q.options].join('. '))} style={styles.question}>
        <Text style={styles.questionText}>{q.question}</Text>
        <Text style={styles.listen}>{t('listen')}</Text>
      </Pressable>
      {q.options.map((option, i) => {
        const wrong = tried.includes(i);
        const right = solved && i === q.answer;
        return (
          <Pressable
            key={i}
            accessibilityRole="button"
            accessibilityLabel={option}
            accessibilityState={{ disabled: wrong || solved }}
            onPress={() => pick(i)}
            style={({ pressed }) => [
              styles.option,
              {
                backgroundColor: right ? kidsColors.green : wrong ? kidsColors.border : tileColors[i % tileColors.length],
                opacity: pressed ? 0.85 : wrong ? 0.6 : 1,
              },
            ]}>
            <Text style={[styles.optionText, wrong && { color: kidsColors.textMuted }]}>
              {right ? '✅ ' : wrong ? '✖️ ' : ''}
              {option}
            </Text>
          </Pressable>
        );
      })}
      {tried.length && !solved ? <Text style={styles.feedback}>{t('wrong')}</Text> : null}
      {solved ? (
        <View style={styles.explain}>
          <Text style={styles.feedback}>{t('right')}</Text>
          {q.explanation ? <Text style={styles.explainText}>{q.explanation}</Text> : null}
          <PillButton label={t('nextQuestion')} color={kidsColors.green} onPress={next} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  counter: { fontFamily: kidsFonts.bold, fontSize: 16, color: kidsColors.textMuted, textAlign: 'center' },
  question: {
    backgroundColor: kidsColors.card,
    borderRadius: kidsRadius.lg,
    borderWidth: 3,
    borderColor: kidsColors.border,
    padding: 20,
    gap: 8,
  },
  questionText: { fontFamily: kidsFonts.bold, fontSize: 24, lineHeight: 32, color: kidsColors.text, textAlign: 'center' },
  listen: { fontFamily: kidsFonts.regular, fontSize: 15, color: kidsColors.blue, textAlign: 'center' },
  option: { minHeight: 68, borderRadius: kidsRadius.md, paddingHorizontal: 18, paddingVertical: 12, justifyContent: 'center' },
  optionText: { fontFamily: kidsFonts.bold, fontSize: 21, color: kidsColors.onColor, textAlign: 'center' },
  feedback: { fontFamily: kidsFonts.bold, fontSize: 22, color: kidsColors.purple, textAlign: 'center' },
  explain: { backgroundColor: kidsColors.card, borderRadius: kidsRadius.lg, padding: 18, gap: 12 },
  explainText: { fontFamily: kidsFonts.regular, fontSize: 19, lineHeight: 27, color: kidsColors.text, textAlign: 'center' },
});

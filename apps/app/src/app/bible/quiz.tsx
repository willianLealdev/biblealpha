import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text as RNText, View } from 'react-native';

import { formatKeyRange, tryParseReferences, verseKey } from '@/bible/reference';
import { Button, Card, Notice, Screen, Text, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import { useTheme } from '@/theme';
import { fonts, radius } from '@/theme/tokens';

type Question = { question: string; options: string[]; answer: number; explanation: string };
type Quiz = { reference: string; translation: string; questions: Question[] };

/** Professor com IA: perguntas de compreensão sobre uma passagem, com a resposta explicada. */
export default function QuizScreen() {
  const params = useLocalSearchParams<{ start?: string; end?: string; t?: string }>();
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const [passage, setPassage] = useState(params.start ? formatKeyRange(Number(params.start), Number(params.end ?? params.start), locale) : '');
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setError(null);
    const refs = tryParseReferences(passage, locale);
    const ref = refs?.[0];
    if (!ref) {
      setError(t('study.invalidPassage'));
      return;
    }
    const s = verseKey(ref.book, ref.chapter, ref.verseStart ?? 1);
    const e = verseKey(ref.book, ref.chapterEnd, ref.verseEnd ?? (ref.verseStart ? ref.verseStart : 199));
    setLoading(true);
    try {
      const q = await api<Quiz>('/ai/quiz', { method: 'POST', body: { translation: params.t ?? 'blivre', verse_key_start: s, verse_key_end: e } });
      setQuiz(q);
      setIndex(0);
      setChosen(null);
      setScore(0);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'generic';
      const msg = t(`study.errors.${code}` as any);
      setError(msg === `study.errors.${code}` ? t('study.errors.generic') : msg);
    } finally {
      setLoading(false);
    }
  }

  function choose(i: number) {
    if (chosen !== null || !quiz) return;
    setChosen(i);
    if (i === quiz.questions[index].answer) setScore((s) => s + 1);
  }

  const finished = quiz && index >= quiz.questions.length;
  const q = quiz && !finished ? quiz.questions[index] : null;

  return (
    <Screen>
      <View style={{ alignItems: 'center', gap: 6 }}>
        <Ionicons name="school-outline" size={40} color={colors.gold} />
        <Text variant="title" style={{ textAlign: 'center' }}>
          {t('quiz.title')}
        </Text>
        <Text variant="muted" style={{ textAlign: 'center' }}>
          {t('quiz.subtitle')}
        </Text>
      </View>

      {!quiz ? (
        <Card>
          <TextField label={t('study.passage')} placeholder={t('quiz.passagePlaceholder')} value={passage} onChangeText={setPassage} />
          {error ? <Notice kind="error">{error}</Notice> : null}
          {loading ? (
            <View style={{ alignItems: 'center', gap: 6 }}>
              <ActivityIndicator color={colors.gold} />
              <Text variant="small">{t('quiz.preparing')}</Text>
            </View>
          ) : (
            <Button icon="play" title={t('quiz.start')} onPress={start} disabled={!passage.trim()} />
          )}
        </Card>
      ) : finished ? (
        <Card>
          <Text variant="heading" style={{ textAlign: 'center' }}>
            {t('quiz.result', { score, total: quiz.questions.length })}
          </Text>
          <Text variant="muted" style={{ textAlign: 'center' }}>
            {score === quiz.questions.length ? t('quiz.perfect') : t('quiz.keepGoing')}
          </Text>
          <Button icon="refresh" title={t('quiz.again')} onPress={() => setQuiz(null)} />
        </Card>
      ) : q ? (
        <Card>
          <Text variant="small">
            {quiz.reference} ({quiz.translation}) · {t('quiz.progress', { n: index + 1, total: quiz.questions.length })}
          </Text>
          <RNText style={{ color: colors.text, fontFamily: fonts.bodyBold, fontSize: 18, lineHeight: 26 }}>{q.question}</RNText>
          {q.options.map((opt, i) => {
            const right = chosen !== null && i === q.answer;
            const wrong = chosen === i && i !== q.answer;
            return (
              <Pressable
                key={i}
                accessibilityRole="button"
                disabled={chosen !== null}
                onPress={() => choose(i)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  padding: 12,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: right ? colors.success : wrong ? colors.danger : colors.border,
                  backgroundColor: right || wrong ? colors.surfaceAlt : 'transparent',
                }}>
                <Ionicons
                  name={right ? 'checkmark-circle' : wrong ? 'close-circle' : 'ellipse-outline'}
                  size={20}
                  color={right ? colors.success : wrong ? colors.danger : colors.textMuted}
                />
                <RNText style={{ flex: 1, color: colors.text, fontFamily: fonts.body, fontSize: 15 }}>{opt}</RNText>
              </Pressable>
            );
          })}
          {chosen !== null ? (
            <>
              <Notice kind={chosen === q.answer ? 'success' : 'info'}>{`${chosen === q.answer ? t('quiz.right') : t('quiz.wrong')} ${q.explanation}`}</Notice>
              <Button
                icon="arrow-forward"
                title={index + 1 < quiz.questions.length ? t('quiz.next') : t('quiz.seeResult')}
                onPress={() => {
                  setIndex((i) => i + 1);
                  setChosen(null);
                }}
              />
            </>
          ) : null}
        </Card>
      ) : null}
      <Text variant="small" style={{ textAlign: 'center' }}>
        {t('study.disclaimer')}
      </Text>
    </Screen>
  );
}

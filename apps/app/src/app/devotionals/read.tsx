import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, ScrollView, Text as RNText, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReadAloud } from '@/bible/read-aloud';
import { Button, Notice } from '@/components/ui';
import { useI18n } from '@/i18n';
import { devotionalApi, type Enrollment, type Reading } from '@/lib/devotional';
import { readerTranslation, readingText, type ReadingText } from '@/lib/journey';
import { useTheme } from '@/theme';
import { fonts, radius } from '@/theme/tokens';

const GREEN = '#3fbf3f';

/** Leitura guiada de um dia do plano: uma leitura por vez, "próxima", "concluir dia" e a comemoração. */
export default function PlanReading() {
  const { id, day: dayParam, code } = useLocalSearchParams<{ id: string; day: string; code: string }>();
  const day = Number(dayParam) || 1;
  const { t, locale, errorMessage } = useI18n();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const aloud = useReadAloud();
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [readings, setReadings] = useState<Reading[] | null>(null);
  const [step, setStep] = useState(0);
  const [text, setText] = useState<ReadingText | null>(null);
  const [language, setLanguage] = useState(locale);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [celebrate, setCelebrate] = useState<Enrollment | null>(null);
  const scroller = useRef<ScrollViewInstance>(null);

  useEffect(() => {
    Promise.all([devotionalApi.enrollments(), devotionalApi.plan(code)])
      .then(([mine, plan]) => {
        setEnrollment(mine.enrollments.find((e) => e.id === id) ?? null);
        setReadings(plan.schedule.find((d) => d.day === day)?.readings ?? []);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [id, code, day, errorMessage]);

  // Texto da leitura atual, na tradução que a pessoa usa na Bíblia
  const reading = readings?.[step];
  useEffect(() => {
    if (!reading) return;
    let alive = true;
    readerTranslation(locale)
      .then(async ({ code: tr, language: lang }) => {
        const out = await readingText(tr, reading);
        if (!alive) return;
        setLanguage(lang);
        setText(out);
        scroller.current?.scrollTo({ y: 0, animated: false });
      })
      .catch((e) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [reading, locale, errorMessage]);

  const { stop } = aloud;
  useEffect(() => stop, [step, stop]);

  if (error) return <View style={{ flex: 1, backgroundColor: colors.bg, padding: 16 }}><Notice kind="error">{error}</Notice></View>;
  if (!readings || !enrollment) return <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}><ActivityIndicator color={colors.gold} /></View>;

  const total = readings.length;
  const last = step >= total - 1;
  const alreadyDone = enrollment.done_days.includes(day);

  function next() {
    setText(null);
    setStep((s) => s + 1);
  }

  async function finish() {
    setSaving(true);
    try {
      const updated = await devotionalApi.markDay(enrollment!.id, day, true);
      if (updated.status === 'done') router.replace({ pathname: '/devotionals/done', params: { code } });
      else setCelebrate(updated);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const planDays = enrollment.plan.days;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: t('devotional.day', { n: day }) }} />
      {/* Progresso do dia: um traço por leitura */}
      <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingTop: 12 }}>
        {readings.map((_, i) => (
          <View key={i} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i < step ? GREEN : i === step ? colors.gold : colors.surfaceAlt }} />
        ))}
      </View>
      <ScrollView ref={scroller} contentContainerStyle={{ padding: 16, paddingBottom: 140, gap: 14, width: '100%', maxWidth: 720, alignSelf: 'center' }}>
        <View style={{ gap: 2 }}>
          <RNText style={{ color: colors.gold, fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1.5 }}>
            {enrollment.plan.title.toUpperCase()} · {t('devotional.dayOf', { day, total: planDays })}
          </RNText>
          <RNText style={{ color: colors.text, fontFamily: 'CormorantGaramond_700Bold', fontSize: 32, fontVariant: ['lining-nums'] }}>{reading?.label}</RNText>
          {total > 1 ? <RNText style={{ color: colors.textMuted, fontFamily: fonts.body }}>{t('journey.readingOf', { n: step + 1, total })}</RNText> : null}
        </View>

        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Chip
            icon={aloud.playing ? 'stop-circle-outline' : 'headset-outline'}
            label={aloud.playing ? t('bible.stopListening') : t('bible.listen')}
            onPress={() => (aloud.playing ? aloud.stop() : text && aloud.play(text.flatMap((c) => c.verses), language))}
          />
          {reading ? (
            <Chip
              icon="book-outline"
              label={t('journey.openInBible')}
              onPress={() => router.navigate({ pathname: '/', params: { book: reading.book, chapter: String(reading.chapter), ...(reading.verse_start ? { verse: String(reading.verse_start) } : {}) } })}
            />
          ) : null}
        </View>

        {!text ? (
          <ActivityIndicator color={colors.gold} style={{ marginTop: 30 }} />
        ) : (
          text.map((c) => (
            <View key={c.chapter} style={{ gap: 6 }}>
              {text.length > 1 || !reading?.verse_start ? (
                <RNText style={{ color: colors.gold, fontFamily: fonts.bodyBold, fontSize: 14 }}>{t('journey.chapter', { n: c.chapter })}</RNText>
              ) : null}
              <RNText style={{ color: colors.text, fontFamily: 'Literata_400Regular', fontSize: 19, lineHeight: 32 }}>
                {c.verses.map((v) => (
                  <RNText key={v.verse}>
                    <RNText style={{ color: colors.gold, fontSize: 12, fontFamily: fonts.bodyBold }}>{v.verse} </RNText>
                    {v.text}{' '}
                  </RNText>
                ))}
              </RNText>
            </View>
          ))
        )}
      </ScrollView>

      {/* Botão fixo embaixo: próxima leitura ou concluir o dia */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: 16,
          paddingBottom: insets.bottom + 16,
          backgroundColor: colors.bg,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}>
        <View style={{ width: '100%', maxWidth: 720, alignSelf: 'center' }}>
          {!last ? (
            <Button icon="arrow-forward" title={t('journey.nextReading', { n: step + 2, total })} onPress={next} />
          ) : alreadyDone ? (
            <Button kind="secondary" icon="checkmark-done" title={t('journey.alreadyDone')} onPress={() => router.back()} />
          ) : (
            <Button icon="checkmark-circle" title={t('journey.finishDay', { n: day })} loading={saving} onPress={finish} />
          )}
        </View>
      </View>

      {celebrate ? (
        <Celebration
          enrollment={celebrate}
          day={day}
          onNext={() => celebrate.next_unread && router.replace({ pathname: '/devotionals/read', params: { id, code, day: String(celebrate.next_unread) } })}
          onBack={() => router.back()}
        />
      ) : null}
    </View>
  );
}

function Chip({ icon, label, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: pressed ? colors.surfaceAlt : 'transparent',
      })}>
      <Ionicons name={icon} size={16} color={colors.gold} />
      <RNText style={{ color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 13 }}>{label}</RNText>
    </Pressable>
  );
}

/** "Dia concluído!": aparece por cima, com o progresso do plano e o próximo passo. */
function Celebration({ enrollment, day, onNext, onBack }: { enrollment: Enrollment; day: number; onNext: () => void; onBack: () => void }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const [scale] = useState(() => new Animated.Value(0.6));
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }).start();
  }, [scale]);
  const done = enrollment.done_days.length;
  const total = enrollment.plan.days;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <View style={{ width: '100%', maxWidth: 420, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 24, gap: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}>
        <Animated.View style={{ transform: [{ scale }], width: 92, height: 92, borderRadius: 46, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="checkmark" size={58} color="#fff" />
        </Animated.View>
        <RNText style={{ color: colors.text, fontFamily: fonts.bodyBold, fontSize: 22, textAlign: 'center' }}>{t('journey.dayDone', { n: day })}</RNText>
        <RNText style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 15, textAlign: 'center' }}>
          {t('journey.doneOf', { done, total })} · {Math.round(enrollment.progress)}%
        </RNText>
        <View style={{ width: '100%', height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt }}>
          <View style={{ width: `${Math.round(enrollment.progress)}%`, height: 8, borderRadius: 4, backgroundColor: GREEN }} />
        </View>
        <RNText style={{ color: colors.gold, fontFamily: 'Literata_400Regular', fontStyle: 'italic', fontSize: 15, textAlign: 'center' }}>
          {t('journey.encourage')}
        </RNText>
        <View style={{ width: '100%', gap: 8 }}>
          {enrollment.next_unread ? <Button icon="arrow-forward" title={t('journey.nextDay', { n: enrollment.next_unread })} onPress={onNext} /> : null}
          <Button kind="secondary" title={t('journey.backToPlan')} onPress={onBack} />
        </View>
      </View>
    </View>
  );
}

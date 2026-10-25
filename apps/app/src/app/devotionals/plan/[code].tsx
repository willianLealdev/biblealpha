import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Text as RNText, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { LinearGradientBg } from '@/components/gradient-bg';
import { Button, Card, Divider, Notice, Screen, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { posterColors } from '@/learn/catalog';
import { devotionalApi, type Enrollment, type PlanSummary, type Reading } from '@/lib/devotional';
import { coverUrl, learnApi } from '@/lib/learn';
import { useTheme } from '@/theme';
import { fonts, radius } from '@/theme/tokens';

type Plan = PlanSummary & { schedule: { day: number; readings: Reading[] }[] };

const GREEN = '#3fbf3f';

/** Página do plano: capa, progresso, "continuar" e o roteiro dia a dia (cada dia abre a leitura guiada). */
export default function PlanDetail() {
  const { code, enrollment } = useLocalSearchParams<{ code: string; enrollment?: string }>();
  const { t, errorMessage } = useI18n();
  const { colors } = useTheme();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [mine, setMine] = useState<Enrollment | null>(null);
  const [cover, setCover] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Recarrega ao voltar da leitura (o dia concluído aparece marcado)
  useFocusEffect(
    useCallback(() => {
      devotionalApi
        .plan(code)
        .then(setPlan)
        .catch((e) => setError(errorMessage(e)));
      devotionalApi
        .enrollments()
        .then((r) => setMine(r.enrollments.find((e) => (enrollment ? e.id === enrollment : e.plan.code === code && e.status !== 'done')) ?? null))
        .catch(() => {});
      learnApi
        .covers()
        .then((r) => setCover(r.covers[`plan:${code}`] ?? null))
        .catch(() => {});
    }, [code, enrollment, errorMessage]),
  );

  if (!plan) return <Screen center>{error ? <Notice kind="error">{error}</Notice> : <ActivityIndicator color={colors.gold} />}</Screen>;

  const openDay = (id: string, day: number) => router.push({ pathname: '/devotionals/read', params: { id, day: String(day), code } });

  async function start() {
    setBusy(true);
    try {
      const e = await devotionalApi.enroll(code);
      setMine(e);
      openDay(e.id, 1);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function reschedule() {
    if (!mine) return;
    setMine(await devotionalApi.action(mine.id, 'reschedule'));
  }

  const pct = mine ? Math.round(mine.progress) : 0;
  const nextDay = mine?.next_unread ?? null;
  const doneCount = mine?.done_days.length ?? 0;

  return (
    <Screen>
      <Stack.Screen options={{ title: plan.title }} />
      {/* Capa */}
      <View style={{ height: 220, borderRadius: radius.lg, overflow: 'hidden', justifyContent: 'flex-end' }}>
        {cover ? (
          <Image source={{ uri: coverUrl(cover) }} style={{ position: 'absolute', width: '100%', height: '100%' }} contentFit="cover" />
        ) : (
          <LinearGradientBg colors={posterColors(code)} />
        )}
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0, backgroundColor: 'rgba(0,0,0,0.35)' }} />
        <View style={{ padding: 16, gap: 4 }}>
          <RNText style={{ color: colors.gold, fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1.5 }}>
            {t(`devotional.planCat.${plan.category}` as never).toUpperCase()} · {t('learn.days', { n: plan.days })}
          </RNText>
          <RNText style={{ color: '#fff', fontFamily: 'CormorantGaramond_700Bold', fontSize: 32, lineHeight: 34 }}>{plan.title}</RNText>
          <RNText style={{ color: '#eee', fontFamily: fonts.body, fontSize: 14 }}>{plan.description}</RNText>
        </View>
      </View>

      {error ? <Notice kind="error">{error}</Notice> : null}

      {!mine ? (
        <Card style={{ gap: 10 }}>
          <Text variant="body">{t('journey.howItWorks', { n: plan.days })}</Text>
          <Button icon="play" title={t('devotional.startPlan')} loading={busy} onPress={start} />
        </Card>
      ) : (
        <Card style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Ring pct={pct} />
            <View style={{ flex: 1, gap: 2 }}>
              <RNText style={{ color: colors.text, fontFamily: fonts.bodyBold, fontSize: 17 }}>
                {t('journey.doneOf', { done: doneCount, total: plan.days })}
              </RNText>
              <Text variant="small">
                {mine.status === 'done'
                  ? t('journey.finished')
                  : mine.behind > 0
                    ? t('learn.behind', { n: mine.behind })
                    : t('learn.upToDate')}
              </Text>
            </View>
          </View>
          {nextDay && mine.status !== 'done' ? (
            <Button icon="book" title={t('journey.continueDay', { n: nextDay })} onPress={() => openDay(mine.id, nextDay)} />
          ) : null}
          {mine.behind > 1 ? <Button kind="secondary" icon="calendar-outline" title={t('journey.reschedule')} onPress={reschedule} /> : null}
          {mine.status === 'done' ? (
            <Button kind="secondary" icon="trophy-outline" title={t('journey.seeAchievement')} onPress={() => router.push({ pathname: '/devotionals/done', params: { code } })} />
          ) : null}
        </Card>
      )}

      <Text variant="heading">{t('journey.schedule')}</Text>
      <Card style={{ paddingVertical: 4 }}>
        {plan.schedule.map((d, i) => {
          const done = mine?.done_days.includes(d.day) ?? false;
          const isNext = mine ? d.day === nextDay : d.day === 1;
          return (
            <View key={d.day}>
              {i > 0 ? <Divider /> : null}
              <Pressable
                accessibilityRole="button"
                disabled={!mine}
                onPress={() => mine && openDay(mine.id, d.day)}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, opacity: pressed ? 0.7 : 1 })}>
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: done ? GREEN : isNext && mine ? colors.gold : colors.surfaceAlt,
                  }}>
                  {done ? (
                    <Ionicons name="checkmark" size={20} color="#fff" />
                  ) : isNext && mine ? (
                    <Ionicons name="play" size={16} color={colors.onGold} />
                  ) : (
                    <RNText style={{ color: colors.textMuted, fontFamily: fonts.bodyBold, fontSize: 12 }}>{d.day}</RNText>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <RNText style={{ color: isNext && mine ? colors.gold : colors.textMuted, fontFamily: fonts.bodyBold, fontSize: 12 }}>
                    {t('devotional.day', { n: d.day })}
                  </RNText>
                  <RNText style={{ color: done ? colors.textMuted : colors.text, fontFamily: fonts.body, fontSize: 15 }}>
                    {d.readings.map((r) => r.label).join(' · ')}
                  </RNText>
                </View>
                {mine ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
              </Pressable>
            </View>
          );
        })}
      </Card>

      {mine ? (
        confirmLeave ? (
          <Card style={{ gap: 8 }}>
            <Text variant="body">{t('journey.leaveConfirm')}</Text>
            <Button
              kind="danger"
              title={t('devotional.leavePlan')}
              onPress={async () => {
                await devotionalApi.leave(mine.id);
                setMine(null);
                setConfirmLeave(false);
              }}
            />
            <Button kind="ghost" title={t('adminUsers.cancel')} onPress={() => setConfirmLeave(false)} />
          </Card>
        ) : (
          <Button kind="ghost" title={t('devotional.leavePlan')} onPress={() => setConfirmLeave(true)} />
        )
      ) : null}
    </Screen>
  );
}

function Ring({ pct }: { pct: number }) {
  const { colors } = useTheme();
  const R = 28;
  const C = 2 * Math.PI * R;
  return (
    <View style={{ width: 68, height: 68, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={68} height={68} style={{ position: 'absolute' }}>
        <Circle cx={34} cy={34} r={R} stroke={colors.border} strokeWidth={6} fill="none" />
        <Circle
          cx={34}
          cy={34}
          r={R}
          stroke={pct >= 100 ? GREEN : colors.gold}
          strokeWidth={6}
          fill="none"
          strokeDasharray={`${(C * pct) / 100} ${C}`}
          strokeLinecap="round"
          transform="rotate(-90 34 34)"
        />
      </Svg>
      <RNText style={{ color: colors.text, fontFamily: fonts.bodyBold, fontSize: 15 }}>{pct}%</RNText>
    </View>
  );
}

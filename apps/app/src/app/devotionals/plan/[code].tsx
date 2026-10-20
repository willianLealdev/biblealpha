import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text as RNText, View } from 'react-native';

import { Button, Card, Divider, Screen, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { devotionalApi, type Enrollment, type PlanSummary, type Reading } from '@/lib/devotional';
import { useTheme } from '@/theme';
import { fonts } from '@/theme/tokens';

export default function PlanDetail() {
  const { code, enrollment } = useLocalSearchParams<{ code: string; enrollment?: string }>();
  const { t } = useI18n();
  const { colors } = useTheme();
  const [plan, setPlan] = useState<(PlanSummary & { schedule: { day: number; readings: Reading[] }[] }) | null>(null);
  const [mine, setMine] = useState<Enrollment | null>(null);

  useEffect(() => {
    devotionalApi.plan(code).then(setPlan).catch(() => {});
    devotionalApi
      .enrollments()
      .then((r) => setMine(r.enrollments.find((e) => (enrollment ? e.id === enrollment : e.plan.code === code && e.status !== 'done')) ?? null))
      .catch(() => {});
  }, [code, enrollment]);

  if (!plan) return <Screen center><ActivityIndicator color={colors.gold} /></Screen>;

  async function toggle(day: number) {
    if (!mine) return;
    setMine(await devotionalApi.markDay(mine.id, day, !mine.done_days.includes(day)));
  }

  return (
    <Screen>
      <Text variant="title">{plan.title}</Text>
      <Text variant="muted">{plan.description}</Text>
      {mine ? (
        <Text variant="small">
          {t('devotional.dayOf', { day: mine.current_day, total: plan.days })} · {mine.progress}%
        </Text>
      ) : (
        <Button
          icon="play"
          title={t('devotional.startPlan')}
          onPress={async () => {
            await devotionalApi.enroll(code);
            router.navigate('/devotional');
          }}
        />
      )}
      <Card style={{ paddingVertical: 4 }}>
        {plan.schedule.map((d, i) => {
          const done = mine?.done_days.includes(d.day);
          const isToday = mine?.current_day === d.day;
          return (
            <View key={d.day}>
              {i > 0 ? <Divider /> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 }}>
                {mine ? (
                  <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: !!done }} onPress={() => toggle(d.day)} hitSlop={8}>
                    <Ionicons name={done ? 'checkbox' : 'square-outline'} size={22} color={colors.gold} />
                  </Pressable>
                ) : null}
                <RNText style={{ color: isToday ? colors.gold : colors.textMuted, fontFamily: fonts.bodyBold, width: 64 }}>
                  {t('devotional.day', { n: d.day })}
                </RNText>
                <View style={{ flex: 1, gap: 2 }}>
                  {d.readings.map((r) => (
                    <RNText
                      key={r.ref}
                      accessibilityRole="link"
                      onPress={() =>
                        router.navigate({
                          pathname: '/',
                          params: { book: r.book, chapter: String(r.chapter), ...(r.verse_start ? { verse: String(r.verse_start) } : {}) },
                        })
                      }
                      style={{ color: colors.text, fontFamily: fonts.body, fontSize: 15 }}>
                      {r.label}
                    </RNText>
                  ))}
                </View>
              </View>
            </View>
          );
        })}
      </Card>
      {mine ? (
        <Button
          kind="ghost"
          title={t('devotional.leavePlan')}
          onPress={async () => {
            await devotionalApi.leave(mine.id);
            router.navigate('/devotional');
          }}
        />
      ) : null}
    </Screen>
  );
}

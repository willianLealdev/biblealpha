import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, ScrollView, Text as RNText, useWindowDimensions, View } from 'react-native';

import { Poster } from '@/components/poster';
import { Button, Screen } from '@/components/ui';
import { useI18n } from '@/i18n';
import { posterColors } from '@/learn/catalog';
import { devotionalApi, type Enrollment, type PlanSummary } from '@/lib/devotional';
import { suggestPlans } from '@/lib/journey';
import { coverUrl, learnApi } from '@/lib/learn';
import { useTheme } from '@/theme';
import { fonts, radius } from '@/theme/tokens';

const CONFETTI = ['#E9C46A', '#3fbf3f', '#4FC3F7', '#F06292', '#BA68C8', '#FF8A65'];

/** Plano concluído: parabéns, o que a pessoa fez e sugestões do próximo plano. */
export default function PlanDone() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { t } = useI18n();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [mine, setMine] = useState<Enrollment[]>([]);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [scale] = useState(() => new Animated.Value(0.3));
  const [fall] = useState(() => new Animated.Value(0));

  useEffect(() => {
    devotionalApi.enrollments().then((r) => setMine(r.enrollments)).catch(() => {});
    devotionalApi.plans().then((r) => setPlans(r.plans)).catch(() => {});
    learnApi.covers().then((r) => setCovers(r.covers)).catch(() => {});
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 4, tension: 60, useNativeDriver: true }),
      Animated.timing(fall, { toValue: 1, duration: 2200, useNativeDriver: true }),
    ]).start();
  }, [scale, fall]);

  const finished = mine.find((e) => e.plan.code === code);
  const plan = plans.find((p) => p.code === code) ?? finished?.plan;
  const suggestions = suggestPlans(plans, mine.filter((e) => e.status !== 'done' || e.plan.code === code), code);
  const readings = finished ? finished.plan.days : 0;

  return (
    <Screen>
      <Stack.Screen options={{ title: t('journey.congratsTitle') }} />
      <View style={{ alignItems: 'center', gap: 12, paddingTop: 12, overflow: 'hidden' }}>
        {/* Confete simples caindo */}
        {Array.from({ length: 18 }, (_, i) => (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: `${(i * 37) % 100}%`,
              width: 8,
              height: 14,
              borderRadius: 2,
              backgroundColor: CONFETTI[i % CONFETTI.length],
              opacity: fall.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] }),
              transform: [
                { translateY: fall.interpolate({ inputRange: [0, 1], outputRange: [-20, 220 + (i % 5) * 30] }) },
                { rotate: fall.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${(i % 2 ? 1 : -1) * 360}deg`] }) },
              ],
            }}
          />
        ))}
        <Animated.View
          style={{
            transform: [{ scale }],
            width: 120,
            height: 120,
            borderRadius: 60,
            backgroundColor: colors.gold,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 4,
            borderColor: '#fff3cf',
          }}>
          <Ionicons name="trophy" size={64} color={colors.onGold} />
        </Animated.View>
        <RNText style={{ color: colors.text, fontFamily: 'CormorantGaramond_700Bold', fontSize: 34, textAlign: 'center' }}>{t('journey.congratsTitle')}</RNText>
        <RNText style={{ color: colors.text, fontFamily: fonts.body, fontSize: 16, textAlign: 'center' }}>
          {t('journey.congratsBody', { plan: plan?.title ?? '' })}
        </RNText>
        {readings ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Stat value={String(readings)} label={t('journey.statDays')} />
            <Stat value="100%" label={t('journey.statDone')} />
          </View>
        ) : null}
        <RNText style={{ color: colors.gold, fontFamily: 'Literata_400Regular', fontStyle: 'italic', fontSize: 15, textAlign: 'center' }}>
          {t('journey.congratsVerse')}
        </RNText>
      </View>

      {suggestions.length ? (
        <View style={{ gap: 10 }}>
          <RNText style={{ color: colors.text, fontFamily: fonts.bodyBold, fontSize: 19 }}>{t('journey.nextPlans')}</RNText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {suggestions.map((p) => (
              <Poster
                key={p.code}
                title={p.title}
                subtitle={t('learn.days', { n: p.days })}
                image={covers[`plan:${p.code}`] ? coverUrl(covers[`plan:${p.code}`]) : null}
                colors={posterColors(p.code)}
                width={width < 500 ? 128 : 150}
                onPress={() => router.replace({ pathname: '/devotionals/plan/[code]', params: { code: p.code } })}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}
      <Button kind="secondary" icon="film-outline" title={t('journey.allPlans')} onPress={() => router.replace('/bible/learn')} />
    </Screen>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingHorizontal: 18, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
      <RNText style={{ color: colors.gold, fontFamily: fonts.bodyBold, fontSize: 22 }}>{value}</RNText>
      <RNText style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 12 }}>{label}</RNText>
    </View>
  );
}

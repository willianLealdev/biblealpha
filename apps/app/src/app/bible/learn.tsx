import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text as RNText, useWindowDimensions, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { bookName } from '@/bible/reference';
import { Poster } from '@/components/poster';
import { useI18n } from '@/i18n';
import { BOOK_GROUPS, posterColors, TAGLINES, tr } from '@/learn/catalog';
import { devotionalApi, type Enrollment, type PlanSummary, type Stats } from '@/lib/devotional';
import { coverUrl, learnApi } from '@/lib/learn';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme';
import { fonts, radius } from '@/theme/tokens';

const PLAN_CATS = ['topical', 'book', 'testament', 'whole'] as const;

/** Aprender: tudo da Bíblia em fileiras de pôsteres (livros por seção e planos por tema), com o progresso no topo. */
export default function Learn() {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const { user } = useSession();
  const { width } = useWindowDimensions();
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [mine, setMine] = useState<Enrollment[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);

  useFocusEffect(
    useCallback(() => {
      learnApi
        .covers()
        .then((r) => setCovers(r.covers))
        .catch(() => {});
      devotionalApi
        .plans()
        .then((r) => setPlans(r.plans))
        .catch(() => {});
      devotionalApi
        .enrollments()
        .then((r) => setMine(r.enrollments.filter((e) => e.status !== 'done')))
        .catch(() => {});
      devotionalApi
        .stats()
        .then(setStats)
        .catch(() => {});
    }, []),
  );

  const posterW = width < 500 ? 118 : width < 900 ? 140 : 160;
  const cover = (key: string) => (covers[key] ? coverUrl(covers[key]) : null);
  const openPlan = (code: string) => router.push({ pathname: '/devotionals/plan/[code]', params: { code } });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: t('learn.title') }} />
      <ScrollView contentContainerStyle={{ paddingVertical: 16, gap: 22, width: '100%', maxWidth: 1100, alignSelf: 'center' }}>
        <Progress stats={stats} plan={mine.find((e) => e.status === 'active') ?? null} />

        {mine.length ? (
          <Row title={t('learn.continue')}>
            {mine.map((e) => (
              <Poster
                key={e.id}
                title={e.plan.title}
                subtitle={t('devotional.dayOf', { day: e.next_unread ?? e.plan.days, total: e.plan.days })}
                image={cover(`plan:${e.plan.code}`)}
                colors={posterColors(e.plan.code)}
                width={posterW}
                progress={e.progress / 100}
                onPress={() => openPlan(e.plan.code)}
              />
            ))}
          </Row>
        ) : null}

        {PLAN_CATS.map((cat) => {
          const list = plans.filter((p) => p.category === cat);
          if (!list.length) return null;
          return (
            <Row key={cat} title={t(`devotional.planCat.${cat}`)}>
              {list.map((p) => (
                <Poster
                  key={p.code}
                  title={p.title}
                  subtitle={t('learn.days', { n: p.days })}
                  image={cover(`plan:${p.code}`)}
                  colors={posterColors(p.code)}
                  width={posterW}
                  onPress={() => openPlan(p.code)}
                />
              ))}
            </Row>
          );
        })}

        {BOOK_GROUPS.map((g) => (
          <Row key={g.id} title={tr(g.title, locale)}>
            {g.books.map((code) => (
              <Poster
                key={code}
                title={bookName(code, locale)}
                subtitle={TAGLINES[code] ? tr(TAGLINES[code], locale) : undefined}
                image={cover(`book:${code}`)}
                colors={posterColors(code)}
                width={posterW}
                onPress={() => router.navigate({ pathname: '/', params: { book: code, chapter: '1' } })}
              />
            ))}
          </Row>
        ))}

        {user?.roles.includes('admin') ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/admin/covers' as never)}
            style={{ alignSelf: 'center', flexDirection: 'row', gap: 6, alignItems: 'center', padding: 10 }}>
            <Ionicons name="color-palette-outline" size={18} color={colors.gold} />
            <RNText style={{ color: colors.gold, fontFamily: fonts.bodyMedium }}>{t('learn.manageCovers')}</RNText>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <RNText style={{ color: colors.text, fontFamily: fonts.bodyBold, fontSize: 19, paddingHorizontal: 16 }}>{title}</RNText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }}>
        {children}
      </ScrollView>
    </View>
  );
}

/** Topo: incentivo, sequência da semana e o anel do plano em andamento. */
function Progress({ stats, plan }: { stats: Stats | null; plan: Enrollment | null }) {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const streak = stats?.current_streak ?? 0;
  const going = streak > 0 || (plan?.progress ?? 0) > 0;
  // Últimos 7 dias, de hoje para trás
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    // Data local (não UTC): à noite o UTC já é o dia seguinte
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { d, done: !!stats?.calendar.find((c) => c.date === iso)?.done, today: i === 6 };
  });
  const pct = Math.round(plan?.progress ?? 0);
  const R = 30;
  const C = 2 * Math.PI * R;
  return (
    <View
      style={{
        marginHorizontal: 16,
        padding: 16,
        gap: 14,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <RNText style={{ color: colors.text, fontFamily: fonts.bodyBold, fontSize: 20 }}>
            {going ? t('learn.goingWell') : t('learn.startTitle')}
          </RNText>
          <RNText style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13 }}>
            {new Date().toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' })}
          </RNText>
        </View>
        {plan ? (
          <View style={{ width: 72, height: 72, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={72} height={72} style={{ position: 'absolute' }}>
              <Circle cx={36} cy={36} r={R} stroke={colors.border} strokeWidth={6} fill="none" />
              <Circle
                cx={36}
                cy={36}
                r={R}
                stroke={colors.gold}
                strokeWidth={6}
                fill="none"
                strokeDasharray={`${(C * pct) / 100} ${C}`}
                strokeLinecap="round"
                transform="rotate(-90 36 36)"
              />
            </Svg>
            <RNText style={{ color: colors.text, fontFamily: fonts.bodyBold, fontSize: 15 }}>{pct}%</RNText>
          </View>
        ) : null}
      </View>

      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="flame" size={16} color="#ff5a3c" />
          <RNText style={{ color: '#ff7a5c', fontFamily: fonts.bodyBold, fontSize: 13 }}>{t('learn.streak', { n: streak })}</RNText>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {days.map(({ d, done, today }) => (
            <View key={d.toISOString()} style={{ alignItems: 'center', gap: 4 }}>
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: done ? '#3fbf3f' : colors.surfaceAlt,
                  borderWidth: today ? 2 : 0,
                  borderColor: colors.gold,
                }}>
                {done ? (
                  <Ionicons name="checkmark" size={20} color="#fff" />
                ) : (
                  <RNText style={{ color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 12 }}>{d.getDate()}</RNText>
                )}
              </View>
              <RNText style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 11 }}>
                {d.toLocaleDateString(locale, { weekday: 'short' }).replace('.', '')}
              </RNText>
            </View>
          ))}
        </View>
      </View>

      {plan ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/devotionals/plan/[code]', params: { code: plan.plan.code } })}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            padding: 12,
            borderRadius: radius.md,
            borderWidth: 1.5,
            borderColor: plan.behind > 0 ? colors.gold : '#3fbf3f',
            opacity: pressed ? 0.8 : 1,
          })}>
          <Ionicons name={plan.behind > 0 ? 'time-outline' : 'checkmark-circle'} size={22} color={plan.behind > 0 ? colors.gold : '#3fbf3f'} />
          <View style={{ flex: 1 }}>
            <RNText style={{ color: colors.text, fontFamily: fonts.bodyBold, fontSize: 14 }} numberOfLines={1}>
              {plan.plan.title}
            </RNText>
            <RNText style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13 }}>
              {plan.behind > 0 ? t('learn.behind', { n: plan.behind }) : t('learn.upToDate')}
            </RNText>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/devotionals/plans')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: radius.md, backgroundColor: colors.gold }}>
          <Ionicons name="play" size={18} color={colors.onGold} />
          <RNText style={{ color: colors.onGold, fontFamily: fonts.bodyBold, fontSize: 15 }}>{t('learn.choosePlan')}</RNText>
        </Pressable>
      )}
    </View>
  );
}

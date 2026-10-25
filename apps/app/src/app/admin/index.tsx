import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text as RNText, View } from 'react-native';

import { Button, Card, Divider, Notice, Screen, Segmented, Text, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { adminApi, type AdminUserRow, type Overview, type Totals } from '@/lib/admin';
import { useTheme } from '@/theme';
import { fonts, radius } from '@/theme/tokens';

const brl = (v: number | null | undefined, locale: string) =>
  v === null || v === undefined ? '—' : v.toLocaleString(locale, { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
const usd = (v: number, locale: string) =>
  v.toLocaleString(locale, { style: 'currency', currency: 'USD', maximumFractionDigits: v < 1 ? 4 : 2 });

export default function AdminHome() {
  const { t, locale, errorMessage } = useI18n();
  const { colors } = useTheme();
  const [data, setData] = useState<Overview | null>(null);
  const [period, setPeriod] = useState<'today' | 'month' | 'all'>('month');
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<{ id: string; name: string | null; email: string; plan: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .overview()
      .then(setData)
      .catch((e) => setError(errorMessage(e)));
  }, [errorMessage]);

  useEffect(() => {
    adminApi
      .users(period)
      .then((r) => setUsers(r.users))
      .catch(() => {});
  }, [period]);

  if (error) return <Screen><Notice kind="error">{error}</Notice></Screen>;
  if (!data) return <Screen center><ActivityIndicator color={colors.gold} /></Screen>;

  const maxDay = Math.max(0.0001, ...data.daily.map((d) => d.cost_usd));
  const pct = data.budget.today_percent ?? 0;

  const totals = (label: string, x: Totals) => (
    <Card style={{ flex: 1, minWidth: 150 }}>
      <Text variant="small">{label}</Text>
      <RNText style={{ color: colors.text, fontFamily: fonts.displayBold, fontSize: 26 }}>{brl(x.cost_brl, locale)}</RNText>
      <Text variant="small">{usd(x.cost_usd, locale)}</Text>
      <Text variant="small">
        {t('admin.requests', { n: x.requests })} · {t('admin.users', { n: x.users })}
      </Text>
    </Card>
  );

  const group = (title: string, rows: { key: string; cost_brl: number; requests: number }[]) => (
    <Card>
      <Text variant="heading">{title}</Text>
      {rows.length ? (
        rows.map((r) => (
          <View key={r.key} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="body">{r.key}</Text>
            <Text variant="muted">
              {brl(r.cost_brl, locale)} · {r.requests}
            </Text>
          </View>
        ))
      ) : (
        <Text variant="small">—</Text>
      )}
    </Card>
  );

  return (
    <Screen>
      <Button kind="secondary" icon="settings-outline" title={t('admin.settings')} onPress={() => router.push('/admin/settings')} />
      <Button kind="primary" icon="people-outline" title={t('adminUsers.title')} onPress={() => router.push('/admin/accounts')} />
      <Button kind="secondary" icon="heart-outline" title={t('admin.offers.title')} onPress={() => router.push('/admin/offers')} />
      <Button kind="secondary" icon="speedometer-outline" title={t('admin.limits.title')} onPress={() => router.push('/admin/limits')} />
      <Button kind="secondary" icon="key-outline" title={t('admin.integrations')} onPress={() => router.push('/admin/integrations')} />
      <Button kind="secondary" icon="calendar-number-outline" title={t('admin.devotionals')} onPress={() => router.push('/admin/devotionals')} />
      <Button kind="secondary" icon="happy-outline" title={t('adminKids.open')} onPress={() => router.push('/admin/kids')} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button kind="secondary" icon="book-outline" title={t('admin.bibles')} onPress={() => router.push('/admin/bibles')} />
        </View>
        <View style={{ flex: 1 }}>
          <Button kind="secondary" icon="language-outline" title={t('admin.languages')} onPress={() => router.push('/admin/languages')} />
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {totals(t('admin.today'), data.today)}
        {totals(t('admin.month'), data.month)}
        {totals(t('admin.allTime'), data.all_time)}
      </View>

      <Card>
        <Text variant="heading">{t('admin.budget')}</Text>
        <View style={{ height: 10, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
          <View
            style={{
              width: `${Math.min(100, pct)}%`,
              height: '100%',
              backgroundColor: pct >= 100 ? colors.danger : pct >= 80 ? colors.goldMuted : colors.gold,
            }}
          />
        </View>
        <Text variant="small">{t('admin.budgetUsed', { pct, limit: data.budget.daily_usd })}</Text>
      </Card>

      <Card>
        <Text variant="heading">{t('admin.daily')}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 3 }}>
          {data.daily.map((d) => (
            <View
              key={d.date}
              accessibilityLabel={`${d.date}: ${usd(d.cost_usd, locale)}`}
              style={{ flex: 1, height: `${Math.max(2, (d.cost_usd / maxDay) * 100)}%`, backgroundColor: colors.gold, borderRadius: 3 }}
            />
          ))}
        </View>
        {data.daily.length ? (
          <Text variant="small">
            {data.daily[0].date} → {data.daily[data.daily.length - 1].date}
          </Text>
        ) : null}
      </Card>

      <Card>
        <Text variant="heading">{t('admin.economics')}</Text>
        {(
          [
            [t('admin.proSubscribers'), String(data.economics.pro_subscribers)],
            [t('admin.proPrice'), data.economics.pro_price_brl_month === null ? t('admin.notSet') : brl(data.economics.pro_price_brl_month, locale)],
            [t('admin.avgPro'), brl(data.economics.avg_ai_cost_per_pro_brl_month, locale)],
            [t('admin.margin'), brl(data.economics.margin_per_pro_brl_month, locale)],
            [t('admin.freeUsers'), String(data.economics.free_users_using_ai)],
            [t('admin.avgFree'), brl(data.economics.avg_ai_cost_per_free_user_brl_month, locale)],
            [
              t('admin.donations'),
              t('admin.donationsTotal', {
                n: data.economics.donations_month?.count ?? 0,
                amount:
                  (data.economics.donations_month?.by_currency ?? [])
                    .map((d) => d.amount.toLocaleString(locale, { style: 'currency', currency: d.currency }))
                    .join(' + ') || brl(0, locale),
              }),
            ],
          ] as const
        ).map(([label, value]) => (
          <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
            <Text variant="muted" style={{ flex: 1 }}>
              {label}
            </Text>
            <Text variant="label">{value}</Text>
          </View>
        ))}
      </Card>

      {group(t('admin.byFeature'), data.by_feature)}
      {group(t('admin.byModel'), data.by_model)}
      {group(t('admin.byPlan'), data.by_plan)}

      <Text variant="heading">{t('admin.topUsers')}</Text>
      <Segmented
        value={period}
        onChange={setPeriod}
        options={[
          { value: 'today', label: t('admin.today') },
          { value: 'month', label: t('admin.month') },
          { value: 'all', label: t('admin.allTime') },
        ]}
      />
      <Card style={{ paddingVertical: 4 }}>
        {users.length ? (
          users.map((u, i) => (
            <View key={u.user_id}>
              {i > 0 ? <Divider /> : null}
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/admin/users/[id]', params: { id: u.user_id } })}
                style={{ paddingVertical: 10, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text variant="body" numberOfLines={1}>
                    {u.name ?? u.email}
                  </Text>
                  <Text variant="small" numberOfLines={1}>
                    {u.email} · {u.plan.toUpperCase()} · {u.requests}
                  </Text>
                </View>
                <Text variant="label">{brl(u.cost_brl, locale)}</Text>
              </Pressable>
            </View>
          ))
        ) : (
          <Text variant="small">—</Text>
        )}
      </Card>

      <TextField
        label={t('admin.searchUsers')}
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        onSubmitEditing={() => adminApi.searchUsers(search).then((r) => setFound(r.users)).catch(() => {})}
        returnKeyType="search"
      />
      {found.length ? (
        <Card style={{ paddingVertical: 4 }}>
          {found.map((u, i) => (
            <View key={u.id}>
              {i > 0 ? <Divider /> : null}
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/admin/users/[id]', params: { id: u.id } })}
                style={{ paddingVertical: 10 }}>
                <Text variant="body">{u.name ?? u.email}</Text>
                <Text variant="small">
                  {u.email} · {u.plan.toUpperCase()}
                </Text>
              </Pressable>
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

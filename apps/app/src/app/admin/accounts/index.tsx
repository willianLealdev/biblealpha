import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text as RNText, View } from 'react-native';

import { Button, Card, Divider, Notice, Screen, Text, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { accountsApi, type AccountFilter, type AccountRow, type AccountSort, type AccountSummary } from '@/lib/admin';
import { StatusChips, useAgo } from '@/components/account-bits';
import { useTheme } from '@/theme';
import { fonts, radius } from '@/theme/tokens';

const FILTERS: AccountFilter[] = ['all', 'online', 'blocked', 'locked', 'unverified', 'inactive', 'admin'];
const SORTS: AccountSort[] = ['seen', 'created', 'name'];

export default function AdminAccounts() {
  const { t, errorMessage } = useI18n();
  const { colors } = useTheme();
  const ago = useAgo();
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<AccountFilter>('all');
  const [sort, setSort] = useState<AccountSort>('seen');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    (offset = 0) => {
      Promise.all([accountsApi.summary(), accountsApi.list({ q: search, filter, sort, offset })])
        .then(([s, l]) => {
          setSummary(s);
          setTotal(l.total);
          setRows((prev) => (offset ? [...prev, ...l.users] : l.users));
          setError(null);
        })
        .catch((e) => setError(errorMessage(e)))
        .finally(() => setLoading(false));
    },
    [search, filter, sort, errorMessage],
  );

  useEffect(() => {
    load(0);
  }, [load]);

  // Atualiza sozinho a cada 30 s para acompanhar quem está online
  useEffect(() => {
    const id = setInterval(() => load(0), 30000);
    return () => clearInterval(id);
  }, [load]);

  const stat = (label: string, value: number | string, hint?: string) => (
    <Card style={{ flexGrow: 1, flexBasis: 140, gap: 2 }}>
      <Text variant="small">{label}</Text>
      <Text variant="heading">{String(value)}</Text>
      {hint ? <Text variant="small">{hint}</Text> : null}
    </Card>
  );

  return (
    <Screen>
      {error ? <Notice kind="error">{error}</Notice> : null}
      {summary ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {stat(t('adminUsers.onlineNow'), summary.online_now, t('adminUsers.onlineHint', { n: summary.online_devices, m: summary.online_minutes }))}
          {stat(t('adminUsers.total'), summary.total, t('adminUsers.verifiedHint', { n: summary.verified }))}
          {stat(t('adminUsers.active24h'), summary.active_24h)}
          {stat(t('adminUsers.active7d'), summary.active_7d)}
          {stat(t('adminUsers.active30d'), summary.active_30d)}
          {stat(t('adminUsers.new7d'), summary.new_7d)}
          {stat(t('adminUsers.blocked'), summary.blocked)}
          {stat(t('adminUsers.locked'), summary.locked)}
        </View>
      ) : null}

      <TextField
        label={t('admin.searchUsers')}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        returnKeyType="search"
        onSubmitEditing={() => setSearch(query.trim())}
      />
      <Button kind="secondary" icon="search" title={t('adminUsers.search')} onPress={() => setSearch(query.trim())} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {FILTERS.map((f) => {
          const active = f === filter;
          return (
            <Pressable
              key={f}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              onPress={() => setFilter(f)}
              style={{
                borderWidth: 1,
                borderColor: active ? colors.gold : colors.border,
                backgroundColor: active ? colors.gold : 'transparent',
                borderRadius: radius.pill,
                paddingHorizontal: 14,
                paddingVertical: 8,
              }}>
              <RNText style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: active ? colors.onGold : colors.text }}>
                {t(`adminUsers.filter.${f}`)}
              </RNText>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Text variant="small">{t('adminUsers.sortBy')}</Text>
        {SORTS.map((s) => (
          <Pressable key={s} onPress={() => setSort(s)} accessibilityRole="radio" accessibilityState={{ selected: s === sort }}>
            <RNText style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: s === sort ? colors.gold : colors.textMuted }}>
              {t(`adminUsers.sort.${s}`)}
            </RNText>
          </Pressable>
        ))}
        <Text variant="small" style={{ marginLeft: 'auto' }}>
          {t('adminUsers.count', { n: total })}
        </Text>
      </View>

      <Card style={{ paddingVertical: 4 }}>
        {rows.map((u, i) => (
          <View key={u.id}>
            {i > 0 ? <Divider /> : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/admin/accounts/[id]', params: { id: u.id } })}
              style={{ paddingVertical: 12, gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: u.blocked ? colors.danger : u.online ? colors.success : colors.border,
                  }}
                />
                <Text variant="body" numberOfLines={1} style={{ flex: 1 }}>
                  {u.name ?? u.email}
                </Text>
                <Text variant="small">{ago(u.last_seen_at)}</Text>
              </View>
              <Text variant="small" numberOfLines={1}>
                {u.email}
                {u.country ? ` · ${u.country}` : ''}
                {u.roles.includes('admin') ? ' · admin' : ''}
              </Text>
              <StatusChips row={u} />
            </Pressable>
          </View>
        ))}
        {loading && !rows.length ? <ActivityIndicator color={colors.gold} style={{ margin: 16 }} /> : null}
        {!loading && !rows.length ? <Text variant="small">{t('adminUsers.empty')}</Text> : null}
      </Card>
      {rows.length < total ? (
        <Button kind="secondary" title={t('adminUsers.more')} loading={loading} onPress={() => {
            setLoading(true);
            load(rows.length);
          }} />
      ) : null}
    </Screen>
  );
}

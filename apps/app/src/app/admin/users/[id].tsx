import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Button, Card, Divider, Notice, Screen, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { adminApi, type AdminUserDetail } from '@/lib/admin';
import { useTheme } from '@/theme';

export default function AdminUser() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale, errorMessage } = useI18n();
  const { colors } = useTheme();
  const [data, setData] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    adminApi
      .user(id)
      .then(setData)
      .catch((e) => setError(errorMessage(e)));
  }, [id, errorMessage]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <Screen><Notice kind="error">{error}</Notice></Screen>;
  if (!data) return <Screen center><ActivityIndicator color={colors.gold} /></Screen>;

  const brl = (v: number) => v.toLocaleString(locale, { style: 'currency', currency: 'BRL', maximumFractionDigits: 4 });

  return (
    <Screen>
      <Card>
        <Text variant="heading">{data.user.name ?? data.user.email}</Text>
        <Text variant="muted">{data.user.email}</Text>
        <Text variant="small">
          {data.plan.toUpperCase()}
          {data.subscription ? ` · ${data.subscription.source}${data.subscription.current_period_end ? ` · ${data.subscription.current_period_end.slice(0, 10)}` : ''}` : ''}
        </Text>
      </Card>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Card style={{ flex: 1 }}>
          <Text variant="small">{t('admin.month')}</Text>
          <Text variant="heading">{brl(data.month.cost_brl)}</Text>
          <Text variant="small">{t('admin.requests', { n: data.month.requests })}</Text>
        </Card>
        <Card style={{ flex: 1 }}>
          <Text variant="small">{t('admin.allTime')}</Text>
          <Text variant="heading">{brl(data.all_time.cost_brl)}</Text>
          <Text variant="small">{t('admin.requests', { n: data.all_time.requests })}</Text>
        </Card>
      </View>
      {data.subscription?.source === 'manual' ? (
        <Button kind="secondary" title={t('admin.revokePro')} onPress={() => adminApi.revokePro(id).then(load)} />
      ) : data.plan === 'free' ? (
        <Button kind="secondary" title={t('admin.grantPro')} onPress={() => adminApi.grantPro(id, 30).then(load)} />
      ) : null}
      <Text variant="heading">{t('admin.requestsList')}</Text>
      <Card style={{ paddingVertical: 4 }}>
        {data.requests.length ? (
          data.requests.map((r, i) => (
            <View key={i}>
              {i > 0 ? <Divider /> : null}
              <View style={{ paddingVertical: 8, gap: 2 }}>
                <Text variant="label">
                  {new Date(r.created_at).toLocaleString(locale)} · {r.feature} · {r.status}
                </Text>
                <Text variant="small">
                  {r.model} · in {r.input_tokens} / out {r.output_tokens} / cache {r.cache_read_tokens} · {brl(r.cost_brl)} ·{' '}
                  {(r.latency_ms / 1000).toFixed(1)}s
                </Text>
              </View>
            </View>
          ))
        ) : (
          <Text variant="small">—</Text>
        )}
      </Card>
    </Screen>
  );
}

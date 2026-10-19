import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text as RNText, View } from 'react-native';

import { Button, Card, Notice, Screen, Text, TextField } from '@/components/ui';
import { useI18n, type TranslationKey } from '@/i18n';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';
import { fonts } from '@/theme/tokens';

type Item = {
  name: string;
  group: 'anthropic' | 'deepseek' | 'openai' | 'resend' | 'stripe';
  secret: boolean;
  configured: boolean;
  source: 'panel' | 'env' | null;
  preview: string | null;
};
type Status = { items: Item[]; stripe: { webhook_url: string; webhook_events: string[] } };

const GROUPS: { id: Item['group']; title: TranslationKey }[] = [
  { id: 'anthropic', title: 'admin.groupAnthropic' },
  { id: 'deepseek', title: 'admin.groupDeepseek' },
  { id: 'openai', title: 'admin.groupOpenai' },
  { id: 'resend', title: 'admin.groupResend' },
  { id: 'stripe', title: 'admin.groupStripe' },
];

const LABELS: Record<string, TranslationKey> = {
  anthropic_api_key: 'admin.keyAnthropic',
  deepseek_api_key: 'admin.keyDeepseek',
  openai_api_key: 'admin.keyOpenai',
  resend_api_key: 'admin.keyResend',
  email_from: 'admin.keyEmailFrom',
  stripe_secret_key: 'admin.keyStripeSecret',
  stripe_publishable_key: 'admin.keyStripePublishable',
  stripe_webhook_secret: 'admin.keyStripeWebhook',
};

/** Chaves das integrações. O valor digitado vai para a API e nunca volta inteiro. */
export default function AdminIntegrations() {
  const { t, errorMessage } = useI18n();
  const { colors } = useTheme();
  const [status, setStatus] = useState<Status | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, { kind: 'success' | 'error'; text: string }>>({});

  const load = useCallback(() => {
    api<Status>('/admin/integrations')
      .then(setStatus)
      .catch((e) => setMessages({ _: { kind: 'error', text: errorMessage(e) } }));
  }, [errorMessage]);

  useEffect(load, [load]);

  async function save(name: string, group: string, value: string | null) {
    setBusy(name);
    setMessages((m) => ({ ...m, [group]: undefined as never }));
    try {
      const r = await api<{ items: Item[] }>(`/admin/integrations/${name}`, { method: 'PUT', body: { value } });
      setStatus((s) => (s ? { ...s, items: r.items } : s));
      setValues((v) => ({ ...v, [name]: '' }));
    } catch (e) {
      setMessages((m) => ({ ...m, [group]: { kind: 'error', text: errorMessage(e) } }));
    } finally {
      setBusy(null);
    }
  }

  async function test(group: string) {
    setBusy(`test:${group}`);
    try {
      const r = await api<{ detail: { livemode?: boolean } }>(`/admin/integrations/${group}/test`, { method: 'POST' });
      const mode = r.detail.livemode === undefined ? '' : ` ${t(r.detail.livemode ? 'admin.liveMode' : 'admin.testMode')}`;
      setMessages((m) => ({ ...m, [group]: { kind: 'success', text: `${t('admin.testOk')}${mode}` } }));
    } catch (e) {
      setMessages((m) => ({ ...m, [group]: { kind: 'error', text: errorMessage(e) } }));
    } finally {
      setBusy(null);
    }
  }

  if (!status) {
    return <Screen center>{messages._ ? <Notice kind="error">{messages._.text}</Notice> : <ActivityIndicator color={colors.gold} />}</Screen>;
  }

  return (
    <Screen>
      <Text variant="muted">{t('admin.integrationsHint')}</Text>
      {GROUPS.map((g) => {
        const items = status.items.filter((i) => i.group === g.id);
        return (
          <Card key={g.id}>
            <Text variant="heading">{t(g.title)}</Text>
            {items.map((item) => (
              <View key={item.name} style={{ gap: 6 }}>
                <TextField
                  label={t(LABELS[item.name])}
                  value={values[item.name] ?? ''}
                  onChangeText={(v) => setValues((cur) => ({ ...cur, [item.name]: v }))}
                  placeholder={t('admin.newValue')}
                  secureTextEntry={item.secret}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <Text variant="small" style={{ flex: 1, color: item.configured ? colors.success : colors.textMuted }}>
                    {item.configured
                      ? t('admin.configured', {
                          preview: item.preview ?? '',
                          source: t(item.source === 'panel' ? 'admin.fromPanel' : 'admin.fromEnv'),
                        })
                      : t('admin.notConfigured')}
                  </Text>
                  {values[item.name]?.trim() ? (
                    <Pressable accessibilityRole="button" onPress={() => save(item.name, g.id, values[item.name].trim())}>
                      <RNText style={{ color: colors.gold, fontFamily: fonts.bodyBold }}>{busy === item.name ? '…' : t('admin.saveKey')}</RNText>
                    </Pressable>
                  ) : null}
                  {item.source === 'panel' ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        const ok = Platform.OS === 'web' ? globalThis.confirm?.(`${t('admin.removeKey')}?`) ?? true : true;
                        if (ok) save(item.name, g.id, null);
                      }}>
                      <RNText style={{ color: colors.danger, fontFamily: fonts.bodyMedium }}>{t('admin.removeKey')}</RNText>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))}
            {g.id === 'stripe' ? (
              <View style={{ gap: 4 }}>
                <Text variant="small">{t('admin.webhookUrl')}</Text>
                <Text variant="body" selectable>
                  {status.stripe.webhook_url}
                </Text>
                <Text variant="small">
                  {t('admin.webhookEvents')}: {status.stripe.webhook_events.join(', ')}
                </Text>
              </View>
            ) : null}
            {messages[g.id] ? <Notice kind={messages[g.id].kind}>{messages[g.id].text}</Notice> : null}
            <Button kind="secondary" icon="pulse-outline" title={t('admin.testConnection')} loading={busy === `test:${g.id}`} onPress={() => test(g.id)} />
          </Card>
        );
      })}
    </Screen>
  );
}

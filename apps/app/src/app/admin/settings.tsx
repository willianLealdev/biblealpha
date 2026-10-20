import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Switch, Text as RNText, View } from 'react-native';

import { Button, Card, Notice, Screen, Text, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { adminApi, type AdminSettings, type ModelConfig } from '@/lib/admin';
import { useTheme } from '@/theme';
import { fonts, radius } from '@/theme/tokens';

const EFFORTS: ModelConfig['effort'][] = ['low', 'medium', 'high', 'xhigh', 'max'];

function Chips<T extends string>({ value, options, onChange }: { value: T; options: T[]; onChange: (v: T) => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {options.map((o) => {
        const active = o === value;
        return (
          <Pressable
            key={o}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o)}
            style={{
              borderWidth: 1,
              borderColor: active ? colors.gold : colors.border,
              backgroundColor: active ? colors.gold : 'transparent',
              borderRadius: radius.pill,
              paddingHorizontal: 10,
              paddingVertical: 5,
            }}>
            <RNText style={{ color: active ? colors.onGold : colors.text, fontFamily: fonts.body, fontSize: 13 }}>{o}</RNText>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function AdminSettingsScreen() {
  const { t, errorMessage } = useI18n();
  const { colors } = useTheme();
  const [s, setS] = useState<AdminSettings | null>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    adminApi
      .settings()
      .then(setS)
      .catch((e) => setMessage({ kind: 'error', text: errorMessage(e) }));
  }, [errorMessage]);

  if (!s) return <Screen center>{message ? <Notice kind="error">{message.text}</Notice> : <ActivityIndicator color={colors.gold} />}</Screen>;

  const num = (v: string) => Number(v.replace(',', '.')) || 0;
  const setModel = (feature: keyof AdminSettings['models'], patch: Partial<ModelConfig>) =>
    setS({ ...s, models: { ...s.models, [feature]: { ...s.models[feature], ...patch } } });

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const { known_models: _k, prices: _p, ...body } = s!;
      setS(await adminApi.saveSettings({ ...body, alert_email: body.alert_email || null }));
      setMessage({ kind: 'success', text: t('admin.savedSettings') });
    } catch (e) {
      setMessage({ kind: 'error', text: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  }

  const features: [keyof AdminSettings['models'], string][] = [
    ['explain', t('admin.featureExplain')],
    ['chat', t('admin.featureChat')],
    ['classify', t('admin.featureClassify')],
  ];

  return (
    <Screen>
      {message ? <Notice kind={message.kind}>{message.text}</Notice> : null}
      <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="heading">{t('admin.aiEnabled')}</Text>
        <Switch value={s.enabled} onValueChange={(v) => setS({ ...s, enabled: v })} trackColor={{ true: colors.gold }} />
      </Card>

      <Text variant="heading">{t('admin.models')}</Text>
      {features.map(([key, label]) => (
        <Card key={key}>
          <Text variant="label">{label}</Text>
          <Chips value={s.models[key].model} options={s.known_models} onChange={(model) => setModel(key, { model })} />
          <Text variant="small">{t('admin.effort')}</Text>
          <Chips value={s.models[key].effort} options={EFFORTS} onChange={(effort) => setModel(key, { effort })} />
          <TextField
            label={t('admin.maxTokens')}
            value={String(s.models[key].max_tokens)}
            onChangeText={(v) => setModel(key, { max_tokens: num(v) })}
            keyboardType="numeric"
          />
        </Card>
      ))}

      <Text variant="heading">{t('admin.quotas')}</Text>
      <Card>
        {(
          [
            ['free_daily', t('admin.freeDaily')],
            ['free_monthly', t('admin.freeMonthly')],
            ['pro_daily_cap', t('admin.proDaily')],
            ['pro_per_minute', t('admin.proMinute')],
          ] as const
        ).map(([key, label]) => (
          <TextField
            key={key}
            label={label}
            value={String(s.quotas[key])}
            onChangeText={(v) => setS({ ...s, quotas: { ...s.quotas, [key]: num(v) } })}
            keyboardType="numeric"
          />
        ))}
      </Card>

      <Text variant="heading">{t('admin.budget')}</Text>
      <Card>
        <TextField label={t('admin.budgetDaily')} value={String(s.budget_daily_usd)} onChangeText={(v) => setS({ ...s, budget_daily_usd: num(v) })} keyboardType="decimal-pad" />
        <TextField label={t('admin.budgetMonthly')} value={String(s.budget_monthly_usd)} onChangeText={(v) => setS({ ...s, budget_monthly_usd: num(v) })} keyboardType="decimal-pad" />
        <TextField label={t('admin.budgetHard')} value={String(s.budget_hard_daily_usd)} onChangeText={(v) => setS({ ...s, budget_hard_daily_usd: num(v) })} keyboardType="decimal-pad" />
        <TextField label={t('admin.alertEmail')} value={s.alert_email ?? ''} onChangeText={(v) => setS({ ...s, alert_email: v })} autoCapitalize="none" keyboardType="email-address" />
        <TextField label={t('admin.usdBrl')} value={String(s.usd_brl)} onChangeText={(v) => setS({ ...s, usd_brl: num(v) })} keyboardType="decimal-pad" />
      </Card>

      <Button title={t('common.save')} onPress={save} loading={saving} />

      <Text variant="heading">{t('admin.prices')}</Text>
      <Card>
        {s.prices.map((p) => (
          <Text key={`${p.model}-${p.valid_from}`} variant="small">
            {p.model} ({p.valid_from}): in {p.input_per_mtok} · out {p.output_per_mtok} · cache {p.cache_read_per_mtok}/{p.cache_write_per_mtok}
          </Text>
        ))}
      </Card>
    </Screen>
  );
}

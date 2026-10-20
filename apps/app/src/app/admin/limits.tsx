// Painel → Limites: quantos estudos visuais e fundos do telão cada pessoa pode criar por mês. Vale na hora para todos os aparelhos (o app lê do servidor).

import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Button, Card, Notice, Screen, Text, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

type Quota = { free_monthly: number; pro_monthly: number };
type Limits = {
  visual: Quota;
  slides: Quota;
  donation: { min_brl: number; max_brl: number; min_usd: number; max_usd: number; bonus_questions: number };
};

const num = (v: string) => {
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

export default function AdminLimits() {
  const { t, errorMessage } = useI18n();
  const { colors } = useTheme();
  const [s, setS] = useState<Limits | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    api<Limits>('/admin/limits')
      .then(setS)
      .catch((e) => setMessage({ kind: 'error', text: errorMessage(e) }));
  }, [errorMessage]);

  if (!s) {
    return (
      <Screen center>
        {message ? <Notice kind="error">{message.text}</Notice> : <ActivityIndicator color={colors.gold} />}
      </Screen>
    );
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      setS(await api<Limits>('/admin/limits', { method: 'PUT', body: s }));
      setMessage({ kind: 'success', text: t('admin.limits.saved') });
    } catch (e) {
      setMessage({ kind: 'error', text: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  }

  const quota = (key: 'visual' | 'slides') => (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <View style={{ flex: 1 }}>
        <TextField
          label={t('admin.limits.free')}
          value={String(s[key].free_monthly)}
          onChangeText={(v) => setS({ ...s, [key]: { ...s[key], free_monthly: Math.round(num(v)) } })}
          keyboardType="number-pad"
        />
      </View>
      <View style={{ flex: 1 }}>
        <TextField
          label={t('admin.limits.pro')}
          value={String(s[key].pro_monthly)}
          onChangeText={(v) => setS({ ...s, [key]: { ...s[key], pro_monthly: Math.round(num(v)) } })}
          keyboardType="number-pad"
        />
      </View>
    </View>
  );

  return (
    <Screen>
      <Text variant="title">{t('admin.limits.title')}</Text>
      <Text variant="muted">{t('admin.limits.intro')}</Text>

      <Card>
        <Text variant="heading">{t('admin.limits.visual')}</Text>
        <Text variant="small">{t('admin.limits.visualHint')}</Text>
        {quota('visual')}
      </Card>

      <Card>
        <Text variant="heading">{t('admin.limits.slides')}</Text>
        <Text variant="small">{t('admin.limits.slidesHint')}</Text>
        {quota('slides')}
      </Card>

      <Text variant="small">{t('admin.limits.otherCosts')}</Text>
      {message ? <Notice kind={message.kind}>{message.text}</Notice> : null}
      <Button icon="checkmark" title={t('admin.limits.save')} onPress={save} loading={saving} />
    </Screen>
  );
}

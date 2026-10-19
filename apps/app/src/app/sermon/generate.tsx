import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text as RNText, View } from 'react-native';

import { tryParseReferences } from '@/bible/reference';
import { Button, Notice, Screen, Segmented, Text, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { useSession } from '@/lib/session';
import { ApiError } from '@/lib/api';
import { KINDS, sermonApi, type Kind } from '@/lib/sermons';
import { useTheme } from '@/theme';
import { fonts, radius } from '@/theme/tokens';

export default function GenerateSermon() {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const [theme, setTheme] = useState('');
  const [reference, setReference] = useState('');
  const [objective, setObjective] = useState('');
  const [duration, setDuration] = useState('35');
  const [level, setLevel] = useState<'basic' | 'intermediate' | 'advanced'>('intermediate');
  const [kind, setKind] = useState<Kind>('thematic');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = !!useSession().user?.roles.includes('admin');

  async function go() {
    setError(null);
    if (theme.trim().length < 2 || !tryParseReferences(reference, locale)) {
      setError(t('sermons.generateMissing'));
      return;
    }
    setLoading(true);
    try {
      const s = await sermonApi.generate({
        theme: theme.trim(),
        main_reference: reference.trim(),
        objective: objective.trim() || undefined,
        duration_minutes: Math.min(180, Math.max(5, Number(duration) || 35)),
        level,
        kind,
      });
      router.replace({ pathname: '/sermon/[id]', params: { id: s.id } });
    } catch (e) {
      const code = e instanceof ApiError ? e.code : 'generic';
      const msg = t(`study.errors.${code}` as any);
      setError(msg === `study.errors.${code}` ? t('study.errors.generic') : msg);
    } finally {
      setLoading(false);
    }
  }

  // Só o administrador gera ministrações com IA (a API também recusa)
  if (!isAdmin) return <Redirect href="/sermons" />;

  return (
    <Screen>
      <Text variant="muted">{t('sermons.generateHint')}</Text>
      <TextField label={t('sermons.theme')} placeholder={t('sermons.themePlaceholder')} value={theme} onChangeText={setTheme} />
      <TextField label={t('sermons.mainReference')} placeholder="Rm 6:23" value={reference} onChangeText={setReference} />
      <TextField label={t('sermons.objective')} value={objective} onChangeText={setObjective} multiline style={{ minHeight: 60 }} />
      <TextField label={t('sermons.duration')} value={duration} onChangeText={setDuration} keyboardType="numeric" />
      <Text variant="label">{t('sermons.level')}</Text>
      <Segmented
        value={level}
        onChange={setLevel}
        options={[
          { value: 'basic', label: t('sermons.levels.basic') },
          { value: 'intermediate', label: t('sermons.levels.intermediate') },
          { value: 'advanced', label: t('sermons.levels.advanced') },
        ]}
      />
      <Text variant="label">{t('sermons.format')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {KINDS.map((k) => {
          const active = k === kind;
          return (
            <Pressable
              key={k}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              onPress={() => setKind(k)}
              style={{
                borderWidth: 1,
                borderColor: active ? colors.gold : colors.border,
                backgroundColor: active ? colors.gold : 'transparent',
                borderRadius: radius.pill,
                paddingHorizontal: 14,
                paddingVertical: 8,
              }}>
              <RNText style={{ color: active ? colors.onGold : colors.text, fontFamily: fonts.bodyMedium }}>{t(`sermons.kinds.${k}`)}</RNText>
            </Pressable>
          );
        })}
      </View>
      {error ? <Notice kind="error">{error}</Notice> : null}
      {loading ? (
        <View style={{ alignItems: 'center', gap: 8 }}>
          <ActivityIndicator color={colors.gold} />
          <Text variant="muted">{t('sermons.generating')}</Text>
        </View>
      ) : (
        <Button icon="sparkles" title={t('sermons.generateButton')} onPress={go} />
      )}
    </Screen>
  );
}

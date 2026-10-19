import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text as RNText, View } from 'react-native';

import { tryParseReferences, verseKey } from '@/bible/reference';
import { DevotionalView } from '@/components/devotional-view';
import { Button, Notice, Screen, Segmented, Text, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { ApiError } from '@/lib/api';
import { devotionalApi, type Devotional } from '@/lib/devotional';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme';
import { fonts, radius } from '@/theme/tokens';

export default function NewDevotional() {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const [themes, setThemes] = useState<{ code: string; label: string }[]>([]);
  const [theme, setTheme] = useState<string | null>(null);
  const [passage, setPassage] = useState('');
  const [length, setLength] = useState<'short' | 'medium' | 'long'>('medium');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Devotional | null>(null);
  const isAdmin = !!useSession().user?.roles.includes('admin');

  useEffect(() => {
    devotionalApi
      .themes()
      .then((r) => setThemes(r.themes))
      .catch(() => {});
  }, []);

  async function create() {
    setError(null);
    let start: number | null = null;
    let end: number | null = null;
    if (passage.trim()) {
      const refs = tryParseReferences(passage, locale);
      if (!refs || refs[0].verseStart === null) {
        setError(t('study.invalidPassage'));
        return;
      }
      const r = refs[0];
      start = verseKey(r.book, r.chapter, r.verseStart!);
      end = verseKey(r.book, r.chapterEnd, r.verseEnd ?? r.verseStart!);
    } else if (!theme) {
      setError(t('devotional.chooseThemeOrPassage'));
      return;
    }
    setLoading(true);
    try {
      setResult(await devotionalApi.personal({ theme, verse_key_start: start, verse_key_end: end, length }));
    } catch (e) {
      const code = e instanceof ApiError ? e.code : 'generic';
      const key = `study.errors.${code}`;
      const msg = t(key as any);
      setError(msg === key ? t('study.errors.generic') : msg);
    } finally {
      setLoading(false);
    }
  }

  // Só o administrador gera devocionais com IA (a API também recusa)
  if (!isAdmin) return <Redirect href="/devotional" />;

  if (result) {
    return (
      <Screen>
        <DevotionalView d={result} />
        <Button kind="secondary" title={t('devotional.history')} onPress={() => router.replace('/devotionals/history')} />
        <Button kind="ghost" title={t('devotional.createAnother')} onPress={() => setResult(null)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text variant="muted">{t('devotional.personalHint')}</Text>
      <Text variant="label">{t('devotional.theme')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {themes.map((th) => {
          const active = th.code === theme;
          return (
            <Pressable
              key={th.code}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              onPress={() => setTheme(active ? null : th.code)}
              style={{
                borderWidth: 1,
                borderColor: active ? colors.gold : colors.border,
                backgroundColor: active ? colors.gold : colors.surface,
                borderRadius: radius.pill,
                paddingHorizontal: 14,
                paddingVertical: 8,
              }}>
              <RNText style={{ color: active ? colors.onGold : colors.text, fontFamily: fonts.bodyMedium }}>{th.label}</RNText>
            </Pressable>
          );
        })}
      </View>
      <TextField label={t('devotional.passageOptional')} placeholder={t('study.passagePlaceholder')} value={passage} onChangeText={setPassage} />
      <Text variant="label">{t('devotional.length')}</Text>
      <Segmented
        value={length}
        onChange={setLength}
        options={[
          { value: 'short', label: t('devotional.short') },
          { value: 'medium', label: t('devotional.medium') },
          { value: 'long', label: t('devotional.long') },
        ]}
      />
      {error ? <Notice kind="error">{error}</Notice> : null}
      {loading ? (
        <View style={{ alignItems: 'center', gap: 8 }}>
          <ActivityIndicator color={colors.gold} />
          <Text variant="muted">{t('devotional.writing')}</Text>
        </View>
      ) : (
        <Button icon="sparkles" title={t('devotional.create')} onPress={create} />
      )}
    </Screen>
  );
}

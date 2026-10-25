import { Image } from 'expo-image';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text as RNText, View } from 'react-native';

import { bookName } from '@/bible/reference';
import { Button, Card, Notice, Screen, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { coverUrl, learnApi } from '@/lib/learn';
import { useTheme } from '@/theme';
import { fonts, radius } from '@/theme/tokens';

type Item = { key: string; image_id: string | null };

/** Capas da página Aprender: o admin gera com a IA de imagem (uma por vez), refaz ou apaga. */
export default function AdminCovers() {
  const { t, locale, errorMessage } = useI18n();
  const { colors } = useTheme();
  const [items, setItems] = useState<Item[] | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef(false);

  const load = useCallback(() => {
    learnApi
      .adminCovers()
      .then((r) => setItems(r.items))
      .catch((e) => setError(errorMessage(e)));
  }, [errorMessage]);

  useEffect(() => {
    load();
  }, [load]);

  async function one(key: string) {
    setWorking(key);
    setError(null);
    try {
      const r = await learnApi.generate(key);
      setItems((list) => list?.map((i) => (i.key === key ? { ...i, image_id: r.image_id } : i)) ?? null);
      return true;
    } catch (e) {
      setError(`${label(key)}: ${errorMessage(e)}`);
      return false;
    } finally {
      setWorking(null);
    }
  }

  async function allMissing() {
    stop.current = false;
    for (const item of items ?? []) {
      if (stop.current) break;
      if (!item.image_id && !(await one(item.key))) break;
    }
  }

  function label(key: string) {
    const [kind, ref] = key.split(':');
    return kind === 'book' ? bookName(ref, locale) : `${t('learn.plan')} ${ref}`;
  }

  if (!items) return <Screen center>{error ? <Notice kind="error">{error}</Notice> : <ActivityIndicator color={colors.gold} />}</Screen>;
  const missing = items.filter((i) => !i.image_id).length;

  return (
    <Screen>
      <Stack.Screen options={{ title: t('learn.coversTitle') }} />
      <Text variant="muted">{t('learn.coversIntro')}</Text>
      <Card>
        <Text variant="body">{t('learn.coversCount', { done: items.length - missing, total: items.length })}</Text>
        {working ? (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <ActivityIndicator color={colors.gold} />
            <Text variant="small">{t('learn.generating', { name: label(working) })}</Text>
          </View>
        ) : null}
        {working ? (
          <Button kind="secondary" title={t('learn.stop')} onPress={() => (stop.current = true)} />
        ) : missing ? (
          <Button icon="sparkles-outline" title={t('learn.generateMissing', { n: missing })} onPress={allMissing} />
        ) : null}
      </Card>
      {error ? <Notice kind="error">{error}</Notice> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {items.map((i) => (
          <View key={i.key} style={{ width: 104, gap: 4 }}>
            <View style={{ width: 104, height: 156, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
              {i.image_id ? (
                <Image source={{ uri: coverUrl(i.image_id) }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
              ) : working === i.key ? (
                <ActivityIndicator color={colors.gold} />
              ) : (
                <RNText style={{ color: colors.textMuted, fontSize: 11 }}>—</RNText>
              )}
            </View>
            <RNText numberOfLines={1} style={{ color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 12 }}>
              {label(i.key)}
            </RNText>
            <Pressable disabled={!!working} onPress={() => one(i.key)} accessibilityRole="button">
              <RNText style={{ color: working ? colors.textMuted : colors.gold, fontFamily: fonts.bodyMedium, fontSize: 12 }}>
                {i.image_id ? t('learn.redo') : t('learn.generate')}
              </RNText>
            </Pressable>
          </View>
        ))}
      </View>
    </Screen>
  );
}

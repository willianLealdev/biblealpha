import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text as RNText, View } from 'react-native';

import { formatKeyRange, splitKey } from '@/bible/reference';
import { Card, Notice, Screen, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { studyTools, type LexiconEntry } from '@/lib/study-tools';
import { useTheme } from '@/theme';
import { fonts } from '@/theme/tokens';

/** Palavra do original no léxico (Strong): sentido, explicação e onde aparece. */
export default function WordScreen() {
  const { strong } = useLocalSearchParams<{ strong: string }>();
  const { t, locale, errorMessage } = useI18n();
  const { colors } = useTheme();
  const [entry, setEntry] = useState<LexiconEntry | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    studyTools
      .lexicon(strong, locale)
      .then(setEntry)
      .catch((e) => setError(errorMessage(e)));
  }, [strong, locale, errorMessage]);

  if (error) return <Screen>{<Notice kind="error">{error}</Notice>}</Screen>;
  if (!entry) {
    return (
      <Screen center>
        <ActivityIndicator color={colors.gold} />
        <Text variant="small">{t('bible.loadingWord')}</Text>
      </Screen>
    );
  }
  const hebrew = entry.strong.startsWith('H');

  return (
    <Screen>
      <Stack.Screen options={{ title: entry.strong }} />
      <View style={{ alignItems: 'center', gap: 4 }}>
        <RNText style={{ color: colors.text, fontSize: 44, writingDirection: hebrew ? 'rtl' : 'ltr' }}>{entry.lemma}</RNText>
        <Text variant="muted">
          {entry.translit} · {entry.strong} · {entry.morph}
        </Text>
        <RNText style={{ color: colors.gold, fontFamily: fonts.bodyBold, fontSize: 18, textAlign: 'center' }}>{entry.gloss}</RNText>
      </View>
      <Card>
        <Text variant="label">{t('bible.meaning')}</Text>
        <RNText style={{ color: colors.text, fontFamily: fonts.body, fontSize: 15, lineHeight: 23 }}>
          {entry.definition.replace(/__/g, '').replace(/\n{3,}/g, '\n\n')}
        </RNText>
      </Card>
      <Text variant="heading">{t('bible.occurrences', { n: entry.occurrences })}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {entry.verses.map((key) => {
          const s = splitKey(key);
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              onPress={() => router.navigate({ pathname: '/', params: { book: s.book, chapter: String(s.chapter), verse: String(s.verse) } })}
              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
              <RNText style={{ color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 13 }}>{formatKeyRange(key, key, locale, true)}</RNText>
            </Pressable>
          );
        })}
      </View>
      <Text variant="small">{entry.credit}</Text>
    </Screen>
  );
}

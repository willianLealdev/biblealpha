import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text as RNText, View } from 'react-native';

import { BOOKS, type Book } from '@/bible/books';
import { bookName } from '@/bible/reference';
import { listTranslations } from '@/bible/text';
import { Screen, Segmented, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';
import { fonts, radius, space } from '@/theme/tokens';

export default function BookPicker() {
  const { book: currentCode, t: translation } = useLocalSearchParams<{ book?: string; t?: string }>();
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const current = BOOKS.find((b) => b.code === currentCode);
  const [testament, setTestament] = useState<'OT' | 'NT'>(current?.testament ?? 'OT');
  const [book, setBook] = useState<Book | null>(null);
  // Tradução incompleta (ex.: só o Novo Testamento): mostra só os livros que ela tem
  const [available, setAvailable] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!translation) return;
    listTranslations()
      .then((list) => {
        const books = list.find((x) => x.code === translation)?.books;
        setAvailable(books ? new Set(books) : null);
        // Só o Novo Testamento: abre direto nele
        if (books && !BOOKS.some((x) => x.testament === 'OT' && books.includes(x.code))) setTestament('NT');
      })
      .catch(() => {});
  }, [translation]);

  function open(chapter: number) {
    router.navigate({ pathname: '/', params: { book: book!.code, chapter: String(chapter) } });
  }

  if (book) {
    return (
      <Screen>
        <Pressable onPress={() => setBook(null)} accessibilityRole="button">
          <Text variant="small" style={{ color: colors.gold }}>
            ‹ {t('bible.chooseBook')}
          </Text>
        </Pressable>
        <Text variant="title">{bookName(book.code, locale)}</Text>
        <Text variant="muted">{t('bible.chapters')}</Text>
        <View style={styles.grid}>
          {Array.from({ length: book.chapters }, (_, i) => i + 1).map((c) => (
            <Pressable
              key={c}
              accessibilityRole="button"
              accessibilityLabel={`${bookName(book.code, locale)} ${c}`}
              onPress={() => open(c)}
              style={({ pressed }) => [
                styles.chapter,
                { borderColor: colors.border, backgroundColor: pressed ? colors.surfaceAlt : colors.surface },
              ]}>
              <RNText style={{ color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 16 }}>{c}</RNText>
            </Pressable>
          ))}
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Segmented
        value={testament}
        onChange={setTestament}
        options={[
          { value: 'OT', label: t('bible.oldTestament') },
          { value: 'NT', label: t('bible.newTestament') },
        ]}
      />
      <View style={styles.books}>
        {BOOKS.filter((b) => b.testament === testament && (!available || available.has(b.code))).map((b) => {
          const active = b.code === currentCode;
          return (
            <Pressable
              key={b.code}
              accessibilityRole="button"
              onPress={() => (b.chapters === 1 ? router.navigate({ pathname: '/', params: { book: b.code, chapter: '1' } }) : setBook(b))}
              style={({ pressed }) => [
                styles.book,
                {
                  borderColor: active ? colors.gold : colors.border,
                  backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
                },
              ]}>
              <RNText style={{ color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 15 }} numberOfLines={1}>
                {bookName(b.code, locale)}
              </RNText>
              <RNText style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 12 }}>{bookName(b.code, locale, true)}</RNText>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  books: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  book: {
    width: '48%',
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.sm,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chapter: { width: 56, height: 52, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { type BibleBook, type BibleInfo, bookName, kidsApi } from '@/kids/api';
import { useKidsText } from '@/kids/strings';
import { kidsColors, kidsFonts, kidsRadius } from '@/kids/theme';
import { BackButton, KidsScreen, Mascot, PillButton } from '@/kids/ui';

/** Bíblia para os Grandes (7+): as mesmas traduções do app oficial, livros em botões grandes. */
export default function KidsBible() {
  const { t, language, books: bookNames } = useKidsText();
  const [bibles, setBibles] = useState<BibleInfo[] | null>(null);
  const [books, setBooks] = useState<BibleBook[]>([]);
  const [code, setCode] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    Promise.all([kidsApi.bibles(language), kidsApi.books()])
      .then(([b, list]) => {
        setBibles(b);
        setBooks(list);
        setCode(b[0]?.code ?? null);
      })
      .catch(() => setFailed(true));
  }, [language]);

  const section = (testament: 'OT' | 'NT', color: string) => (
    <View style={{ gap: 10 }}>
      <Text style={[styles.section, { color }]}>{testament === 'OT' ? t('oldTestament') : t('newTestament')}</Text>
      <View style={styles.grid}>
        {books
          .filter((b) => b.testament === testament)
          .map((b) => (
            <Pressable
              key={b.code}
              accessibilityRole="button"
              accessibilityLabel={bookName(b, language, bookNames)}
              onPress={() => router.push({ pathname: '/kids/bible/[book]', params: { book: b.code, code: code! } })}
              style={({ pressed }) => [styles.book, { borderColor: color, opacity: pressed ? 0.75 : 1 }]}>
              <Text style={[styles.bookName, bookName(b, language, bookNames).length > 10 && { fontSize: 13 }]} numberOfLines={2}>
                {bookName(b, language, bookNames)}
              </Text>
            </Pressable>
          ))}
      </View>
    </View>
  );

  return (
    <KidsScreen>
      <BackButton />
      <Text style={styles.title} accessibilityRole="header">
        📜 {t('bibleTitle')}
      </Text>
      {failed ? (
        <Mascot message={t('loadError')} />
      ) : bibles === null ? (
        <ActivityIndicator size="large" color={kidsColors.pink} />
      ) : (
        <>
          {bibles.length > 1 ? (
            <View style={{ gap: 8 }}>
              <Text style={styles.hint}>{t('translation')}</Text>
              <View style={styles.translations}>
                {bibles.map((b) => (
                  <PillButton key={b.code} label={b.abbreviation} active={b.code === code} color={kidsColors.pink} onPress={() => setCode(b.code)} textSize={16} />
                ))}
              </View>
            </View>
          ) : null}
          {section('OT', kidsColors.orange)}
          {section('NT', kidsColors.blue)}
        </>
      )}
    </KidsScreen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: kidsFonts.bold, fontSize: 30, color: kidsColors.text },
  hint: { fontFamily: kidsFonts.bold, fontSize: 17, color: kidsColors.textMuted },
  translations: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  section: { fontFamily: kidsFonts.bold, fontSize: 22 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  book: {
    flexBasis: '31%',
    flexGrow: 1,
    minWidth: 100,
    minHeight: 64,
    backgroundColor: kidsColors.card,
    borderRadius: kidsRadius.md,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  bookName: { fontFamily: kidsFonts.bold, fontSize: 16, color: kidsColors.text, textAlign: 'center' },
});

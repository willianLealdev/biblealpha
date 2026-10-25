import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { type BibleBook, bookName, kidsApi } from '@/kids/api';
import { useSpeaker } from '@/kids/speak';
import { useKidsText } from '@/kids/strings';
import { kidsColors, kidsFonts, kidsRadius } from '@/kids/theme';
import { BackButton, KidsScreen, Mascot, PillButton } from '@/kids/ui';

/** Um livro da Bíblia: escolher o capítulo e ler um versículo por cartão, com voz. Sem anotações nem IA. */
export default function KidsBibleBook() {
  const { book, code } = useLocalSearchParams<{ book: string; code: string }>();
  const { t, language, books: bookNames } = useKidsText();
  const { speaking, toggle, stop } = useSpeaker(language);
  const [info, setInfo] = useState<BibleBook | null>(null);
  const [chapter, setChapter] = useState<number | null>(null);
  const [verses, setVerses] = useState<{ verse: number; text: string }[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [reading, setReading] = useState<number | null>(null);

  useEffect(() => {
    kidsApi
      .books()
      .then((list) => setInfo(list.find((b) => b.code === book) ?? null))
      .catch(() => setFailed(true));
  }, [book]);

  useEffect(() => {
    if (chapter === null) return;
    kidsApi
      .chapter(code, book, chapter)
      .then(setVerses)
      .catch(() => setFailed(true));
  }, [code, book, chapter]);

  function open(n: number) {
    stop();
    setReading(null);
    setVerses(null);
    setChapter(n);
  }

  const name = (info && bookName(info, language, bookNames)) ?? book;

  return (
    <KidsScreen>
      <BackButton to="/kids/bible" />
      <Text style={styles.title} accessibilityRole="header">
        {chapter ? `${name} ${chapter}` : name}
      </Text>
      {failed ? (
        <Mascot message={t('loadError')} />
      ) : !info ? (
        <ActivityIndicator size="large" color={kidsColors.pink} />
      ) : chapter === null ? (
        <>
          <Text style={styles.hint}>{t('chooseChapter')}</Text>
          <View style={styles.grid}>
            {Array.from({ length: info.chapters }, (_, i) => i + 1).map((n) => (
              <Pressable
                key={n}
                accessibilityRole="button"
                accessibilityLabel={t('chapter', { n })}
                onPress={() => open(n)}
                style={({ pressed }) => [styles.chapter, { opacity: pressed ? 0.7 : 1 }]}>
                <Text style={styles.chapterText}>{n}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : verses === null ? (
        <ActivityIndicator size="large" color={kidsColors.pink} />
      ) : (
        <>
          <PillButton
            label={speaking && reading === null ? t('stopListen') : t('listen')}
            color={kidsColors.blue}
            onPress={() => {
              setReading(null);
              toggle(verses.map((v) => v.text).join(' '));
            }}
          />
          <View style={{ gap: 12 }}>
            {verses.map((v) => (
              <Pressable
                key={v.verse}
                accessibilityRole="button"
                accessibilityLabel={`${v.verse}. ${v.text}`}
                onPress={() => {
                  setReading(v.verse);
                  toggle(v.text);
                }}
                style={[styles.verse, reading === v.verse && speaking && { borderColor: kidsColors.blue }]}>
                <Text style={styles.verseNumber}>{v.verse}</Text>
                <Text style={styles.verseText}>{v.text}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.row}>
            <PillButton label={t('prevChapter')} color={kidsColors.orange} disabled={chapter <= 1} onPress={() => open(chapter - 1)} style={{ flex: 1 }} textSize={17} />
            <PillButton
              label={t('nextChapter')}
              color={kidsColors.green}
              disabled={chapter >= info.chapters}
              onPress={() => open(chapter + 1)}
              style={{ flex: 1 }}
              textSize={17}
            />
          </View>
          <PillButton label={t('chooseChapter')} color={kidsColors.pink} active={false} onPress={() => {
              stop();
              setChapter(null);
            }} textSize={17} />
        </>
      )}
    </KidsScreen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: kidsFonts.bold, fontSize: 30, color: kidsColors.text },
  hint: { fontFamily: kidsFonts.bold, fontSize: 18, color: kidsColors.textMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chapter: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: kidsColors.pink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chapterText: { fontFamily: kidsFonts.bold, fontSize: 22, color: kidsColors.onColor },
  verse: {
    backgroundColor: kidsColors.card,
    borderRadius: kidsRadius.md,
    borderWidth: 3,
    borderColor: kidsColors.border,
    padding: 16,
    flexDirection: 'row',
    gap: 12,
  },
  verseNumber: { fontFamily: kidsFonts.bold, fontSize: 18, color: kidsColors.pink, minWidth: 24 },
  verseText: { flex: 1, fontFamily: kidsFonts.regular, fontSize: 21, lineHeight: 31, color: kidsColors.text },
  row: { flexDirection: 'row', gap: 12 },
});

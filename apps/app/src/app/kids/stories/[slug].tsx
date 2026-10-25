import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { KidsNotFound, KidsPreparing, kidsApi, type Story } from '@/kids/api';
import { useKidsProgress } from '@/kids/progress';
import { useSpeaker } from '@/kids/speak';
import { useKidsText } from '@/kids/strings';
import { kidsColors, kidsFonts, kidsRadius } from '@/kids/theme';
import { BackButton, KidsScreen, Mascot, PillButton } from '@/kids/ui';

/** Leitor de história: uma página por vez, letra grande, setas enormes. No fim, a lição e a passagem. */
export default function KidsStoryReader() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t, language } = useKidsText();
  const { level, markSeen } = useKidsProgress();
  const [story, setStory] = useState<Story | null>(null);
  const [error, setError] = useState<'missing' | 'failed' | 'preparing' | null>(null);
  const [page, setPage] = useState(0);
  const { speaking, toggle, stop } = useSpeaker(language);
  const { width } = useWindowDimensions();

  useEffect(() => {
    kidsApi
      .story(slug, language)
      .then(setStory)
      .catch((e) => setError(e instanceof KidsNotFound ? 'missing' : e instanceof KidsPreparing ? 'preparing' : 'failed'));
  }, [slug, language]);

  const total = story?.pages.length ?? 0;
  const atEnd = !!story && page >= total;

  useEffect(() => {
    if (atEnd) markSeen(slug);
  }, [atEnd, slug, markSeen]);

  // Virar a página para a voz que estava lendo
  useEffect(() => stop(), [page, stop]);

  // No computador, as setas do teclado também viram a página
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setPage((p) => Math.min(p + 1, total));
      if (e.key === 'ArrowLeft') setPage((p) => Math.max(p - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [total]);

  if (error || !story) {
    return (
      <KidsScreen>
        <BackButton to="/kids/stories" />
        {error ? <Mascot message={error === 'missing' ? t('noStories') : error === 'preparing' ? t('preparingLanguage') : t('loadError')} /> : <ActivityIndicator size="large" color={kidsColors.orange} />}
      </KidsScreen>
    );
  }

  // Celular: letra um pouco menor, para as setas caberem na tela
  const textSize = (level === 'small' ? 30 : 26) - (width < 500 ? 6 : 0);

  return (
    <KidsScreen>
      <BackButton to="/kids/stories" />
      <Text style={styles.title} accessibilityRole="header">
        {story.title}
      </Text>

      {atEnd ? (
        <View style={styles.page}>
          <Text style={styles.celebrate}>🎉⭐🎉</Text>
          <Text style={styles.endTitle}>{t('theEnd')}</Text>
          {story.lesson ? (
            <View style={styles.box}>
              <Text style={styles.boxTitle}>💡 {t('lesson')}</Text>
              <Text style={styles.boxText}>{story.lesson}</Text>
            </View>
          ) : null}
          {story.family_question ? (
            <View style={styles.box}>
              <Text style={styles.boxTitle}>👨‍👩‍👧 {t('talk')}</Text>
              <Text style={styles.boxText}>{story.family_question}</Text>
            </View>
          ) : null}
          <Text style={styles.reference}>📜 {t('inTheBible', { reference: story.reference })}</Text>
        </View>
      ) : (
        <View style={styles.page}>
          <Text style={[styles.pageText, { fontSize: textSize, lineHeight: textSize * 1.4 }]}>{story.pages[page].text}</Text>
        </View>
      )}
      {!atEnd ? (
        <PillButton
          label={speaking ? t('stopListen') : t('listen')}
          color={kidsColors.purple}
          active={!speaking}
          onPress={() => toggle(story.pages[page].text)}
        />
      ) : null}

      <View style={styles.dots} accessibilityLabel={t('pageOf', { n: Math.min(page + 1, total), total })}>
        {story.pages.map((_, i) => (
          <View key={i} style={[styles.dot, i === page && styles.dotActive, i < page && styles.dotDone]} />
        ))}
      </View>

      {atEnd ? (
        <View style={styles.nav}>
          <PillButton label={`🔁 ${t('readAgain')}`} color={kidsColors.blue} onPress={() => setPage(0)} style={{ flex: 1 }} />
          <PillButton label={`📖 ${t('moreStories')}`} color={kidsColors.orange} onPress={() => router.replace('/kids/stories')} style={{ flex: 1 }} />
        </View>
      ) : null}
      {atEnd && story.quiz.length ? (
        <PillButton label={t('doQuiz')} color={kidsColors.purple} onPress={() => router.push({ pathname: '/kids/quiz/[slug]', params: { slug } })} />
      ) : null}
      {!atEnd ? (
        <View style={styles.nav}>
          <PillButton
            label={'◀︎'}
            accessibilityLabel={t('previous')}
            textSize={40}
            color={kidsColors.blue}
            onPress={() => setPage((p) => Math.max(p - 1, 0))}
            disabled={page === 0}
            style={{ flex: 1, minHeight: 80 }}
          />
          <PillButton
            label={'▶︎'}
            accessibilityLabel={t('next')}
            textSize={40}
            color={kidsColors.green}
            onPress={() => setPage((p) => Math.min(p + 1, total))}
            style={{ flex: 2, minHeight: 80 }}
          />
        </View>
      ) : null}
    </KidsScreen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: kidsFonts.bold, fontSize: 28, lineHeight: 34, color: kidsColors.text, textAlign: 'center' },
  page: {
    backgroundColor: kidsColors.card,
    borderRadius: kidsRadius.lg,
    borderWidth: 3,
    borderColor: kidsColors.border,
    padding: 24,
    minHeight: 300,
    justifyContent: 'center',
    gap: 16,
  },
  pageText: { fontFamily: kidsFonts.bold, color: kidsColors.text, textAlign: 'center' },
  celebrate: { fontSize: 48, textAlign: 'center' },
  endTitle: { fontFamily: kidsFonts.bold, fontSize: 28, color: kidsColors.orange, textAlign: 'center' },
  box: { backgroundColor: kidsColors.bg, borderRadius: kidsRadius.md, padding: 16, gap: 6 },
  boxTitle: { fontFamily: kidsFonts.bold, fontSize: 18, color: kidsColors.purple },
  boxText: { fontFamily: kidsFonts.regular, fontSize: 20, lineHeight: 28, color: kidsColors.text },
  reference: { fontFamily: kidsFonts.regular, fontSize: 16, color: kidsColors.textMuted, textAlign: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 8 },
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: kidsColors.border },
  dotActive: { backgroundColor: kidsColors.orange, transform: [{ scale: 1.3 }] },
  dotDone: { backgroundColor: kidsColors.yellow },
  nav: { flexDirection: 'row', gap: 12 },
});

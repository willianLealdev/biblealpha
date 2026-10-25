import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { kidsApi, type StoryCard } from '@/kids/api';
import { useKidsProgress } from '@/kids/progress';
import { useKidsText } from '@/kids/strings';
import { kidsColors, kidsFonts, kidsRadius, tileColors } from '@/kids/theme';
import { BackButton, KidsScreen, Mascot } from '@/kids/ui';

/** Quiz: escolher uma história publicada que tenha perguntas. */
export default function KidsQuizList() {
  const { t, language } = useKidsText();
  const { level, ready } = useKidsProgress();
  const [stories, setStories] = useState<StoryCard[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!ready) return;
    kidsApi
      .stories(language, level)
      .then((r) => setStories(r.stories.filter((s) => s.quiz > 0)))
      .catch(() => setFailed(true));
  }, [ready, language, level]);

  return (
    <KidsScreen>
      <BackButton />
      <Text style={styles.title} accessibilityRole="header">
        ❓ {t('quizTitle')}
      </Text>
      {failed ? (
        <Mascot message={t('loadError')} />
      ) : stories === null ? (
        <ActivityIndicator size="large" color={kidsColors.purple} />
      ) : !stories.length ? (
        <Mascot message={t('noQuiz')} />
      ) : (
        <>
          <Text style={styles.hint}>{t('quizPick')}</Text>
          <View style={styles.grid}>
            {stories.map((s, i) => (
              <Pressable
                key={s.slug}
                accessibilityRole="button"
                accessibilityLabel={s.title}
                onPress={() => router.push({ pathname: '/kids/quiz/[slug]', params: { slug: s.slug } })}
                style={({ pressed }) => [styles.tile, { backgroundColor: tileColors[i % tileColors.length], opacity: pressed ? 0.85 : 1 }]}>
                <Text style={styles.tileTitle}>{s.title}</Text>
                <Text style={styles.tileMeta}>{t('questions', { n: s.quiz })}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </KidsScreen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: kidsFonts.bold, fontSize: 30, color: kidsColors.text },
  hint: { fontFamily: kidsFonts.bold, fontSize: 20, color: kidsColors.textMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { flexBasis: '46%', flexGrow: 1, minWidth: 150, minHeight: 120, borderRadius: kidsRadius.lg, padding: 16, justifyContent: 'center', gap: 6 },
  tileTitle: { fontFamily: kidsFonts.bold, fontSize: 20, lineHeight: 26, color: kidsColors.onColor, textAlign: 'center' },
  tileMeta: { fontFamily: kidsFonts.regular, fontSize: 14, color: kidsColors.onColor, textAlign: 'center' },
});

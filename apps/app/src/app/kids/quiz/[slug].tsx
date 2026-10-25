import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';

import { KidsPreparing, kidsApi, type Story } from '@/kids/api';
import { QuizGame } from '@/kids/quiz-game';
import { useKidsText } from '@/kids/strings';
import { kidsColors, kidsFonts } from '@/kids/theme';
import { BackButton, KidsScreen, Mascot } from '@/kids/ui';

/** Quiz de uma história. */
export default function KidsQuiz() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t, language } = useKidsText();
  const [story, setStory] = useState<Story | null>(null);
  const [failed, setFailed] = useState<'preparing' | 'failed' | null>(null);

  useEffect(() => {
    kidsApi
      .story(slug, language)
      .then(setStory)
      .catch((e) => setFailed(e instanceof KidsPreparing ? 'preparing' : 'failed'));
  }, [slug, language]);

  return (
    <KidsScreen>
      <BackButton to="/kids/quiz" />
      {failed ? (
        <Mascot message={failed === 'preparing' ? t('preparingLanguage') : t('loadError')} />
      ) : !story ? (
        <ActivityIndicator size="large" color={kidsColors.purple} />
      ) : (
        <>
          <Text style={styles.title} accessibilityRole="header">
            {story.title}
          </Text>
          {story.quiz.length ? (
            <QuizGame questions={story.quiz} onExit={() => (router.canGoBack() ? router.back() : router.replace('/kids/quiz'))} />
          ) : (
            <Mascot message={t('noQuiz')} />
          )}
        </>
      )}
    </KidsScreen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: kidsFonts.bold, fontSize: 26, lineHeight: 32, color: kidsColors.text, textAlign: 'center' },
});

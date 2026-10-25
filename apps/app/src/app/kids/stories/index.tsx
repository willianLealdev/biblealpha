import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { kidsApi, type StoryCard } from '@/kids/api';
import { useKidsProgress } from '@/kids/progress';
import { useKidsText } from '@/kids/strings';
import { kidsColors, kidsFonts, kidsRadius, tileColors } from '@/kids/theme';
import { BackButton, KidsScreen, Mascot, PillButton } from '@/kids/ui';

/** Histórias publicadas do nível escolhido (Pequenos ou Grandes). */
export default function KidsStories() {
  const { t, language } = useKidsText();
  const { level, seen, ready } = useKidsProgress();
  const [stories, setStories] = useState<StoryCard[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [preparing, setPreparing] = useState(0);

  useEffect(() => {
    if (!ready) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    kidsApi
      .stories(language, level)
      .then((r) => {
        setStories(r.stories);
        setPreparing(r.preparing);
        // Primeira vez nesse idioma: as histórias estão sendo traduzidas; confere de novo daqui a pouco
        if (r.preparing) timer = setTimeout(() => setAttempt((n) => n + 1), 15_000);
      })
      .catch(() => setFailed(true));
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [ready, language, level, attempt]);

  const retry = () => {
    setFailed(false);
    setStories(null);
    setAttempt((n) => n + 1);
  };

  return (
    <KidsScreen>
      <BackButton />
      <Text style={styles.title} accessibilityRole="header">
        📖 {t('storiesTitle')}
      </Text>
      {failed ? (
        <View style={{ gap: 12 }}>
          <Mascot message={t('loadError')} />
          <PillButton label={t('tryAgain')} onPress={retry} />
        </View>
      ) : stories === null ? (
        <ActivityIndicator size="large" color={kidsColors.orange} />
      ) : !stories.length ? (
        <Mascot message={preparing ? t('preparingLanguage') : t('noStories')} />
      ) : (
        <View style={styles.list}>
          {preparing ? <Mascot message={t('preparingLanguage')} /> : null}
          {stories.map((s, i) => {
            const color = tileColors[i % tileColors.length];
            const done = seen.includes(s.slug);
            return (
              <Pressable
                key={s.slug}
                accessibilityRole="button"
                accessibilityLabel={done ? `${s.title}, ${t('seen')}` : s.title}
                onPress={() => router.push({ pathname: '/kids/stories/[slug]', params: { slug: s.slug } })}
                style={({ pressed }) => [styles.card, { borderColor: color, opacity: pressed ? 0.85 : 1 }]}>
                <View style={[styles.stripe, { backgroundColor: color }]}>
                  <Text style={styles.stripeEmoji}>{done ? '⭐' : '📖'}</Text>
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle}>{s.title}</Text>
                  {s.summary ? <Text style={styles.cardSummary}>{s.summary}</Text> : null}
                  <Text style={styles.cardMeta}>
                    {s.reference} · {t('pages', { n: s.pages })}
                    {done ? ` · ${t('seen')}` : ''}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </KidsScreen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: kidsFonts.bold, fontSize: 30, color: kidsColors.text },
  list: { gap: 14 },
  card: {
    flexDirection: 'row',
    backgroundColor: kidsColors.card,
    borderRadius: kidsRadius.lg,
    borderWidth: 3,
    overflow: 'hidden',
    minHeight: 110,
  },
  stripe: { width: 84, alignItems: 'center', justifyContent: 'center' },
  stripeEmoji: { fontSize: 40, lineHeight: 50 },
  cardBody: { flex: 1, padding: 14, gap: 4, justifyContent: 'center' },
  cardTitle: { fontFamily: kidsFonts.bold, fontSize: 22, lineHeight: 28, color: kidsColors.text },
  cardSummary: { fontFamily: kidsFonts.regular, fontSize: 16, lineHeight: 22, color: kidsColors.text },
  cardMeta: { fontFamily: kidsFonts.regular, fontSize: 14, color: kidsColors.textMuted },
});

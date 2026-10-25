import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { kidsApi, type VideoCard } from '@/kids/api';
import { useKidsProgress } from '@/kids/progress';
import { useKidsText } from '@/kids/strings';
import { kidsColors, kidsFonts, kidsRadius, tileColors } from '@/kids/theme';
import { BackButton, KidsScreen, Mascot } from '@/kids/ui';

/** Vídeos publicados pelo administrador (do nível escolhido). */
export default function KidsVideos() {
  const { t, language } = useKidsText();
  const { level, ready } = useKidsProgress();
  const [videos, setVideos] = useState<VideoCard[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!ready) return;
    kidsApi
      .videos(language, level)
      .then(setVideos)
      .catch(() => setFailed(true));
  }, [ready, language, level]);

  return (
    <KidsScreen>
      <BackButton />
      <Text style={styles.title} accessibilityRole="header">
        🎬 {t('videosTitle')}
      </Text>
      {failed ? (
        <Mascot message={t('loadError')} />
      ) : videos === null ? (
        <ActivityIndicator size="large" color={kidsColors.yellow} />
      ) : !videos.length ? (
        <Mascot message={t('noVideos')} />
      ) : (
        <View style={styles.grid}>
          {videos.map((v, i) => (
            <Pressable
              key={v.id}
              accessibilityRole="button"
              accessibilityLabel={v.title}
              onPress={() => router.push({ pathname: '/kids/videos/[id]', params: { id: v.id } })}
              style={({ pressed }) => [styles.card, { borderColor: tileColors[i % tileColors.length], opacity: pressed ? 0.85 : 1 }]}>
              <View style={[styles.thumb, { backgroundColor: tileColors[i % tileColors.length] }]}>
                {v.has_poster ? (
                  <View style={StyleSheet.absoluteFill}>
                    <Image source={{ uri: kidsApi.posterUrl(v.id) }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  </View>
                ) : null}
                <View style={styles.play}>
                  <Text style={styles.playIcon}>▶︎</Text>
                </View>
              </View>
              <Text style={styles.cardTitle}>{v.title}</Text>
              {v.description ? <Text style={styles.cardText}>{v.description}</Text> : null}
            </Pressable>
          ))}
        </View>
      )}
    </KidsScreen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: kidsFonts.bold, fontSize: 30, color: kidsColors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  card: {
    flexBasis: '46%',
    flexGrow: 1,
    minWidth: 240,
    backgroundColor: kidsColors.card,
    borderRadius: kidsRadius.lg,
    borderWidth: 3,
    overflow: 'hidden',
    paddingBottom: 12,
    gap: 6,
  },
  thumb: { aspectRatio: 16 / 9, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  play: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: { fontSize: 32, color: kidsColors.orange, marginLeft: 6 },
  cardTitle: { fontFamily: kidsFonts.bold, fontSize: 20, color: kidsColors.text, paddingHorizontal: 14 },
  cardText: { fontFamily: kidsFonts.regular, fontSize: 15, color: kidsColors.textMuted, paddingHorizontal: 14 },
});

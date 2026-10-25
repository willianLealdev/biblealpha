import { useLocalSearchParams } from 'expo-router';
import { createElement } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { kidsApi } from '@/kids/api';
import { useKidsText } from '@/kids/strings';
import { kidsColors, kidsRadius } from '@/kids/theme';
import { BackButton, KidsScreen, Mascot } from '@/kids/ui';

/** Player do vídeo. No site usa o player do navegador (com tela cheia); nos apps chega na Etapa 7. */
export default function KidsVideo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useKidsText();

  return (
    <KidsScreen>
      <BackButton to="/kids/videos" />
      {Platform.OS === 'web' ? (
        <View style={styles.frame}>
          {createElement('video', {
            src: kidsApi.videoUrl(id),
            poster: kidsApi.posterUrl(id),
            controls: true,
            autoPlay: true,
            playsInline: true,
            // Sem baixar nem abrir em outro lugar: a criança só assiste
            controlsList: 'nodownload noremoteplayback',
            disablePictureInPicture: true,
            onContextMenu: (e: Event) => e.preventDefault(),
            style: { width: '100%', height: '100%', backgroundColor: '#000', borderRadius: 20 },
          })}
        </View>
      ) : (
        <Mascot message={t('videosWebOnly')} />
      )}
    </KidsScreen>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    borderRadius: kidsRadius.lg,
    borderWidth: 4,
    borderColor: kidsColors.yellow,
    overflow: 'hidden',
  },
});

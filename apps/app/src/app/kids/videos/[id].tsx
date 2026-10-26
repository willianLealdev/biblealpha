import { requireOptionalNativeModule } from 'expo';
import { useLocalSearchParams } from 'expo-router';
import { type ComponentType, createElement } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { kidsApi } from '@/kids/api';
import { useKidsText } from '@/kids/strings';
import { kidsColors, kidsRadius } from '@/kids/theme';
import { BackButton, KidsScreen, Mascot } from '@/kids/ui';

// Apps: o player só é carregado se o app já tiver o módulo de vídeo (app antigo mostra o aviso)
const NativeVideo: ComponentType<{ uri: string }> | null =
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Platform.OS !== 'web' && requireOptionalNativeModule('ExpoVideo') ? require('@/kids/native-video').default : null;

/** Player do vídeo. No site usa o player do navegador (com tela cheia); nos apps, o expo-video. */
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
      ) : NativeVideo ? (
        <View style={styles.frame}>
          <NativeVideo uri={kidsApi.videoUrl(id)} />
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

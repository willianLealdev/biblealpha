// Player dos vídeos do Kids nos apps (expo-video). Aberto só quando o app já tem o módulo:
// ver app/kids/videos/[id].tsx.

import { useVideoPlayer, VideoView } from 'expo-video';
import { StyleSheet } from 'react-native';

export default function NativeVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => p.play());
  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="contain"
      nativeControls
      allowsPictureInPicture={false}
      fullscreenOptions={{ enable: true }}
    />
  );
}

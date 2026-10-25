// Pôster vertical estilo streaming: imagem (ou degradê) com o título grande por cima.

import { Image } from 'expo-image';
import { useId } from 'react';
import { Pressable, Text as RNText, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { LinearGradientBg } from '@/components/gradient-bg';
import { useTheme } from '@/theme';
import { fonts, radius } from '@/theme/tokens';

type Props = {
  title: string;
  subtitle?: string;
  image?: string | null;
  colors: [string, string];
  width: number;
  badge?: string;
  progress?: number;
  onPress: () => void;
};

export function Poster({ title, subtitle, image, colors, width, badge, progress, onPress }: Props) {
  const theme = useTheme();
  const height = Math.round(width * 1.5);
  // O título diminui até a palavra mais longa caber inteira numa linha (sem partir a palavra)
  const longest = Math.max(...title.split(/\s+/).map((w) => w.length), 4);
  const size = Math.max(11, Math.min(28, (width - 14) / (longest * 0.72), (width * 1.6) / Math.max(4, title.length)));
  const shade = `shade${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      onPress={onPress}
      style={({ pressed }) => ({
        width,
        height,
        borderRadius: radius.md,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}>
      {image ? (
        <Image source={{ uri: image }} style={{ position: 'absolute', width: '100%', height: '100%' }} contentFit="cover" transition={200} />
      ) : (
        <LinearGradientBg colors={colors} />
      )}
      {/* Escurece a parte de baixo para o título aparecer */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: height * 0.62 }} pointerEvents="none">
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id={shade} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#000" stopOpacity="0" />
              <Stop offset="1" stopColor="#000" stopOpacity="0.88" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${shade})`} />
        </Svg>
      </View>
      {badge ? (
        <View style={{ position: 'absolute', top: 0, right: 8, backgroundColor: '#E50914', paddingHorizontal: 5, paddingVertical: 3, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 }}>
          <RNText style={{ color: '#fff', fontFamily: fonts.bodyBold, fontSize: 9, textAlign: 'center' }}>{badge}</RNText>
        </View>
      ) : null}
      <View style={{ position: 'absolute', left: 6, right: 6, bottom: progress !== undefined ? 16 : 12, alignItems: 'center' }}>
        <RNText
          numberOfLines={3}
          style={{
            color: '#fff',
            fontFamily: fonts.bodyBold,
            fontSize: size,
            letterSpacing: size > 20 ? 1.5 : 0.5,
            textAlign: 'center',
            textTransform: 'uppercase',
            textShadowColor: 'rgba(0,0,0,0.7)',
            textShadowRadius: 6,
          }}>
          {title}
        </RNText>
        {subtitle ? (
          <RNText
            numberOfLines={2}
            style={{ color: '#f2e6c9', fontFamily: 'Literata_400Regular', fontStyle: 'italic', fontSize: 11, textAlign: 'center', marginTop: 2 }}>
            {subtitle}
          </RNText>
        ) : null}
      </View>
      {progress !== undefined ? (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, backgroundColor: 'rgba(255,255,255,0.25)' }}>
          <View style={{ width: `${Math.round(progress * 100)}%`, height: 4, backgroundColor: theme.colors.gold }} />
        </View>
      ) : null}
    </Pressable>
  );
}

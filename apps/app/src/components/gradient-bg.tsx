// Fundo em degradê (SVG), ocupando todo o espaço do pai.

import { useId } from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

export function LinearGradientBg({ colors }: { colors: string[] }) {
  const [a, b] = [colors[0] ?? '#1B1408', colors[1] ?? colors[0] ?? '#0A0806'];
  // Id único: no site, vários degradês com o mesmo id usariam todos a cor do primeiro
  const id = `bg${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none">
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={a} />
            <Stop offset="1" stopColor={b} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

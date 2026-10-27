// Comemoração de vitória: estrelas que pulam, confete na tela inteira e som de vitória.

import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { useConfetti } from './confetti';
import { kidsColors, kidsFonts, kidsRadius } from './theme';
import { victory } from './tones';

export function Celebrate({ title, subtitle }: { title: string; subtitle?: string }) {
  const [scale] = useState(() => new Animated.Value(0.3));
  const confetti = useConfetti();
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }).start();
    confetti();
    victory();
  }, [scale, confetti]);
  return (
    <View style={styles.box} accessibilityLiveRegion="polite">
      <Animated.Text style={[styles.stars, { transform: [{ scale }] }]}>🎉⭐🎉</Animated.Text>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: kidsColors.card,
    borderRadius: kidsRadius.lg,
    borderWidth: 3,
    borderColor: kidsColors.yellow,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  stars: { fontSize: 52 },
  title: { fontFamily: kidsFonts.bold, fontSize: 26, color: kidsColors.orange, textAlign: 'center' },
  subtitle: { fontFamily: kidsFonts.regular, fontSize: 18, color: kidsColors.text, textAlign: 'center' },
});

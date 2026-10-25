// Comemoração curta: estrelas que pulam na tela.

import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { kidsColors, kidsFonts, kidsRadius } from './theme';

export function Celebrate({ title, subtitle }: { title: string; subtitle?: string }) {
  const [scale] = useState(() => new Animated.Value(0.3));
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }).start();
  }, [scale]);
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

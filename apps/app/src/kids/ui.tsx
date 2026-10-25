// Peças visuais do BibleAlpha Kids: botões enormes, mascote e tela com fundo alegre.

import { type Href, router } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useKidsText } from './strings';
import { kidsColors, kidsFonts, kidsRadius } from './theme';

export function KidsScreen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const inner = <View style={styles.content}>{children}</View>;
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      {scroll ? <ScrollView contentContainerStyle={styles.scroll}>{inner}</ScrollView> : <View style={[styles.scroll, { flex: 1 }]}>{inner}</View>}
    </SafeAreaView>
  );
}

/** Pulinho ao tocar: resposta visual imediata para quem ainda não lê. */
function useBounce() {
  const [scale] = useState(() => new Animated.Value(1));
  const bounce = () =>
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.9, duration: 80, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 3, useNativeDriver: true }),
    ]).start();
  return { scale, bounce };
}

export function Mascot({ message, onPress }: { message: string; onPress?: () => void }) {
  const { scale, bounce } = useBounce();
  return (
    <View style={styles.mascotRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Leãozinho"
        onPress={() => {
          bounce();
          onPress?.();
        }}>
        <Animated.View style={[styles.mascot, { transform: [{ scale }] }]}>
          <Text style={styles.mascotFace}>🦁</Text>
        </Animated.View>
      </Pressable>
      <View style={styles.bubble}>
        <Text style={styles.bubbleText} accessibilityLiveRegion="polite">
          {message}
        </Text>
      </View>
    </View>
  );
}

export function BigTile({
  emoji,
  label,
  color,
  onPress,
  badge,
  dimmed,
}: {
  emoji: string;
  label: string;
  color: string;
  onPress: () => void;
  badge?: string;
  dimmed?: boolean;
}) {
  const { scale, bounce } = useBounce();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badge}` : label}
      onPress={() => {
        bounce();
        onPress();
      }}
      style={styles.tileWrap}>
      <Animated.View style={[styles.tile, { backgroundColor: color, opacity: dimmed ? 0.55 : 1, transform: [{ scale }] }]}>
        <Text style={styles.tileEmoji}>{emoji}</Text>
        <Text style={styles.tileLabel}>{label}</Text>
        {badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

export function PillButton({
  label,
  onPress,
  color = kidsColors.blue,
  active = true,
  style,
  disabled,
  accessibilityLabel,
  textSize = 20,
}: {
  label: string;
  onPress: () => void;
  color?: string;
  active?: boolean;
  style?: ViewStyle;
  disabled?: boolean;
  accessibilityLabel?: string;
  textSize?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: active, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        {
          backgroundColor: active ? color : kidsColors.card,
          borderColor: color,
          opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
        },
        style,
      ]}>
      <Text style={[styles.pillText, { fontSize: textSize, lineHeight: textSize * 1.25, color: active ? kidsColors.onColor : color }]}>{label}</Text>
    </Pressable>
  );
}

export function BackButton({ to = '/kids' }: { to?: Href }) {
  const { t } = useKidsText();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('back')}
      onPress={() => (router.canGoBack() ? router.back() : router.replace(to))}
      hitSlop={12}
      style={({ pressed }) => [styles.back, { opacity: pressed ? 0.7 : 1 }]}>
      <Text style={styles.backText}>⬅️ {t('back')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: kidsColors.bg },
  scroll: { flexGrow: 1, paddingHorizontal: 16, paddingVertical: 20 },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: 18 },
  mascotRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mascot: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: kidsColors.yellow,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: kidsColors.card,
  },
  mascotFace: { fontSize: 58, lineHeight: 70 },
  bubble: {
    flex: 1,
    backgroundColor: kidsColors.card,
    borderRadius: kidsRadius.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderColor: kidsColors.border,
  },
  bubbleText: { fontFamily: kidsFonts.bold, fontSize: 20, lineHeight: 26, color: kidsColors.text },
  tileWrap: { flexBasis: '46%', flexGrow: 1, minWidth: 140 },
  tile: {
    minHeight: 150,
    borderRadius: kidsRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    gap: 6,
  },
  tileEmoji: { fontSize: 54, lineHeight: 64 },
  tileLabel: { fontFamily: kidsFonts.bold, fontSize: 24, color: kidsColors.onColor, textAlign: 'center' },
  badge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: kidsColors.card,
    borderRadius: kidsRadius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: { fontFamily: kidsFonts.bold, fontSize: 13, color: kidsColors.text },
  pill: {
    minHeight: 56,
    borderRadius: kidsRadius.pill,
    borderWidth: 3,
    paddingHorizontal: 22,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: { fontFamily: kidsFonts.bold, fontSize: 20, textAlign: 'center' },
  back: { alignSelf: 'flex-start', paddingVertical: 6 },
  backText: { fontFamily: kidsFonts.bold, fontSize: 20, color: kidsColors.text },
});

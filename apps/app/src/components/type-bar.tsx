// Tamanho da letra dos textos de leitura (devocional, plano). É a mesma preferência da leitura da Bíblia:
// mudou num lugar, vale em todos.

import { Pressable, Text as RNText, View } from 'react-native';

import { useI18n } from '@/i18n';
import { meApi } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme';
import { fonts, radius } from '@/theme/tokens';

const MIN = 0.8;
const MAX = 2;

export function useReadingType() {
  const { user, setUser } = useSession();
  const scale = Number(user?.preferences.font_scale ?? 1);
  const lineHeight = Number(user?.preferences.line_height ?? 1.6);
  function setScale(next: number) {
    const font_scale = Math.max(MIN, Math.min(MAX, +next.toFixed(2)));
    if (!user) return;
    setUser({ ...user, preferences: { ...user.preferences, font_scale } });
    meApi.updatePreferences({ font_scale }).catch(() => {});
  }
  return { scale, lineHeight, setScale };
}

/** Linha "A−  120%  A+" para aumentar ou diminuir a letra do texto abaixo. */
export function TypeBar({ scale, onChange }: { scale: number; onChange: (next: number) => void }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const step = (label: string, delta: number, a11y: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={() => onChange(scale + delta)}
      style={({ pressed }) => ({
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: pressed ? colors.surface : colors.surfaceAlt,
      })}>
      <RNText style={{ color: colors.text, fontFamily: fonts.bodyBold, fontSize: 16 }}>{label}</RNText>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
      <RNText style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13 }}>{t('bible.fontSize')}</RNText>
      {step('A−', -0.1, t('journey.smaller'))}
      <RNText style={{ color: colors.textMuted, fontFamily: fonts.bodyMedium, fontSize: 13, minWidth: 40, textAlign: 'center' }}>
        {Math.round(scale * 100)}%
      </RNText>
      {step('A+', 0.1, t('journey.bigger'))}
    </View>
  );
}

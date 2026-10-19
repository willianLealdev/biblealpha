// Escolha de data (calendário do mês) e horário, igual no celular e no navegador.

import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, Text as RNText, View } from 'react-native';

import { Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';
import { fonts, radius } from '@/theme/tokens';

const pad = (n: number) => String(n).padStart(2, '0');
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function DatePicker({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const { locale } = useI18n();
  const { colors } = useTheme();
  const selected = new Date(`${value}T12:00:00`);
  const [month, setMonth] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1));
  const today = isoDate(new Date());

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first.getDay()).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  // Domingo a sábado, no idioma do app
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2024, 8, 1 + i).toLocaleDateString(locale, { weekday: 'narrow' }));

  const title = month.toLocaleDateString(locale, { month: 'long', year: 'numeric' });

  function move(delta: number) {
    setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1));
  }

  return (
    <View style={{ gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 10, backgroundColor: colors.surface }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="‹" onPress={() => move(-1)} hitSlop={10} style={{ padding: 6 }}>
          <Ionicons name="chevron-back" size={20} color={colors.gold} />
        </Pressable>
        <Text variant="heading" style={{ flex: 1, textAlign: 'center' }}>
          {title.charAt(0).toUpperCase() + title.slice(1)}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="›" onPress={() => move(1)} hitSlop={10} style={{ padding: 6 }}>
          <Ionicons name="chevron-forward" size={20} color={colors.gold} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row' }}>
        {weekdays.map((w, i) => (
          <RNText key={i} style={{ flex: 1, textAlign: 'center', color: colors.textMuted, fontFamily: fonts.bodyMedium, fontSize: 12 }}>
            {w}
          </RNText>
        ))}
      </View>
      {Array.from({ length: cells.length / 7 }, (_, row) => (
        <View key={row} style={{ flexDirection: 'row' }}>
          {cells.slice(row * 7, row * 7 + 7).map((day, i) => {
            if (!day) return <View key={i} style={{ flex: 1, height: 40 }} />;
            const iso = isoDate(new Date(month.getFullYear(), month.getMonth(), day));
            const active = iso === value;
            return (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={new Date(`${iso}T12:00:00`).toLocaleDateString(locale, { dateStyle: 'full' })}
                onPress={() => onChange(iso)}
                style={{ flex: 1, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: active ? colors.gold : 'transparent',
                    borderWidth: iso === today && !active ? 1 : 0,
                    borderColor: colors.gold,
                  }}>
                  <RNText style={{ color: active ? colors.onGold : iso < today ? colors.textMuted : colors.text, fontFamily: active ? fonts.bodyBold : fonts.body }}>{day}</RNText>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export function TimePicker({ value, onChange }: { value: string; onChange: (hhmm: string) => void }) {
  const { colors } = useTheme();
  const [h, m] = value.split(':').map(Number);
  const set = (hh: number, mm: number) => onChange(`${pad((hh + 24) % 24)}:${pad((mm + 60) % 60)}`);
  const step = (label: string, onPress: () => void, icon: 'chevron-up' | 'chevron-down') => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6} style={{ padding: 6 }}>
      <Ionicons name={icon} size={22} color={colors.gold} />
    </Pressable>
  );
  const box = { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 30, minWidth: 54, textAlign: 'center' as const, fontVariant: ['tabular-nums' as const] };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 8, backgroundColor: colors.surface }}>
      <View style={{ alignItems: 'center' }}>
        {step('+1h', () => set(h + 1, m), 'chevron-up')}
        <RNText style={box}>{pad(h)}</RNText>
        {step('-1h', () => set(h - 1, m), 'chevron-down')}
      </View>
      <RNText style={box}>:</RNText>
      <View style={{ alignItems: 'center' }}>
        {step('+5min', () => set(h, m + 5 - (m % 5)), 'chevron-up')}
        <RNText style={box}>{pad(m)}</RNText>
        {step('-5min', () => set(h, m % 5 ? m - (m % 5) : m - 5), 'chevron-down')}
      </View>
    </View>
  );
}

import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';
import { fonts, maxContentWidth, radius, space } from '@/theme/tokens';

// ---------- Texto ----------

// A Cormorant usa algarismos antigos por padrão (o "1" parece "I"); números de capítulo precisam dos modernos
export const LINING: ('lining-nums')[] = ['lining-nums'];

type Variant = 'display' | 'title' | 'heading' | 'body' | 'muted' | 'small' | 'label';

export function Text({ variant = 'body', style, ...props }: TextProps & { variant?: Variant }) {
  const { colors } = useTheme();
  const base = {
    display: { fontFamily: fonts.displayBold, fontSize: 34, lineHeight: 40, color: colors.text, fontVariant: LINING },
    title: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34, color: colors.text, fontVariant: LINING },
    heading: { fontFamily: fonts.bodyBold, fontSize: 17, lineHeight: 24, color: colors.text },
    body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: colors.text },
    muted: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textMuted },
    small: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textMuted },
    label: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20, color: colors.text },
  }[variant];
  return <RNText {...props} style={[base, style]} />;
}

// ---------- Layout ----------

export function Screen({
  children,
  scroll = true,
  center = false,
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  center?: boolean;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  const inner = (
    <View style={[styles.content, center && styles.center, style]}>{children}</View>
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={[styles.scroll, center && { flexGrow: 1, justifyContent: 'center' }]}
            keyboardShouldPersistTaps="handled">
            {inner}
          </ScrollView>
        ) : (
          <View style={[styles.scroll, { flex: 1 }]}>{inner}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>
      {children}
    </View>
  );
}

export function Gap({ size = 'md' }: { size?: keyof typeof space }) {
  return <View style={{ height: space[size] }} />;
}

// ---------- Marca ----------

/** Logo oficial completo (selo + nome + tagline), na versão do tema atual. */
export function Logo({ size = 220 }: { size?: number }) {
  const { name } = useTheme();
  const source =
    name === 'dark' ? require('@/assets/images/logo-dark.png') : require('@/assets/images/logo-light.png');
  return (
    <Image
      source={source}
      style={{ width: size, height: size, alignSelf: 'center' }}
      contentFit="contain"
      accessibilityLabel="BibleAlpha"
    />
  );
}

export function Seal({ size = 72 }: { size?: number }) {
  return (
    <Image
      source={require('@/assets/images/seal.png')}
      style={{ width: size, height: size * (704 / 750) }}
      contentFit="contain"
      accessibilityLabel="BibleAlpha"
    />
  );
}

// ---------- Botões ----------

type ButtonProps = {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  icon?: ComponentProps<typeof Ionicons>['name'];
};

export function Button({ title, onPress, kind = 'primary', loading, disabled, icon }: ButtonProps) {
  const { colors } = useTheme();
  const palette = {
    primary: { bg: colors.gold, fg: colors.onGold, border: colors.gold },
    secondary: { bg: 'transparent', fg: colors.text, border: colors.border },
    ghost: { bg: 'transparent', fg: colors.gold, border: 'transparent' },
    danger: { bg: colors.danger, fg: '#FFFFFF', border: colors.danger },
  }[kind];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: inactive ? 0.6 : pressed ? 0.85 : 1 },
      ]}>
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <View style={styles.buttonInner}>
          {icon ? <Ionicons name={icon} size={18} color={palette.fg} /> : null}
          <RNText style={[styles.buttonText, { color: palette.fg }]}>{title}</RNText>
        </View>
      )}
    </Pressable>
  );
}

export function LinkText({ children, onPress }: { children: ReactNode; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <RNText
      accessibilityRole="link"
      onPress={onPress}
      style={{ color: colors.gold, fontFamily: fonts.bodyMedium, fontSize: 15 }}>
      {children}
    </RNText>
  );
}

// ---------- Formulário ----------

export function TextField({
  label,
  error,
  hint,
  secure,
  ...props
}: TextInputProps & { label: string; error?: string | null; hint?: string; secure?: boolean }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [hidden, setHidden] = useState(true);
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: space.xs }}>
      <Text variant="label">{label}</Text>
      <View
        style={[
          styles.input,
          {
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : focused ? colors.gold : colors.border,
          },
        ]}>
        <TextInput
          {...props}
          accessibilityLabel={label}
          secureTextEntry={secure && hidden}
          placeholderTextColor={colors.textMuted}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          style={[styles.inputText, { color: colors.text }, props.style]}
        />
        {secure ? (
          <Pressable
            onPress={() => setHidden((h) => !h)}
            accessibilityRole="button"
            accessibilityLabel={hidden ? t('common.showPassword') : t('common.hidePassword')}
            hitSlop={12}>
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text variant="small" style={{ color: colors.danger }}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="small">{hint}</Text>
      ) : null}
    </View>
  );
}

export function Checkbox({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={() => onChange(!checked)}
      style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
      <View
        style={[
          styles.checkbox,
          { borderColor: checked ? colors.gold : colors.border, backgroundColor: checked ? colors.gold : 'transparent' },
        ]}>
        {checked ? <Ionicons name="checkmark" size={16} color={colors.onGold} /> : null}
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </Pressable>
  );
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'error' | 'success'; children: ReactNode }) {
  const { colors } = useTheme();
  const tone = { info: colors.gold, error: colors.danger, success: colors.success }[kind];
  return (
    <View
      accessibilityRole={kind === 'error' ? 'alert' : undefined}
      style={[styles.notice, { borderColor: tone, backgroundColor: colors.surfaceAlt }]}>
      <Text variant="body" style={{ fontSize: 15 }}>
        {children}
      </Text>
    </View>
  );
}

// ---------- Listas ----------

export function ListItem({
  icon,
  title,
  subtitle,
  onPress,
  danger,
  right,
}: {
  icon?: ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle?: string;
  onPress?: () => void;
  danger?: boolean;
  right?: ReactNode;
}) {
  const { colors } = useTheme();
  const color = danger ? colors.danger : colors.text;
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.listItem, { opacity: pressed ? 0.7 : 1 }]}>
      {icon ? <Ionicons name={icon} size={22} color={danger ? colors.danger : colors.gold} /> : null}
      <View style={{ flex: 1 }}>
        <Text variant="body" style={{ color }}>
          {title}
        </Text>
        {subtitle ? <Text variant="small">{subtitle}</Text> : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null)}
    </Pressable>
  );
}

export function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, active && { backgroundColor: colors.gold }]}>
            <RNText style={{ fontFamily: fonts.bodyMedium, fontSize: 14, color: active ? colors.onGold : colors.text }}>
              {o.label}
            </RNText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: space.md, paddingVertical: space.lg },
  content: { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center', gap: space.md },
  center: { justifyContent: 'center' },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: space.md, gap: space.sm },
  button: {
    minHeight: 50,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  buttonText: { fontFamily: fonts.bodyBold, fontSize: 16 },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  inputText: { flex: 1, fontFamily: fonts.body, fontSize: 16, paddingVertical: 12 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  notice: { borderLeftWidth: 3, borderRadius: radius.sm, padding: space.md },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 14 },
  segmented: { flexDirection: 'row', borderRadius: radius.pill, borderWidth: 1, padding: 3 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.pill },
});

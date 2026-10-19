// Navegação comum a todas as telas: o menu de baixo (mesmas abas do app) e o botão voltar.

import Ionicons from '@expo/vector-icons/Ionicons';
import { router, usePathname, useSegments } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, Text as RNText, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';
import { fonts } from '@/theme/tokens';

type IconName = ComponentProps<typeof Ionicons>['name'];
export type TabKey = 'home' | 'bible' | 'study' | 'devotional' | 'sermons' | 'library' | 'profile';

// A Biblioteca não aparece no menu (fica como atalho na tela Início)
export const TABS: { name: string; href: string; label: TabKey; icon: IconName; hidden?: boolean }[] = [
  { name: 'home', href: '/home', label: 'home', icon: 'home-outline' },
  { name: 'index', href: '/', label: 'bible', icon: 'book-outline' },
  { name: 'study', href: '/study', label: 'study', icon: 'sparkles-outline' },
  { name: 'devotional', href: '/devotional', label: 'devotional', icon: 'sunny-outline' },
  { name: 'sermons', href: '/sermons', label: 'sermons', icon: 'mic-outline' },
  { name: 'library', href: '/library', label: 'library', icon: 'library-outline', hidden: true },
  { name: 'profile', href: '/profile', label: 'profile', icon: 'person-circle-outline' },
];

/** A qual aba pertence uma tela interna (para destacar no menu). */
function tabFor(section: string | undefined): TabKey {
  switch (section) {
    case 'bible':
      return 'bible';
    case 'devotionals':
      return 'devotional';
    case 'sermon':
    case 'agenda':
    case 'pair':
    case 'share-screen':
      return 'sermons';
    default:
      return 'profile'; // painel do admin, ofertas, termos
  }
}

/** Para onde o voltar leva quando a tela foi aberta direto (link ou recarregar a página). */
export function fallbackFor(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  const section = parts[0];
  if (section === 'admin') return parts.length > 1 ? (parts.length > 2 ? `/admin/${parts[1]}` : '/admin') : '/profile';
  if (section === 'profile') return '/profile';
  return TABS.find((x) => x.label === tabFor(section))?.href ?? '/';
}

export function BackButton() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const pathname = usePathname();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('common.back')}
      hitSlop={12}
      onPress={() => (router.canGoBack() ? router.back() : router.replace(fallbackFor(pathname) as never))}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingRight: 12 }}>
      <Ionicons name="chevron-back" size={24} color={colors.gold} />
      <RNText style={{ color: colors.gold, fontFamily: fonts.bodyMedium, fontSize: 16 }}>{t('common.back')}</RNText>
    </Pressable>
  );
}

/** Cabeçalho das telas internas: mesmo visual e sempre com o botão voltar. */
export function useStackOptions() {
  const { colors } = useTheme();
  return {
    headerStyle: { backgroundColor: colors.bg },
    headerTintColor: colors.gold,
    headerTitleStyle: { fontFamily: fonts.bodyBold, color: colors.text },
    headerShadowVisible: false,
    contentStyle: { backgroundColor: colors.bg },
    headerBackVisible: false,
    headerLeft: () => <BackButton />,
  };
}

/** Menu de baixo nas telas que ficam fora das abas (Bíblia, devocionais, ministração, painel…). */
export function BottomNav() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const segments = useSegments() as string[];
  const active = tabFor(segments[0]);
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingBottom: Math.max(insets.bottom, 4),
        paddingTop: 6,
      }}>
      {TABS.filter((tab) => !tab.hidden).map((tab) => {
        const on = tab.label === active;
        const color = on ? colors.gold : colors.textMuted;
        return (
          <Pressable
            key={tab.name}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => router.navigate(tab.href as never)}
            style={{ flex: 1, alignItems: 'center', gap: 2, paddingVertical: 2 }}>
            <Ionicons name={tab.icon} size={24} color={color} />
            <RNText style={{ color, fontFamily: fonts.bodyMedium, fontSize: 11 }}>{t(`tabs.${tab.label}`)}</RNText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Telas sem o menu de baixo: login/cadastro e o modo púlpito (tela cheia). */
export function useShowBottomNav(signedIn: boolean): boolean {
  const segments = useSegments() as string[];
  if (!signedIn || segments.length === 0) return false;
  if (segments[0] === '(app)') return false; // as abas já têm o menu
  if (segments[0] === 'sermon' && (segments.includes('pulpit') || segments.includes('present'))) return false;
  if (segments[0] === 'screen' || segments[0] === 'welcome') return false;
  return !['sign-in', 'sign-up', 'forgot-password', 'verify-email', 'reset-password'].includes(segments[0]);
}

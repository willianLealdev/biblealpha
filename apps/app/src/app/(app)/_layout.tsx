import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';

import { TABS } from '@/components/navigation';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';
import { fonts } from '@/theme/tokens';

export default function AppTabs() {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarLabelStyle: { fontFamily: fonts.bodyMedium, fontSize: 11 },
        sceneStyle: { backgroundColor: colors.bg },
      }}>
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(`tabs.${tab.label}`),
            // Escondida só do menu: com `href: null` a rota deixa de abrir (a Biblioteca voltava ao Início)
            ...(tab.hidden ? { tabBarItemStyle: { display: 'none' as const }, tabBarButton: () => null } : {}),
            tabBarIcon: ({ color, size }) => <Ionicons name={tab.icon} size={size} color={String(color)} />,
          }}
        />
      ))}
    </Tabs>
  );
}

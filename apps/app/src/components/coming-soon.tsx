import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { View } from 'react-native';

import { Card, Screen, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';

type Section = 'bible' | 'study' | 'devotional' | 'sermons' | 'library';

/** Aba ainda não implementada. Diz claramente o que vem e em qual fase. */
export function ComingSoon({
  section,
  phase,
  icon,
}: {
  section: Section;
  phase: number;
  icon: ComponentProps<typeof Ionicons>['name'];
}) {
  const { t } = useI18n();
  const { colors } = useTheme();
  return (
    <Screen center>
      <Card style={{ alignItems: 'center', paddingVertical: 32, gap: 12 }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.surfaceAlt,
          }}>
          <Ionicons name={icon} size={30} color={colors.gold} />
        </View>
        <Text variant="title" style={{ textAlign: 'center' }}>
          {t(`placeholder.${section}.title`)}
        </Text>
        <Text variant="muted" style={{ textAlign: 'center' }}>
          {t(`placeholder.${section}.body`)}
        </Text>
        <Text variant="small" style={{ color: colors.gold }}>
          {t('common.comingSoon')} · {t('common.phase', { n: phase })}
        </Text>
      </Card>
    </Screen>
  );
}

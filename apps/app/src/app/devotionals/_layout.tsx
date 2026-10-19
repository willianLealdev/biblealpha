import { Stack } from 'expo-router';

import { useStackOptions } from '@/components/navigation';
import { useI18n } from '@/i18n';

export default function DevotionalsStack() {
  const stackOptions = useStackOptions();
  const { t } = useI18n();
  return (
    <Stack
      screenOptions={stackOptions}>
      <Stack.Screen name="new" options={{ title: t('devotional.createPersonal') }} />
      <Stack.Screen name="history" options={{ title: t('devotional.history') }} />
      <Stack.Screen name="plans" options={{ title: t('devotional.explorePlans') }} />
      <Stack.Screen name="plan/[code]" options={{ title: t('devotional.schedule') }} />
    </Stack>
  );
}

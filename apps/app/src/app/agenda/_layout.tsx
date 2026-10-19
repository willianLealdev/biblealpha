import { Stack } from 'expo-router';

import { useStackOptions } from '@/components/navigation';
import { useI18n } from '@/i18n';

export default function AgendaStack() {
  const stackOptions = useStackOptions();
  const { t } = useI18n();
  return (
    <Stack screenOptions={stackOptions}>
      <Stack.Screen name="index" options={{ title: t('agenda.title') }} />
      <Stack.Screen name="[id]" options={{ title: t('agenda.event') }} />
    </Stack>
  );
}

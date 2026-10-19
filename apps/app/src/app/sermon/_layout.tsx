import { Stack } from 'expo-router';

import { useStackOptions } from '@/components/navigation';
import { useI18n } from '@/i18n';

export default function SermonStack() {
  const stackOptions = useStackOptions();
  const { t } = useI18n();
  return (
    <Stack
      screenOptions={stackOptions}>
      <Stack.Screen name="generate" options={{ title: t('sermons.generate') }} />
      <Stack.Screen name="[id]/index" options={{ title: t('sermons.editor') }} />
      <Stack.Screen name="[id]/versions" options={{ title: t('sermons.versions') }} />
      <Stack.Screen name="[id]/pulpit" options={{ headerShown: false, animation: 'fade' }} />
      <Stack.Screen name="[id]/present" options={{ headerShown: false, animation: 'fade' }} />
    </Stack>
  );
}

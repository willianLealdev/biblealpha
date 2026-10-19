import { Stack } from 'expo-router';

import { useStackOptions } from '@/components/navigation';
import { useI18n } from '@/i18n';

export default function ProfileLayout() {
  const stackOptions = useStackOptions();
  const { t } = useI18n();
  return (
    <Stack
      screenOptions={stackOptions}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="sessions" options={{ title: t('sessions.title') }} />
      <Stack.Screen name="password" options={{ title: t('password.title') }} />
      <Stack.Screen name="delete-account" options={{ title: t('deleteAccount.title') }} />
    </Stack>
  );
}

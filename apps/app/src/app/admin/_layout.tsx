import { Redirect, Stack } from 'expo-router';

import { useStackOptions } from '@/components/navigation';
import { useI18n } from '@/i18n';
import { useSession } from '@/lib/session';

/** Área do administrador. Usuários sem o papel "admin" voltam para o início (a API também recusa). */
export default function AdminLayout() {
  const stackOptions = useStackOptions();
  const { user } = useSession();
  const { t } = useI18n();
  if (!user?.roles.includes('admin')) return <Redirect href="/" />;
  return (
    <Stack
      screenOptions={stackOptions}>
      <Stack.Screen name="index" options={{ title: t('admin.title') }} />
      <Stack.Screen name="settings" options={{ title: t('admin.settings') }} />
      <Stack.Screen name="users/[id]" options={{ title: t('admin.userDetail') }} />
      <Stack.Screen name="bibles" options={{ title: t('admin.bibles') }} />
      <Stack.Screen name="integrations" options={{ title: t('admin.integrations') }} />
      <Stack.Screen name="devotionals/index" options={{ title: t('admin.devotionals') }} />
      <Stack.Screen name="devotionals/[day]" options={{ title: t('admin.devotionals') }} />
      <Stack.Screen name="languages/index" options={{ title: t('admin.languages') }} />
      <Stack.Screen name="languages/[code]" options={{ title: t('admin.languages') }} />
    </Stack>
  );
}

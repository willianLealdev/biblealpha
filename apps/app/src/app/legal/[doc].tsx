import { router, useLocalSearchParams } from 'expo-router';

import { Button, Notice, Screen, Text } from '@/components/ui';
import { useI18n } from '@/i18n';

// Versões aceitas no cadastro (BA_TERMS_VERSION / BA_PRIVACY_VERSION no backend).
// O texto definitivo depende de revisão jurídica.
const VERSION = '2026-10-18';

export default function LegalDocument() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const { t } = useI18n();
  const title = doc === 'privacy' ? t('legal.privacyTitle') : t('legal.termsTitle');
  return (
    <Screen>
      <Text variant="title">{title}</Text>
      <Notice>{t('legal.draft', { version: VERSION })}</Notice>
      <Button
        kind="secondary"
        title={t('common.back')}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      />
    </Screen>
  );
}

import { router, useLocalSearchParams } from 'expo-router';

import { Markdown } from '@/components/markdown';
import { Button, Screen, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { legalText, VERSION } from '@/legal';

export default function LegalDocument() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const { t, locale } = useI18n();
  const kind = doc === 'privacy' ? 'privacy' : 'terms';
  const date = new Date(`${VERSION}T12:00:00`).toLocaleDateString(locale, { dateStyle: 'long' });
  return (
    <Screen>
      <Text variant="title">{kind === 'privacy' ? t('legal.privacyTitle') : t('legal.termsTitle')}</Text>
      <Text variant="small">{t('legal.version', { date })}</Text>
      <Markdown text={legalText(kind, locale)} />
      <Button
        kind="secondary"
        title={t('common.back')}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      />
    </Screen>
  );
}

import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Text as RNText } from 'react-native';

import { getTranslationDetail, type TranslationDetail } from '@/bible/text';
import { Card, Screen, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';
import { fonts } from '@/theme/tokens';

export default function TranslationInfo() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { t } = useI18n();
  const { colors } = useTheme();
  const [tr, setTr] = useState<TranslationDetail | null>(null);

  useEffect(() => {
    getTranslationDetail(code)
      .then(setTr)
      .catch(() => {});
  }, [code]);

  if (!tr) return <Screen center><ActivityIndicator color={colors.gold} /></Screen>;

  // Só links http(s): dados importados de fora nunca abrem javascript: ou outros esquemas
  const link = (url: string | null) =>
    url && /^https?:\/\//i.test(url) ? (
      <RNText onPress={() => Linking.openURL(url)} style={{ color: colors.gold, fontFamily: fonts.body, fontSize: 14 }}>
        {url}
      </RNText>
    ) : null;

  const notes = Object.entries(tr.notes).filter(([k, v]) => typeof v === 'string' && k !== 'empty_verses_skipped');

  return (
    <Screen>
      <Text variant="title">
        {tr.name} ({tr.abbreviation})
      </Text>
      <Text variant="muted">{tr.description}</Text>
      <Card>
        <Text variant="label">{t('bible.edition')}</Text>
        <Text variant="body">{tr.edition}</Text>
        <Text variant="label">{t('bible.license')}</Text>
        <Text variant="body">{tr.license}</Text>
        {link(tr.license_url)}
        <Text variant="label">{t('bible.credits')}</Text>
        <Text variant="body">{tr.attribution}</Text>
        <Text variant="label">{t('bible.source')}</Text>
        {link(tr.source_url)}
      </Card>
      {notes.length ? (
        <Card>
          <Text variant="label">{t('bible.versificationNotes')}</Text>
          {notes.map(([k, v]) => (
            <Text key={k} variant="muted">
              {String(v)}
            </Text>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

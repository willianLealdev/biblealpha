import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Button, Card, Divider, Notice, Screen, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { sermonApi } from '@/lib/sermons';
import { sermonReplaced } from '@/sermon/local';
import { useTheme } from '@/theme';

type Version = { id: string; version: number; title: string; created_at: string };

export default function SermonVersions() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale, errorMessage } = useI18n();
  const { colors } = useTheme();
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    sermonApi
      .versions(id)
      .then((r) => setVersions(r.versions))
      .catch((e) => setError(errorMessage(e)));
  }, [id, errorMessage]);

  async function restore(versionId: string) {
    setRestoring(true);
    try {
      const s = await sermonApi.restoreVersion(id, versionId);
      sermonReplaced(s);
      if (router.canGoBack()) router.back();
      else router.replace({ pathname: '/sermon/[id]', params: { id } });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setRestoring(false);
    }
  }

  return (
    <Screen>
      {error ? <Notice kind="error">{error}</Notice> : null}
      {versions === null && !error ? <ActivityIndicator color={colors.gold} /> : null}
      {versions?.length === 0 ? <Text variant="muted">{t('sermons.versionsEmpty')}</Text> : null}
      {versions?.length ? (
        <Card style={{ paddingVertical: 4 }}>
          {versions.map((v, i) => (
            <View key={v.id}>
              {i > 0 ? <Divider /> : null}
              <View style={{ paddingVertical: 12, gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Ionicons name="time-outline" size={22} color={colors.gold} />
                  <View style={{ flex: 1 }}>
                    <Text variant="heading" numberOfLines={1}>
                      {v.title}
                    </Text>
                    <Text variant="small">
                      {t('sermons.versionN', { n: v.version })} ·{' '}
                      {new Date(v.created_at).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}
                    </Text>
                  </View>
                  {confirm !== v.id ? <Button kind="ghost" title={t('sermons.restore')} onPress={() => setConfirm(v.id)} /> : null}
                </View>
                {confirm === v.id ? (
                  <View style={{ gap: 8 }}>
                    <Notice>{t('sermons.restoreConfirm')}</Notice>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Button kind="secondary" title={t('common.cancel')} onPress={() => setConfirm(null)} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Button title={t('sermons.restore')} loading={restoring} onPress={() => restore(v.id)} />
                      </View>
                    </View>
                  </View>
                ) : null}
              </View>
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

// Agenda do pregador: próximos compromissos e os que já passaram.

import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Text as RNText, View } from 'react-native';

import { Button, Card, Divider, Notice, Screen, Segmented, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { agendaApi, type AgendaEvent } from '@/lib/agenda';
import { useTheme } from '@/theme';
import { fonts, radius } from '@/theme/tokens';

export default function AgendaList() {
  const { t, locale, errorMessage } = useI18n();
  const { colors } = useTheme();
  const [view, setView] = useState<'next' | 'past'>('next');
  const [items, setItems] = useState<AgendaEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      agendaApi
        .list(view === 'past')
        .then((r) => setItems(r.items))
        .catch((e) => setError(errorMessage(e)));
    }, [view, errorMessage]),
  );

  return (
    <Screen>
      <Text variant="title">{t('agenda.title')}</Text>
      <Text variant="muted">{t('agenda.intro')}</Text>
      {error ? <Notice kind="error">{error}</Notice> : null}
      <Button icon="add" title={t('agenda.new')} onPress={() => router.push({ pathname: '/agenda/[id]', params: { id: 'new' } })} />
      <Segmented
        value={view}
        onChange={(v) => {
          setItems(null);
          setView(v);
        }}
        options={[
          { value: 'next', label: t('agenda.upcoming') },
          { value: 'past', label: t('agenda.past') },
        ]}
      />
      {items === null ? <ActivityIndicator color={colors.gold} /> : null}
      {items?.length === 0 ? <Text variant="muted">{view === 'next' ? t('agenda.empty') : t('agenda.emptyPast')}</Text> : null}
      {items?.length ? (
        <Card style={{ paddingVertical: 4 }}>
          {items.map((e, i) => {
            const d = new Date(`${e.local_date}T12:00:00`);
            return (
              <View key={e.id}>
                {i > 0 ? <Divider /> : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/agenda/[id]', params: { id: e.id } })}
                  style={{ paddingVertical: 12, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <View style={{ width: 54, alignItems: 'center', borderWidth: 1, borderColor: colors.goldMuted, borderRadius: radius.md, paddingVertical: 6 }}>
                    <RNText style={{ color: colors.gold, fontFamily: fonts.bodyMedium, fontSize: 11, textTransform: 'uppercase' }}>
                      {d.toLocaleDateString(locale, { month: 'short' })}
                    </RNText>
                    <RNText style={{ color: colors.text, fontFamily: fonts.bodyBold, fontSize: 22 }}>{d.getDate()}</RNText>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="heading" numberOfLines={1}>
                      {e.church_name}
                    </Text>
                    <Text variant="small" numberOfLines={1}>
                      {[d.toLocaleDateString(locale, { weekday: 'long' }), e.local_time, e.city].filter(Boolean).join(' · ')}
                    </Text>
                    {e.sermon_title ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="document-text-outline" size={13} color={colors.gold} />
                        <Text variant="small" numberOfLines={1} style={{ color: colors.gold, flex: 1 }}>
                          {e.sermon_title}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </Pressable>
              </View>
            );
          })}
        </Card>
      ) : null}
    </Screen>
  );
}

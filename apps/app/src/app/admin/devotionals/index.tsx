import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Text as RNText, View } from 'react-native';

import { Card, Divider, Notice, Screen, Segmented, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { devotionalAdminApi, type AgendaDay } from '@/lib/admin-content';
import { useTheme } from '@/theme';
import { fonts } from '@/theme/tokens';

type Lang = 'pt-BR' | 'en' | 'es';

/** Agenda do devocional do dia: os próximos 30 dias, com a passagem e quem preparou o texto. */
export default function AdminDevotionals() {
  const { t, locale, errorMessage } = useI18n();
  const { colors } = useTheme();
  const [lang, setLang] = useState<Lang>(locale.startsWith('es') ? 'es' : locale.startsWith('en') ? 'en' : 'pt-BR');
  const [days, setDays] = useState<AgendaDay[] | null>(null);
  const [themes, setThemes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      setDays(null);
      devotionalAdminApi
        .agenda(lang)
        .then((r) => {
          setDays(r.days);
          setThemes(Object.fromEntries(r.themes.map((x) => [x.code, x.label])));
        })
        .catch((e) => setError(errorMessage(e)));
    }, [lang, errorMessage]),
  );

  const status = (d: AgendaDay) =>
    d.status === 'edited' ? t('admin.statusEdited') : d.status === 'auto' ? t('admin.statusAuto') : t('admin.statusNone');

  return (
    <Screen>
      <Text variant="muted">{t('admin.devotionalsHint')}</Text>
      {error ? <Notice kind="error">{error}</Notice> : null}
      <Segmented
        value={lang}
        onChange={setLang}
        options={[
          { value: 'pt-BR', label: 'Português' },
          { value: 'en', label: 'English' },
          { value: 'es', label: 'Español' },
        ]}
      />
      {days === null ? <ActivityIndicator color={colors.gold} /> : null}
      {days?.length ? (
        <Card style={{ paddingVertical: 4 }}>
          {days.map((d, i) => (
            <View key={d.day}>
              {i > 0 ? <Divider /> : null}
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.push({
                    pathname: '/admin/devotionals/[day]',
                    params: { day: d.day, lang },
                  })
                }
                style={{
                  paddingVertical: 10,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                }}>
                <View style={{ width: 64 }}>
                  <RNText style={{ color: colors.gold, fontFamily: fonts.bodyBold }}>
                    {new Date(`${d.day}T12:00:00`).toLocaleDateString(locale, {
                      day: '2-digit',
                      month: 'short',
                    })}
                  </RNText>
                  <Text variant="small">
                    {new Date(`${d.day}T12:00:00`).toLocaleDateString(locale, {
                      weekday: 'short',
                    })}
                  </Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <RNText style={{ color: colors.text, fontFamily: fonts.bodyMedium }} numberOfLines={1}>
                    {d.content?.title ?? d.reference}
                  </RNText>
                  <Text variant="small" numberOfLines={1}>
                    {d.reference} · {themes[d.theme] ?? d.theme} · {status(d)}
                  </Text>
                </View>
                {d.status === 'edited' ? <Ionicons name="create" size={18} color={colors.gold} /> : null}
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text as RNText, View } from 'react-native';

import { Notice, Text, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { hymnsApi, type HymnSummary } from '@/lib/hymns';
import { useTheme } from '@/theme';
import { fonts, radius } from '@/theme/tokens';

/** Harpa Cristã: todos os hinos em ordem, com busca por número, título ou trecho da letra. */
export default function Hymns() {
  const { t, errorMessage } = useI18n();
  const { colors } = useTheme();
  const [q, setQ] = useState('');
  const [items, setItems] = useState<HymnSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Busca enquanto digita (com uma pequena espera)
  useEffect(() => {
    const timer = setTimeout(() => {
      hymnsApi
        .list(q.trim())
        .then((r) => {
          setItems(r.hymns);
          setError(null);
        })
        .catch((e) => setError(errorMessage(e)));
    }, q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [q, errorMessage]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={items ?? []}
        keyExtractor={(h) => String(h.n)}
        contentContainerStyle={{ padding: 16, gap: 8, width: '100%', maxWidth: 720, alignSelf: 'center' }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: 10, marginBottom: 6 }}>
            <Text variant="muted">{t('hymns.subtitle')}</Text>
            <TextField label={t('hymns.search')} value={q} onChangeText={setQ} autoCapitalize="none" returnKeyType="search" />
            {error ? <Notice kind="error">{error}</Notice> : null}
            {!items && !error ? <ActivityIndicator color={colors.gold} /> : null}
            {items && !items.length ? <Text variant="small">{t('hymns.none')}</Text> : null}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/bible/hymns/[n]', params: { n: String(item.n) } })}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              padding: 12,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
            })}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: colors.surfaceAlt,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <RNText style={{ color: colors.gold, fontFamily: fonts.bodyBold, fontSize: 15 }}>{item.n}</RNText>
            </View>
            <View style={{ flex: 1 }}>
              <RNText style={{ color: colors.text, fontFamily: fonts.bodyBold, fontSize: 16 }} numberOfLines={1}>
                {item.title}
              </RNText>
              <RNText style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13 }} numberOfLines={1}>
                {item.first_line}
              </RNText>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

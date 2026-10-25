import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Share, Text as RNText, View } from 'react-native';

import { Button, Notice, Screen, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { kvGet, kvSet } from '@/lib/kv';
import { type Hymn, hymnsApi } from '@/lib/hymns';
import { useTheme } from '@/theme';
import { fonts, radius } from '@/theme/tokens';

const SIZE_KEY = 'hymns.fontSize';

/** Letra de um hino da Harpa Cristã: estrofes numeradas e o coro depois de cada uma. */
export default function HymnView() {
  const { n } = useLocalSearchParams<{ n: string }>();
  const { t, errorMessage } = useI18n();
  const { colors } = useTheme();
  const [hymn, setHymn] = useState<Hymn | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState(19);

  useEffect(() => {
    kvGet<number>(SIZE_KEY)
      .then((v) => v && setSize(v))
      .catch(() => {});
  }, []);

  useEffect(() => {
    hymnsApi
      .get(Number(n))
      .then((h) => {
        setHymn(h);
        setError(null);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [n, errorMessage]);

  function resize(delta: number) {
    const next = Math.max(14, Math.min(32, size + delta));
    setSize(next);
    kvSet(SIZE_KEY, next).catch(() => {});
  }

  if (error) return <Screen><Notice kind="error">{error}</Notice></Screen>;
  if (!hymn || String(hymn.n) !== n) return <Screen center><ActivityIndicator color={colors.gold} /></Screen>;

  const go = (to: number | null) => to && router.replace({ pathname: '/bible/hymns/[n]', params: { n: String(to) } });
  const lyric = { color: colors.text, fontFamily: 'Literata_400Regular', fontSize: size, lineHeight: size * 1.55 };

  function share() {
    if (!hymn) return;
    const parts = hymn.verses.flatMap((v, i) => [`${i + 1}. ${v}`, ...(hymn.chorus ? [`${t('hymns.chorus')}:\n${hymn.chorus}`] : [])]);
    Share.share({ message: `${hymn.n} — ${hymn.title}\n\n${parts.join('\n\n')}\n\n${t('hymns.harp')}` }).catch(() => {});
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: `${t('hymns.hymn')} ${hymn.n}` }} />
      <View style={{ alignItems: 'center', gap: 4 }}>
        <RNText style={{ color: colors.gold, fontFamily: fonts.bodyBold, fontSize: 14, letterSpacing: 1 }}>
          {t('hymns.harp').toUpperCase()} · {hymn.n}
        </RNText>
        <Text variant="title" style={{ textAlign: 'center' }}>
          {hymn.title}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10 }}>
        <SmallButton icon="remove" label="A-" onPress={() => resize(-2)} />
        <SmallButton icon="add" label="A+" onPress={() => resize(2)} />
        <SmallButton icon="share-outline" label={t('bible.share')} onPress={share} />
      </View>

      {hymn.verses.map((verse, i) => (
        <View key={i} style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <RNText style={{ color: colors.gold, fontFamily: fonts.bodyBold, fontSize: size * 0.8, lineHeight: size * 1.55 }}>{i + 1}</RNText>
            <RNText style={[lyric, { flex: 1 }]}>{verse}</RNText>
          </View>
          {hymn.chorus ? (
            <View style={{ borderLeftWidth: 3, borderLeftColor: colors.gold, paddingLeft: 12, marginLeft: 18, opacity: i === 0 ? 1 : 0.8 }}>
              <RNText style={{ color: colors.gold, fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1, marginBottom: 2 }}>
                {t('hymns.chorus').toUpperCase()}
              </RNText>
              <RNText style={[lyric, { fontStyle: 'italic' }]}>{hymn.chorus}</RNText>
            </View>
          ) : null}
        </View>
      ))}

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
        <View style={{ flex: 1 }}>
          {hymn.prev ? <Button kind="secondary" icon="chevron-back" title={`${hymn.prev}`} onPress={() => go(hymn.prev)} /> : null}
        </View>
        <View style={{ flex: 1 }}>
          {hymn.next ? <Button kind="secondary" icon="chevron-forward" title={`${hymn.next}`} onPress={() => go(hymn.next)} /> : null}
        </View>
      </View>
    </Screen>
  );
}

function SmallButton({ icon, label, onPress }: { icon: 'add' | 'remove' | 'share-outline'; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: pressed ? colors.surfaceAlt : 'transparent',
      })}>
      <Ionicons name={icon} size={16} color={colors.gold} />
      <RNText style={{ color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 13 }}>{label}</RNText>
    </Pressable>
  );
}

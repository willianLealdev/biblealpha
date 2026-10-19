import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import type { ComponentProps } from 'react';
import { useCallback, useState } from 'react';
import { Pressable, Text as RNText, View } from 'react-native';

import { loadPosition, type Position } from '@/bible/reader-state';
import { bookName } from '@/bible/reference';
import { Card, Screen, Seal, Text } from '@/components/ui';
import { useI18n, type TranslationKey } from '@/i18n';
import { devotionalApi, type Devotional } from '@/lib/devotional';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme';
import { fonts, radius } from '@/theme/tokens';

type IconName = ComponentProps<typeof Ionicons>['name'];

const SHORTCUTS: { label: TranslationKey; icon: IconName; href: string }[] = [
  { label: 'home.bible', icon: 'book-outline', href: '/' },
  { label: 'home.askAI', icon: 'sparkles-outline', href: '/study' },
  { label: 'home.devotional', icon: 'sunny-outline', href: '/devotional' },
  { label: 'home.sermons', icon: 'mic-outline', href: '/sermons' },
  { label: 'home.library', icon: 'library-outline', href: '/library' },
  { label: 'home.search', icon: 'search-outline', href: '/bible/search' },
  { label: 'home.shareScreen', icon: 'tv-outline', href: '/share-screen' },
  { label: 'home.agenda', icon: 'calendar-outline', href: '/agenda' },
];

function greetingKey(): TranslationKey {
  const h = new Date().getHours();
  return h < 12 ? 'home.morning' : h < 18 ? 'home.afternoon' : 'home.evening';
}

/** Tela de abertura: saudação, versículo do dia, continuar a leitura e atalhos. */
export default function Home() {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const { user } = useSession();
  const [today, setToday] = useState<Devotional | null>(null);
  const [position, setPosition] = useState<Position | null>(null);

  useFocusEffect(
    useCallback(() => {
      devotionalApi
        .today()
        .then(setToday)
        .catch(() => {});
      loadPosition()
        .then(setPosition)
        .catch(() => {});
    }, []),
  );

  const firstName = user?.name?.trim().split(/\s+/)[0];
  const verseText = today?.verses
    .slice(0, 3)
    .map((v) => v.text)
    .join(' ');

  return (
    <Screen>
      <View style={{ alignItems: 'center', gap: 6, marginTop: 8 }}>
        <Seal size={64} />
        <RNText style={{ color: colors.text, fontFamily: fonts.display, fontSize: 26, textAlign: 'center' }}>
          {t(greetingKey(), { name: firstName ?? '' }).replace(/,\s*$/, '')}
        </RNText>
        <Text variant="muted" style={{ textAlign: 'center' }}>
          {new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
        </Text>
      </View>

      {/* Versículo do dia: a passagem do devocional */}
      <Pressable accessibilityRole="button" onPress={() => router.navigate('/devotional')}>
        <View
          style={{
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.gold,
            backgroundColor: colors.surface,
            padding: 20,
            gap: 10,
          }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="sunny" size={16} color={colors.gold} />
            <RNText style={{ color: colors.gold, fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' }}>
              {t('home.verseOfDay')}
            </RNText>
          </View>
          {today ? (
            <>
              <RNText style={{ color: colors.text, fontFamily: 'Literata_400Regular', fontSize: 18, lineHeight: 28 }} numberOfLines={6}>
                “{verseText}”
              </RNText>
              <Text variant="small">
                {today.reference} · {today.translation}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <RNText style={{ color: colors.gold, fontFamily: fonts.bodyBold }}>{today.content.title}</RNText>
                <Ionicons name="arrow-forward" size={16} color={colors.gold} />
              </View>
            </>
          ) : (
            <Text variant="muted">{t('common.loading')}</Text>
          )}
        </View>
      </Pressable>

      {/* Continuar a leitura */}
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          position
            ? router.navigate({ pathname: '/', params: { book: position.book, chapter: String(position.chapter) } })
            : router.navigate('/')
        }>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Ionicons name="book" size={26} color={colors.gold} />
          <View style={{ flex: 1 }}>
            <Text variant="small">{t('home.continueReading')}</Text>
            <RNText style={{ color: colors.text, fontFamily: fonts.bodyBold, fontSize: 17 }}>
              {position ? `${bookName(position.book, locale)} ${position.chapter}` : t('home.startReading')}
            </RNText>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Card>
      </Pressable>

      {/* Atalhos */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {SHORTCUTS.map((s) => (
          <Pressable
            key={s.label}
            accessibilityRole="button"
            onPress={() => router.navigate(s.href as never)}
            style={({ pressed }) => ({
              flexBasis: '31%',
              flexGrow: 1,
              alignItems: 'center',
              gap: 6,
              paddingVertical: 16,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
            })}>
            <Ionicons name={s.icon} size={26} color={colors.gold} />
            <RNText style={{ color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 13, textAlign: 'center' }}>{t(s.label)}</RNText>
          </Pressable>
        ))}
      </View>

      {/* Convite discreto para contribuir (quem já contribui não vê) */}
      {user?.plan !== 'pro' ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/pro')}>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Ionicons name="heart-outline" size={24} color={colors.gold} />
            <View style={{ flex: 1 }}>
              <RNText style={{ color: colors.text, fontFamily: fonts.bodyBold }}>{t('home.supportTitle')}</RNText>
              <Text variant="small">{t('home.supportBody')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </Card>
        </Pressable>
      ) : null}

      <Text variant="small" style={{ textAlign: 'center', marginTop: 4 }}>
        {t('tagline')}
      </Text>
    </Screen>
  );
}

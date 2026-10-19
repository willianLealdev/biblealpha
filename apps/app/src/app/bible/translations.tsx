import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text as RNText, View } from 'react-native';

import { saveTranslation } from '@/bible/reader-state';
import { downloadTranslation, listTranslations, offlineStatus, type Translation } from '@/bible/text';
import { Card, Notice, Screen, Text, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';
import { fonts, radius } from '@/theme/tokens';

type Group = {
  key: string;
  name: string;
  nameEn: string;
  items: Translation[];
};

const lang2 = (code: string) => code.toLowerCase().split('-')[0];

/** Mais de mil traduções em mais de mil idiomas: agrupadas por idioma, com busca. */
export default function Translations() {
  const { current } = useLocalSearchParams<{ current?: string }>();
  const { t, locale, errorMessage } = useI18n();
  const { colors } = useTheme();
  const [list, setList] = useState<Translation[] | null>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [offline, setOffline] = useState<Record<string, boolean>>({});
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listTranslations()
      .then((items) => {
        setList(items);
        // Abre o idioma do app e o da tradução atual
        const cur = items.find((x) => x.code === current);
        setOpen(new Set([lang2(locale), ...(cur ? [cur.language] : [])].map((k) => k.toLowerCase())));
      })
      .catch((e) => setError(errorMessage(e)));
  }, [errorMessage, locale, current]);

  const groups = useMemo<Group[]>(() => {
    if (!list) return [];
    const needle = q.trim().toLowerCase();
    const map = new Map<string, Group>();
    for (const tr of list) {
      const hay = `${tr.name} ${tr.abbreviation} ${tr.language_name} ${tr.language_name_en} ${tr.language}`.toLowerCase();
      if (needle && !hay.includes(needle)) continue;
      const key = tr.language.toLowerCase();
      const g = map.get(key) ?? {
        key,
        name: tr.language_name || tr.language,
        nameEn: tr.language_name_en || tr.language_name || tr.language,
        items: [],
      };
      g.items.push(tr);
      map.set(key, g);
    }
    const mine = lang2(locale);
    const rank = (g: Group) => (lang2(g.key) === mine ? 0 : g.items.some((x) => x.code === current) ? 1 : 2);
    for (const g of map.values()) {
      g.items.sort((a, b) => Number(b.is_default) - Number(a.is_default) || b.verse_count - a.verse_count || a.name.localeCompare(b.name));
    }
    return [...map.values()].sort((a, b) => rank(a) - rank(b) || a.nameEn.localeCompare(b.nameEn));
  }, [list, q, locale, current]);

  async function choose(code: string) {
    await saveTranslation(code, locale);
    router.navigate({ pathname: '/', params: { t: code } });
  }

  async function checkOffline(items: Translation[]) {
    const status: Record<string, boolean> = {};
    for (const item of items) status[item.code] = !!(await offlineStatus(item.code));
    setOffline((o) => ({ ...o, ...status }));
  }

  function toggle(g: Group) {
    setOpen((cur) => {
      const next = new Set(cur);
      if (next.has(g.key)) next.delete(g.key);
      else {
        next.add(g.key);
        checkOffline(g.items);
      }
      return next;
    });
  }

  async function download(code: string) {
    setError(null);
    try {
      await downloadTranslation(code, (f) => setProgress((p) => ({ ...p, [code]: f })));
      setOffline((o) => ({ ...o, [code]: true }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setProgress((p) => {
        const next = { ...p };
        delete next[code];
        return next;
      });
    }
  }

  if (!list) {
    return <Screen center>{error ? <Notice kind="error">{error}</Notice> : <ActivityIndicator color={colors.gold} />}</Screen>;
  }

  const languages = new Set(list.map((x) => x.language)).size;
  const searching = q.trim().length > 0;

  const renderTranslation = (tr: Translation) => {
    const active = tr.code === current;
    const pct = progress[tr.code];
    return (
      <Card key={tr.code} style={active ? { borderColor: colors.gold } : undefined}>
        <Pressable accessibilityRole="button" onPress={() => choose(tr.code)} style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <RNText
              style={{
                color: colors.text,
                fontFamily: fonts.bodyBold,
                fontSize: 16,
                flex: 1,
              }}>
              {tr.name} ({tr.abbreviation})
            </RNText>
            {active ? <Ionicons name="checkmark-circle" size={22} color={colors.gold} /> : null}
          </View>
          {tr.description ? (
            <Text variant="small" numberOfLines={2}>
              {tr.description}
            </Text>
          ) : null}
          <Text variant="small">
            {tr.license}
            {tr.books ? ` · ${t('bible.partial', { n: tr.books.length })}` : ''}
          </Text>
        </Pressable>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 6,
          }}>
          {offline[tr.code] ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="cloud-done-outline" size={18} color={colors.success} />
              <Text variant="small">{t('bible.downloaded')}</Text>
            </View>
          ) : pct !== undefined ? (
            <Text variant="small">{t('bible.downloading', { pct: Math.round(pct * 100) })}</Text>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => download(tr.code)}
              style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <Ionicons name="cloud-download-outline" size={18} color={colors.gold} />
              <RNText
                style={{
                  color: colors.gold,
                  fontFamily: fonts.bodyMedium,
                  fontSize: 14,
                }}>
                {t('bible.downloadOffline')}
              </RNText>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: '/bible/info/[code]',
                params: { code: tr.code },
              })
            }>
            <RNText
              style={{
                color: colors.gold,
                fontFamily: fonts.bodyMedium,
                fontSize: 14,
              }}>
              {t('bible.credits')}
            </RNText>
          </Pressable>
        </View>
      </Card>
    );
  };

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{
        padding: 16,
        gap: 10,
        maxWidth: 720,
        width: '100%',
        alignSelf: 'center',
      }}
      data={groups}
      keyExtractor={(g) => g.key}
      initialNumToRender={20}
      windowSize={10}
      ListHeaderComponent={
        <View style={{ gap: 8 }}>
          {error ? <Notice kind="error">{error}</Notice> : null}
          <TextField label={t('bible.searchTranslations')} value={q} onChangeText={setQ} autoCorrect={false} />
          <Text variant="small">{t('bible.translationsCount', { n: list.length, languages })}</Text>
        </View>
      }
      renderItem={({ item: g }) => {
        const expanded = searching || open.has(g.key);
        return (
          <View style={{ gap: 8 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              onPress={() => toggle(g)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: radius.md,
                backgroundColor: colors.surface,
              }}>
              <Ionicons name={expanded ? 'chevron-down' : 'chevron-forward'} size={18} color={colors.gold} />
              <View style={{ flex: 1 }}>
                <RNText
                  style={{
                    color: colors.text,
                    fontFamily: fonts.bodyBold,
                    fontSize: 16,
                  }}>
                  {g.name}
                </RNText>
                {g.nameEn !== g.name ? <Text variant="small">{g.nameEn}</Text> : null}
              </View>
              <Text variant="small">{g.items.length}</Text>
            </Pressable>
            {expanded ? g.items.map(renderTranslation) : null}
          </View>
        );
      }}
    />
  );
}

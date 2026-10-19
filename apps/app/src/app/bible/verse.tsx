import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text as RNText, View } from 'react-native';

import { formatKeyRange, splitKey } from '@/bible/reference';
import { listTranslations, type Translation } from '@/bible/text';
import { Card, Notice, Screen, Segmented, Text } from '@/components/ui';
import { PickerModal } from '@/components/world-picker';
import { useI18n } from '@/i18n';
import { studyTools, type Compared, type CrossRef, type OriginalChapter } from '@/lib/study-tools';
import { useTheme } from '@/theme';
import { fonts, radius } from '@/theme/tokens';

type Tab = 'original' | 'crossrefs' | 'compare';

/** Aprofundar um versículo: texto original, referências cruzadas e comparação de traduções. */
export default function VerseStudy() {
  const params = useLocalSearchParams<{ start: string; end?: string; t?: string; tab?: Tab }>();
  const start = Number(params.start);
  const end = Number(params.end ?? params.start);
  const translation = params.t ?? 'blivre';
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const [tab, setTab] = useState<Tab>(params.tab ?? 'original');
  const label = formatKeyRange(start, end, locale);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text variant="title" style={{ flex: 1 }}>
          {label}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/bible/quiz', params: { start: String(start), end: String(end), t: translation } })}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="school-outline" size={18} color={colors.gold} />
          <RNText style={{ color: colors.gold, fontFamily: fonts.bodyMedium }}>{t('quiz.short')}</RNText>
        </Pressable>
      </View>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'original', label: t('bible.tabOriginal') },
          { value: 'crossrefs', label: t('bible.tabCrossrefs') },
          { value: 'compare', label: t('bible.tabCompare') },
        ]}
      />
      {tab === 'original' ? <OriginalTab start={start} end={end} /> : null}
      {tab === 'crossrefs' ? <CrossrefsTab start={start} translation={translation} /> : null}
      {tab === 'compare' ? <CompareTab start={start} end={end} translation={translation} /> : null}
    </Screen>
  );
}

function OriginalTab({ start, end }: { start: number; end: number }) {
  const { t, locale, errorMessage } = useI18n();
  const { colors } = useTheme();
  const [data, setData] = useState<OriginalChapter | null>(null);
  const [error, setError] = useState<string | null>(null);
  const a = splitKey(start);

  useEffect(() => {
    studyTools
      .original(a.book, a.chapter, locale, start === end ? a.verse : undefined)
      .then(setData)
      .catch((e) => setError(errorMessage(e)));
  }, [a.book, a.chapter, a.verse, start, end, locale, errorMessage]);

  if (error) return <Notice kind="error">{error}</Notice>;
  if (!data) return <ActivityIndicator color={colors.gold} />;
  const verses = data.verses.filter((v) => v.verse >= start % 1000 && (start === end || v.verse <= end % 1000));
  if (!verses.length) return <Text variant="muted">{t('bible.noOriginal')}</Text>;
  const rtl = data.direction === 'rtl';

  return (
    <View style={{ gap: 12 }}>
      <Text variant="small">{t(data.language === 'hebrew' ? 'bible.hebrewHint' : 'bible.greekHint')}</Text>
      {verses.map((v) => (
        <Card key={v.verse}>
          <Text variant="label">{formatKeyRange(start - (start % 1000) + v.verse, start - (start % 1000) + v.verse, locale)}</Text>
          <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 8 }}>
            {v.words.map((w, i) => (
              <Pressable
                key={i}
                accessibilityRole="button"
                disabled={!w.strong}
                onPress={() => w.strong && router.push({ pathname: '/bible/word/[strong]', params: { strong: w.strong } })}
                style={({ pressed }) => ({
                  alignItems: 'center',
                  minWidth: 64,
                  paddingHorizontal: 8,
                  paddingVertical: 6,
                  borderRadius: radius.sm,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
                })}>
                <RNText style={{ color: colors.text, fontSize: 22, writingDirection: rtl ? 'rtl' : 'ltr' }}>{w.text.replace(/\//g, '')}</RNText>
                <RNText style={{ color: colors.textMuted, fontSize: 11, fontFamily: fonts.body }}>{w.translit.replace(/\//g, '')}</RNText>
                <RNText style={{ color: colors.gold, fontSize: 12, fontFamily: fonts.bodyMedium, textAlign: 'center' }} numberOfLines={2}>
                  {w.gloss || w.gloss_en}
                </RNText>
                {w.strong ? <RNText style={{ color: colors.textMuted, fontSize: 10, fontFamily: fonts.body }}>{w.strong}</RNText> : null}
              </Pressable>
            ))}
          </View>
        </Card>
      ))}
      <Text variant="small">{data.credit}</Text>
    </View>
  );
}

function CrossrefsTab({ start, translation }: { start: number; translation: string }) {
  const { t, locale, errorMessage } = useI18n();
  const { colors } = useTheme();
  const [items, setItems] = useState<CrossRef[] | null>(null);
  const [credit, setCredit] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    studyTools
      .crossrefs(start, translation)
      .then((r) => {
        setItems(r.items);
        setCredit(r.credit);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [start, translation, errorMessage]);

  if (error) return <Notice kind="error">{error}</Notice>;
  if (!items) return <ActivityIndicator color={colors.gold} />;
  if (!items.length) return <Text variant="muted">{t('bible.crossrefsEmpty')}</Text>;
  return (
    <View style={{ gap: 10 }}>
      <Text variant="small">{t('bible.crossrefsHint')}</Text>
      {items.map((r) => {
        const s = splitKey(r.start);
        return (
          <Pressable
            key={`${r.start}-${r.end}`}
            accessibilityRole="button"
            onPress={() => router.navigate({ pathname: '/', params: { book: s.book, chapter: String(s.chapter), verse: String(s.verse), t: translation } })}>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <RNText style={{ color: colors.gold, fontFamily: fonts.bodyBold, flex: 1 }}>{formatKeyRange(r.start, r.end, locale)}</RNText>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </View>
              <RNText style={{ color: colors.text, fontFamily: 'Literata_400Regular', fontSize: 15, lineHeight: 23 }}>{r.text}</RNText>
            </Card>
          </Pressable>
        );
      })}
      <Text variant="small">{credit}</Text>
    </View>
  );
}

function CompareTab({ start, end, translation }: { start: number; end: number; translation: string }) {
  const { t, errorMessage } = useI18n();
  const { colors } = useTheme();
  const [all, setAll] = useState<Translation[]>([]);
  const [codes, setCodes] = useState<string[]>([]);
  const [items, setItems] = useState<Compared[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  // Começa com a tradução atual e as padrão de português, inglês e espanhol
  useEffect(() => {
    listTranslations()
      .then((list) => {
        setAll(list);
        const defaults = list.filter((x) => x.is_default && ['pt-BR', 'en', 'es'].includes(x.language)).map((x) => x.code);
        setCodes([...new Set([translation, ...defaults])]);
      })
      .catch(() => setCodes([translation]));
  }, [translation]);

  useEffect(() => {
    if (!codes.length) return;
    studyTools
      .compare(start, end, codes)
      .then((r) => setItems(r.items))
      .catch((e) => setError(errorMessage(e)));
  }, [codes, start, end, errorMessage]);

  const options = useMemo(
    () =>
      all
        .filter((x) => !codes.includes(x.code))
        .map((x) => ({ key: x.code, title: `${x.name} (${x.abbreviation})`, subtitle: x.language_name })),
    [all, codes],
  );

  return (
    <View style={{ gap: 10 }}>
      {error ? <Notice kind="error">{error}</Notice> : null}
      {!items ? <ActivityIndicator color={colors.gold} /> : null}
      {items?.map((c) => (
        <Card key={c.code}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <RNText style={{ color: colors.gold, fontFamily: fonts.bodyBold, flex: 1 }}>
              {c.name} ({c.abbreviation})
            </RNText>
            {codes.length > 1 ? (
              <Pressable accessibilityRole="button" accessibilityLabel={t('bible.close')} onPress={() => setCodes((cur) => cur.filter((x) => x !== c.code))} hitSlop={10}>
                <Ionicons name="close" size={18} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
          <RNText style={{ color: colors.text, fontFamily: 'Literata_400Regular', fontSize: 15, lineHeight: 23 }}>
            {c.verses.map((v) => `${v.verse} ${v.text}`).join(' ') || '—'}
          </RNText>
        </Card>
      ))}
      {codes.length < 8 ? (
        <Pressable accessibilityRole="button" onPress={() => setPicking(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', padding: 8 }}>
          <Ionicons name="add-circle-outline" size={20} color={colors.gold} />
          <RNText style={{ color: colors.gold, fontFamily: fonts.bodyMedium }}>{t('bible.addTranslation')}</RNText>
        </Pressable>
      ) : null}
      <PickerModal
        visible={picking}
        title={t('bible.addTranslation')}
        items={options}
        onClose={() => setPicking(false)}
        onPick={(code) => {
          setPicking(false);
          setItems(null);
          setCodes((cur) => [...cur, code]);
        }}
      />
    </View>
  );
}

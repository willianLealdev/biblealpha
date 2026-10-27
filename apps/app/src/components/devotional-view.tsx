import { router } from 'expo-router';
import { Pressable, Text as RNText, View } from 'react-native';

import { splitKey, tryParseReferences } from '@/bible/reference';
import { TypeBar, useReadingType } from '@/components/type-bar';
import { Card, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import type { Devotional } from '@/lib/devotional';
import { useTheme } from '@/theme';
import { fonts } from '@/theme/tokens';

/** Corpo de um devocional: passagem, contexto, reflexão, aplicação, perguntas e oração. */
/** Texto do devocional. `review`: mostra avisos de conferência (só para o administrador). */
export function DevotionalView({ d, review = false }: { d: Devotional; review?: boolean }) {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const c = d.content;
  const { scale, lineHeight, setScale } = useReadingType();
  // Texto corrido na mesma proporção da leitura da Bíblia (letra base 17 + espaçamento escolhido)
  const bodyStyle = { color: colors.text, fontFamily: fonts.body, fontSize: 16 * scale, lineHeight: 16 * scale * lineHeight };
  const open = () => {
    const { book, chapter, verse } = splitKey(d.verse_key_start);
    router.navigate({ pathname: '/', params: { book, chapter: String(chapter), verse: String(verse), t: d.translation_code } });
  };
  const openRef = (text: string) => {
    const refs = tryParseReferences(text, locale);
    if (!refs) return;
    const r = refs[0];
    router.navigate({
      pathname: '/',
      params: { book: r.book, chapter: String(r.chapter), ...(r.verseStart ? { verse: String(r.verseStart) } : {}), t: d.translation_code },
    });
  };
  const section = (title: string, text: string) =>
    text ? (
      <View style={{ gap: 4 }}>
        <RNText style={{ color: colors.gold, fontFamily: fonts.bodyBold, fontSize: 15 }}>{title}</RNText>
        <RNText style={bodyStyle}>{text}</RNText>
      </View>
    ) : null;

  return (
    <View style={{ gap: 14 }}>
      <TypeBar scale={scale} onChange={setScale} />
      {d.theme_label ? <Text variant="small" style={{ color: colors.gold }}>{d.theme_label.toUpperCase()}</Text> : null}
      <Text variant="title">{c.title}</Text>
      <Card>
        <Pressable accessibilityRole="link" onPress={open}>
          <RNText style={{ color: colors.gold, fontFamily: fonts.bodyBold, fontSize: 15 }}>
            {d.reference} ({d.translation}) ›
          </RNText>
        </Pressable>
        <RNText style={{ color: colors.text, fontFamily: 'Literata_400Regular', fontSize: 17 * scale, lineHeight: 17 * scale * lineHeight }}>
          {d.verses.map((v) => (
            <RNText key={`${v.chapter}:${v.verse}`}>
              <RNText style={{ color: colors.gold, fontSize: 12, fontFamily: fonts.bodyBold }}>{v.verse} </RNText>
              {v.text}{' '}
            </RNText>
          ))}
        </RNText>
      </Card>
      {section(t('devotional.context'), c.context)}
      {section(t('devotional.reflection'), c.reflection)}
      {section(t('devotional.application'), c.application)}
      {c.questions?.length ? (
        <View style={{ gap: 4 }}>
          <RNText style={{ color: colors.gold, fontFamily: fonts.bodyBold, fontSize: 15 }}>{t('devotional.questions')}</RNText>
          {c.questions.map((q, i) => (
            <RNText key={i} style={bodyStyle}>
              {i + 1}. {q}
            </RNText>
          ))}
        </View>
      ) : null}
      {c.prayer ? (
        <View style={{ gap: 4 }}>
          <RNText style={{ color: colors.gold, fontFamily: fonts.bodyBold, fontSize: 15 }}>{t('devotional.prayer')}</RNText>
          <RNText style={{ color: colors.text, fontFamily: 'Literata_400Regular', fontStyle: 'italic', fontSize: 16 * scale, lineHeight: 16 * scale * lineHeight }}>
            {c.prayer}
          </RNText>
        </View>
      ) : null}
      {c.references?.length ? (
        <View style={{ gap: 6 }}>
          <RNText style={{ color: colors.gold, fontFamily: fonts.bodyBold, fontSize: 15 }}>{t('devotional.biblicalBasis')}</RNText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {c.references.map((r) => (
              <RNText
                key={r}
                accessibilityRole="link"
                onPress={() => openRef(r)}
                style={{ color: colors.text, fontFamily: fonts.bodyMedium, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, overflow: 'hidden' }}>
                {r}
              </RNText>
            ))}
          </View>
        </View>
      ) : null}
      {review && c.invalid_references?.length ? (
        <Text variant="small" style={{ color: colors.danger }}>
          {t('devotional.removedRefs', { refs: c.invalid_references.join(', ') })}
        </Text>
      ) : null}

    </View>
  );
}

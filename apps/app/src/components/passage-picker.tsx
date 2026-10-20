// Escolha de livro e capítulo da Bíblia (dois campos que abrem uma lista), para telas que trabalham
// com um capítulo inteiro, como o estudo visual.

import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text as RNText, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BOOKS } from '@/bible/books';
import { bookName } from '@/bible/reference';
import { Segmented, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';
import { fonts, radius } from '@/theme/tokens';

type Sheet = 'book' | 'chapter' | null;

export function PassagePicker({
  book,
  chapter,
  onChange,
}: {
  book: string;
  chapter: number;
  onChange: (book: string, chapter: number) => void;
}) {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [sheet, setSheet] = useState<Sheet>(null);
  const current = BOOKS.find((b) => b.code === book);
  const [testament, setTestament] = useState<'OT' | 'NT'>(current?.testament ?? 'NT');

  const field = (label: string, value: string, which: Exclude<Sheet, null>, flex: number) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      onPress={() => setSheet(which)}
      style={({ pressed }) => ({
        flex,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
        borderRadius: radius.md,
        paddingHorizontal: 14,
        paddingVertical: 10,
        gap: 2,
      })}>
      <Text variant="small">{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <RNText style={{ color: colors.text, fontFamily: fonts.bodyBold, fontSize: 17 }} numberOfLines={1}>
          {value}
        </RNText>
        <Ionicons name="chevron-down" size={16} color={colors.gold} />
      </View>
    </Pressable>
  );

  const pill = (key: string, label: string, active: boolean, onPress: () => void, width: '48%' | undefined) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        width,
        minWidth: width ? undefined : 52,
        flexGrow: width ? 1 : 0,
        alignItems: 'center',
        borderWidth: 1.5,
        borderColor: active ? colors.gold : colors.border,
        backgroundColor: active ? colors.gold : pressed ? colors.surfaceAlt : colors.surface,
        borderRadius: radius.md,
        paddingHorizontal: 10,
        paddingVertical: 10,
      })}>
      <RNText style={{ color: active ? colors.onGold : colors.text, fontFamily: fonts.bodyMedium, fontSize: 15 }} numberOfLines={1}>
        {label}
      </RNText>
    </Pressable>
  );

  return (
    <>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {field(t('visual.book'), bookName(book, locale), 'book', 2)}
        {field(t('visual.chapter'), String(chapter), 'chapter', 1)}
      </View>

      {sheet ? (
        <Modal visible transparent animationType="slide" onRequestClose={() => setSheet(null)}>
          <Pressable style={{ flex: 1, backgroundColor: colors.overlay }} onPress={() => setSheet(null)} accessibilityLabel={t('bible.close')} />
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              maxHeight: '80%',
              backgroundColor: colors.bg,
              borderTopLeftRadius: radius.lg,
              borderTopRightRadius: radius.lg,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 16,
              paddingBottom: insets.bottom + 16,
            }}>
            <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center', gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text variant="heading" style={{ flex: 1 }}>
                  {sheet === 'book' ? t('bible.chooseBook') : `${bookName(book, locale)} · ${t('visual.chapter')}`}
                </Text>
                <Pressable accessibilityRole="button" accessibilityLabel={t('bible.close')} onPress={() => setSheet(null)} hitSlop={12}>
                  <Ionicons name="close" size={24} color={colors.textMuted} />
                </Pressable>
              </View>
              {sheet === 'book' ? (
                <>
                  <Segmented
                    value={testament}
                    onChange={setTestament}
                    options={[
                      { value: 'OT', label: t('bible.oldTestament') },
                      { value: 'NT', label: t('bible.newTestament') },
                    ]}
                  />
                  <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {BOOKS.filter((b) => b.testament === testament).map((b) =>
                      pill(b.code, bookName(b.code, locale), b.code === book, () => {
                        // Troca de livro volta ao capítulo 1; livros com vários capítulos pedem o capítulo em seguida
                        onChange(b.code, 1);
                        setSheet(b.chapters > 1 ? 'chapter' : null);
                      }, '48%'),
                    )}
                  </ScrollView>
                </>
              ) : (
                <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {Array.from({ length: current?.chapters ?? 1 }, (_, i) => i + 1).map((c) =>
                    pill(String(c), String(c), c === chapter, () => {
                      onChange(book, c);
                      setSheet(null);
                    }, undefined),
                  )}
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}

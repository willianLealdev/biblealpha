// País e idioma: usados no cadastro e no perfil.

import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, Text as RNText, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { countryName, flag, type World, type WorldLanguage } from '@/lib/world';
import { useTheme } from '@/theme';
import { fonts, radius } from '@/theme/tokens';

const plain = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();

export type Item = { key: string; title: string; subtitle?: string; left?: string };

export function PickerModal({ visible, title, items, onPick, onClose }: { visible: boolean; title: string; items: Item[]; onPick: (key: string) => void; onClose: () => void }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const [q, setQ] = useState('');
  // Uma escolha por abertura: evita que o mesmo toque escolha também o item que aparece embaixo
  const done = useRef(false);
  const shown = useMemo(() => {
    const needle = plain(q.trim());
    return needle ? items.filter((i) => plain(`${i.title} ${i.subtitle ?? ''} ${i.key}`).includes(needle)) : items;
  }, [items, q]);
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flex: 1, width: '100%', maxWidth: 640, alignSelf: 'center', padding: 16, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text variant="heading">{title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={t('bible.close')} onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={26} color={colors.gold} />
            </Pressable>
          </View>
          <TextField label={t('world.search')} value={q} onChangeText={setQ} autoCorrect={false} />
          <FlatList
            data={shown}
            keyExtractor={(i) => i.key}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={30}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  if (done.current) return;
                  done.current = true;
                  onPick(item.key);
                }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 12,
                  paddingHorizontal: 8,
                  borderRadius: radius.sm,
                  backgroundColor: pressed ? colors.surfaceAlt : 'transparent',
                })}>
                {item.left ? <RNText style={{ fontSize: 22 }}>{item.left}</RNText> : null}
                <View style={{ flex: 1 }}>
                  <RNText style={{ color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 16 }}>{item.title}</RNText>
                  {item.subtitle ? <Text variant="small">{item.subtitle}</Text> : null}
                </View>
              </Pressable>
            )}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function FieldButton({ label, value, left, onPress }: { label: string; value: string; left?: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <Text variant="label">{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
        onPress={onPress}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          borderRadius: radius.md,
          paddingHorizontal: 14,
          paddingVertical: 12,
        }}>
        {left ? <RNText style={{ fontSize: 20 }}>{left}</RNText> : null}
        <RNText style={{ flex: 1, color: colors.text, fontFamily: fonts.body, fontSize: 16 }}>{value}</RNText>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

export function CountryField({ world, value, onChange }: { world: World; value: string | null; onChange: (code: string) => void }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(0);
  const items = useMemo(
    () =>
      world.countries
        .map((c) => ({ key: c.code, title: countryName(c, locale), subtitle: c.name_en, left: flag(c.code) }))
        .map((i) => (i.subtitle === i.title ? { ...i, subtitle: undefined } : i))
        .sort((a, b) => a.title.localeCompare(b.title, locale)),
    [world, locale],
  );
  const current = world.countries.find((c) => c.code === value);
  return (
    <>
      <FieldButton
        label={t('world.country')}
        value={current ? countryName(current, locale) : t('world.chooseCountry')}
        left={current ? flag(current.code) : undefined}
        onPress={() => {
          setOpened((n) => n + 1);
          setOpen(true);
        }}
      />
      <PickerModal
        key={opened}
        visible={open}
        title={t('world.country')}
        items={items}
        onClose={() => setOpen(false)}
        onPick={(code) => {
          setOpen(false);
          onChange(code);
        }}
      />
    </>
  );
}

/** Idiomas do país em destaque (chips) e "Outro idioma" com busca em todos. */
export function LanguageField({ world, country, value, onChange }: { world: World; country: string | null; value: string; onChange: (code: string) => void }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(0);
  const byCode = useMemo(() => Object.fromEntries(world.languages.map((l) => [l.code, l])), [world]);
  const fromCountry = (world.countries.find((c) => c.code === country)?.languages ?? []).map((c) => byCode[c]).filter(Boolean) as WorldLanguage[];
  const chips = fromCountry.some((l) => l.code === value) || !byCode[value] ? fromCountry : [...fromCountry, byCode[value]];
  const hint = (l: WorldLanguage) => (l.bible ? null : t('world.noBible'));
  const items = useMemo(
    () =>
      [...world.languages]
        .sort((a, b) => a.name_en.localeCompare(b.name_en))
        .map((l) => ({ key: l.code, title: l.name, subtitle: [l.name_en !== l.name ? l.name_en : null, l.bible ? null : t('world.noBibleShort')].filter(Boolean).join(' · ') || undefined })),
    [world, t],
  );
  const current = byCode[value];
  return (
    <View style={{ gap: 6 }}>
      <Text variant="label">{t('world.language')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {chips.map((l) => {
          const active = l.code === value;
          return (
            <Pressable
              key={l.code}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              onPress={() => onChange(l.code)}
              style={{
                borderWidth: 1,
                borderColor: active ? colors.gold : colors.border,
                backgroundColor: active ? colors.gold : 'transparent',
                borderRadius: radius.pill,
                paddingHorizontal: 16,
                paddingVertical: 8,
              }}>
              <RNText style={{ color: active ? colors.onGold : colors.text, fontFamily: fonts.bodyMedium }}>{l.name}</RNText>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setOpened((n) => n + 1);
            setOpen(true);
          }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8 }}>
          <Ionicons name="search" size={16} color={colors.gold} />
          <RNText style={{ color: colors.gold, fontFamily: fonts.bodyMedium }}>{t('world.otherLanguage')}</RNText>
        </Pressable>
      </View>
      {current && hint(current) ? <Text variant="small">{hint(current)}</Text> : null}
      <PickerModal
        key={opened}
        visible={open}
        title={t('world.language')}
        items={items}
        onClose={() => setOpen(false)}
        onPick={(code) => {
          setOpen(false);
          onChange(code);
        }}
      />
    </View>
  );
}

import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text as RNText, TextInput, View } from 'react-native';

import { formatKeyRange, splitKey } from '@/bible/reference';
import { Card, Divider, Screen, Segmented, Text, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { aiApi, type ConversationSummary } from '@/lib/ai';
import { HIGHLIGHT_COLORS, useStudy } from '@/study/store';
import { useTheme } from '@/theme';
import { fonts, radius } from '@/theme/tokens';

type Tab = 'bookmarks' | 'notes' | 'highlights' | 'ai';

function openVerse(key: number) {
  const { book, chapter, verse } = splitKey(key);
  router.navigate({ pathname: '/', params: { book, chapter: String(chapter), verse: String(verse) } });
}

function stripAccents(s: string) {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export default function Library() {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const study = useStudy();
  const [tab, setTab] = useState<Tab>('bookmarks');
  const [filter, setFilter] = useState('');
  const [chats, setChats] = useState<ConversationSummary[] | null>(null);

  useEffect(() => {
    if (tab !== 'ai') return;
    let active = true;
    aiApi
      .conversations(true)
      .then((r) => active && setChats(r.conversations))
      .catch(() => active && setChats([]));
    return () => {
      active = false;
    };
  }, [tab]);

  const notes = useMemo(() => {
    const f = stripAccents(filter.trim());
    if (!f) return study.annotations;
    return study.annotations.filter((a) =>
      stripAccents([a.title ?? '', a.body, a.tags.join(' '), formatKeyRange(a.verse_key_start, a.verse_key_end, locale)].join(' ')).includes(f),
    );
  }, [study.annotations, filter, locale]);

  const highlightsByCategory = useMemo(() => {
    const groups = new Map<string, number[]>();
    for (const h of study.highlightByKey.values()) {
      groups.set(h.category_id, [...(groups.get(h.category_id) ?? []), h.verse_key]);
    }
    for (const keys of groups.values()) keys.sort((a, b) => a - b);
    return groups;
  }, [study.highlightByKey]);

  const empty = (text: string) => (
    <Card>
      <Text variant="muted">{text}</Text>
    </Card>
  );

  return (
    <Screen>
      <Text variant="title">{t('library.title')}</Text>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'bookmarks', label: t('library.bookmarks') },
          { value: 'notes', label: t('library.notes') },
          { value: 'highlights', label: t('library.highlights') },
          { value: 'ai', label: t('library.conversations') },
        ]}
      />

      {tab === 'ai' ? (
        chats && chats.length ? (
          <Card style={{ paddingVertical: 4 }}>
            {chats.map((c, i) => (
              <View key={c.id}>
                {i > 0 ? <Divider /> : null}
                <Row
                  icon="sparkles"
                  title={c.title}
                  subtitle={t(`study.modes.${c.mode}`)}
                  onPress={() => router.navigate({ pathname: '/study', params: { c: c.id } })}
                  onRemove={() => {
                    aiApi.save(c.id, false).catch(() => {});
                    setChats((prev) => (prev ?? []).filter((x) => x.id !== c.id));
                  }}
                />
              </View>
            ))}
          </Card>
        ) : (
          empty(t('library.emptyConversations'))
        )
      ) : null}

      {tab === 'bookmarks' ? (
        study.bookmarks.length ? (
          <Card style={{ paddingVertical: 4 }}>
            {study.bookmarks.map((b, i) => (
              <View key={b.id}>
                {i > 0 ? <Divider /> : null}
                <Row
                  icon="bookmark"
                  title={formatKeyRange(b.verse_key_start, b.verse_key_end, locale)}
                  subtitle={b.translation_code?.toUpperCase() ?? undefined}
                  onPress={() => openVerse(b.verse_key_start)}
                  onRemove={() => study.removeBookmark(b.id)}
                />
              </View>
            ))}
          </Card>
        ) : (
          empty(t('library.emptyBookmarks'))
        )
      ) : null}

      {tab === 'notes' ? (
        <>
          <TextField label={t('library.filter')} value={filter} onChangeText={setFilter} autoCapitalize="none" />
          {notes.length ? (
            <Card style={{ paddingVertical: 4 }}>
              {notes.map((a, i) => (
                <View key={a.id}>
                  {i > 0 ? <Divider /> : null}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push({ pathname: '/bible/note', params: { id: a.id } })}
                    style={({ pressed }) => ({ paddingVertical: 12, gap: 4, opacity: pressed ? 0.7 : 1 })}>
                    <RNText style={{ color: colors.gold, fontFamily: fonts.bodyBold, fontSize: 14 }}>
                      {formatKeyRange(a.verse_key_start, a.verse_key_end, locale)}
                    </RNText>
                    {a.title ? <Text variant="heading">{a.title}</Text> : null}
                    <Text variant="muted" numberOfLines={3}>
                      {a.body}
                    </Text>
                    {a.tags.length ? (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {a.tags.map((tag) => (
                          <RNText
                            key={tag}
                            style={{
                              color: colors.text,
                              backgroundColor: colors.surfaceAlt,
                              borderRadius: radius.pill,
                              paddingHorizontal: 10,
                              paddingVertical: 2,
                              fontFamily: fonts.body,
                              fontSize: 12,
                              overflow: 'hidden',
                            }}>
                            #{tag}
                          </RNText>
                        ))}
                      </View>
                    ) : null}
                  </Pressable>
                </View>
              ))}
            </Card>
          ) : (
            empty(t('library.emptyNotes'))
          )}
        </>
      ) : null}

      {tab === 'highlights' ? (
        <>
          {study.highlightByKey.size === 0 ? empty(t('library.emptyHighlights')) : null}
          {study.categories.map((c) => {
            const keys = highlightsByCategory.get(c.id) ?? [];
            if (!keys.length) return null;
            return (
              <Card key={c.id} style={{ paddingVertical: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: HIGHLIGHT_COLORS[c.color].swatch }} />
                  <Text variant="heading">{c.name}</Text>
                  <Text variant="small">({keys.length})</Text>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {keys.map((k) => (
                    <Pressable
                      key={k}
                      accessibilityRole="button"
                      onPress={() => openVerse(k)}
                      style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
                      <RNText style={{ color: colors.text, fontFamily: fonts.body, fontSize: 13 }}>
                        {formatKeyRange(k, k, locale, true)}
                      </RNText>
                    </Pressable>
                  ))}
                </View>
              </Card>
            );
          })}

          <Text variant="heading">{t('library.categories')}</Text>
          <Text variant="small">{t('library.categoriesHint')}</Text>
          <Card>
            {study.categories.map((c) => (
              <CategoryRow key={c.id} color={HIGHLIGHT_COLORS[c.color].swatch} name={c.name} onRename={(n) => study.renameCategory(c.id, n)} />
            ))}
          </Card>
        </>
      ) : null}

      <Text variant="small" style={{ textAlign: 'center' }}>
        {t('library.more')}
      </Text>
    </Screen>
  );
}

function Row({
  icon,
  title,
  subtitle,
  onPress,
  onRemove,
}: {
  icon: any;
  title: string;
  subtitle?: string;
  onPress: () => void;
  onRemove: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
      <Ionicons name={icon} size={20} color={colors.gold} />
      <Pressable accessibilityRole="button" onPress={onPress} style={{ flex: 1 }}>
        <Text variant="body">{title}</Text>
        {subtitle ? <Text variant="small">{subtitle}</Text> : null}
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="remove" onPress={onRemove} hitSlop={10}>
        <Ionicons name="close" size={18} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

function CategoryRow({ color, name, onRename }: { color: string; name: string; onRename: (name: string) => void }) {
  const { colors } = useTheme();
  const [value, setValue] = useState(name);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: color }} />
      <TextInput
        value={value}
        onChangeText={setValue}
        onBlur={() => value.trim() && value.trim() !== name && onRename(value.trim())}
        maxLength={60}
        accessibilityLabel={name}
        style={{
          flex: 1,
          color: colors.text,
          fontFamily: fonts.body,
          fontSize: 16,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      />
    </View>
  );
}

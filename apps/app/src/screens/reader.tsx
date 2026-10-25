import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text as RNText,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useReadAloud } from '@/bible/read-aloud';
import { VoicePicker } from '@/bible/voice-picker';
import { bookName, formatKeyRange, verseKey } from '@/bible/reference';
import { loadPosition, loadTranslation, savePosition, type Position } from '@/bible/reader-state';
import { getChapter, listTranslations, type ChapterData, type Translation } from '@/bible/text';
import { AskSheet } from '@/components/ask-sheet';
import { LINING, Notice, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { ApiError, meApi } from '@/lib/api';
import { useSession } from '@/lib/session';
import { HIGHLIGHT_COLORS, useStudy } from '@/study/store';
import { useTheme } from '@/theme';
import { fonts, maxContentWidth, radius, space } from '@/theme/tokens';

export default function Reader() {
  const params = useLocalSearchParams<{ book?: string; chapter?: string; verse?: string; t?: string }>();
  const { t, locale } = useI18n();
  const { colors, name: themeName } = useTheme();
  const { user, setUser } = useSession();
  const study = useStudy();

  const [translation, setTranslation] = useState<string | null>(null);
  const [translations, setTranslations] = useState<Translation[]>([]);
  const [position, setPosition] = useState<Position | null>(null);
  const [data, setData] = useState<ChapterData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [flash, setFlash] = useState<number | null>(null);
  const [showType, setShowType] = useState(false);
  const [copied, setCopied] = useState(false);
  const [ask, setAsk] = useState<{ start: number; end: number; label: string } | null>(null);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const verseY = useRef<Record<number, number>>({});

  const rtl = translations.find((x) => x.code === translation)?.direction === 'rtl';
  const fontScale = Number(user?.preferences.font_scale ?? 1);
  const lineHeight = Number(user?.preferences.line_height ?? 1.6);

  // Posição inicial: parâmetros da rota (vindos da busca/biblioteca) ou onde o usuário parou
  useEffect(() => {
    listTranslations()
      .then(setTranslations)
      .catch(() => {});
  }, []);

  // Cada idioma do app tem a sua Bíblia: ao trocar o idioma, o leitor troca junto
  const firstLoad = useRef(true);
  useEffect(() => {
    const fromRoute = firstLoad.current ? params.t : undefined;
    firstLoad.current = false;
    loadTranslation(locale).then((code) => setTranslation(fromRoute ?? code));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  // Rota com livro/capítulo (busca, biblioteca, seletor) tem prioridade; muda a posição durante o render
  const paramKey = params.book && params.chapter ? `${params.book}:${params.chapter}:${params.verse ?? ''}` : null;
  const [seenParamKey, setSeenParamKey] = useState<string | null>(null);
  if (paramKey !== seenParamKey) {
    setSeenParamKey(paramKey);
    if (paramKey) {
      setSelected([]);
      setPosition({ book: params.book!, chapter: Number(params.chapter), verse: params.verse ? Number(params.verse) : null });
    }
  }
  const [seenT, setSeenT] = useState<string | undefined>(undefined);
  if (params.t !== seenT) {
    setSeenT(params.t);
    if (params.t) setTranslation(params.t);
  }

  // Sem rota: continua de onde parou
  useEffect(() => {
    if (!paramKey) loadPosition().then((p) => setPosition((cur) => cur ?? p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!translation || !position) return;
    let active = true;
    verseY.current = {};
    getChapter(translation, position.book, position.chapter)
      .then((d) => {
        if (!active) return;
        setError(null);
        setData(d);
        savePosition(position, translation);
        if (position.verse) setFlash(verseKey(position.book, position.chapter, position.verse));
        else scrollRef.current?.scrollTo({ y: 0, animated: false });
      })
      .catch((e) => active && setError(e instanceof ApiError ? e.code : 'load_error'));
    return () => {
      active = false;
    };
  }, [translation, position]);

  // Leva até o versículo pedido e o destaca por um instante
  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => {
      const y = verseY.current[flash % 1000];
      if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, y - 80), animated: true });
    }, 120);
    const clear = setTimeout(() => setFlash(null), 2200);
    return () => {
      clearTimeout(timer);
      clearTimeout(clear);
    };
  }, [flash, data]);

  const go = useCallback((target: { book: string; chapter: number } | null) => {
    if (!target) return;
    setSelected([]);
    setPosition({ book: target.book, chapter: target.chapter });
  }, []);

  // Setas do teclado no navegador
  useEffect(() => {
    if (Platform.OS !== 'web' || !data) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') go(data.prev);
      if (e.key === 'ArrowRight') go(data.next);
    };
    globalThis.addEventListener('keydown', onKey);
    return () => globalThis.removeEventListener('keydown', onKey);
  }, [data, go]);

  const current = translations.find((x) => x.code === translation);
  const abbr = current?.abbreviation ?? translation?.toUpperCase() ?? '';
  // Ouvir o capítulo (vozes do aparelho)
  const aloud = useReadAloud();
  const [voiceOpen, setVoiceOpen] = useState(false);
  const { stop: stopAloud } = aloud;
  useEffect(() => stopAloud, [data?.book, data?.chapter, translation, stopAloud]);

  const bookmarkStarts = useMemo(() => {
    const set = new Set<number>();
    for (const b of study.bookmarks) for (let k = b.verse_key_start; k <= b.verse_key_end; k++) set.add(k);
    return set;
  }, [study.bookmarks]);
  const noteKeys = useMemo(() => {
    const map = new Map<number, string>();
    for (const a of study.annotations) {
      if (a.scope === 'verse' || a.scope === 'range') map.set(a.verse_key_start, a.id);
    }
    return map;
  }, [study.annotations]);

  const sortedSel = [...selected].sort((a, b) => a - b);
  const selLabel = sortedSel.length ? formatKeyRange(sortedSel[0], sortedSel[sortedSel.length - 1], locale) : '';
  const selText = data ? data.verses.filter((v) => selected.includes(verseKey(data.book, data.chapter, v.verse))) : [];
  const selBookmark = study.bookmarks.find(
    (b) => sortedSel.length && b.verse_key_start === sortedSel[0] && b.verse_key_end === sortedSel[sortedSel.length - 1],
  );
  const selHighlighted = sortedSel.some((k) => study.highlightByKey.has(k));

  function toggleVerse(key: number) {
    setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));
  }

  function quote() {
    const body = selText.map((v) => (selText.length > 1 ? `${v.verse} ${v.text}` : v.text)).join(' ');
    return `“${body}” — ${selLabel} (${abbr})`;
  }

  async function copy() {
    await Clipboard.setStringAsync(quote());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function share() {
    try {
      if (Platform.OS === 'web' && !(globalThis.navigator as any)?.share) {
        await copy();
        return;
      }
      await Share.share({ message: quote() });
    } catch {
      await copy();
    }
  }

  async function changeType(next: { font_scale?: number; line_height?: number }) {
    if (!user) return;
    const preferences = { ...user.preferences, ...next };
    setUser({ ...user, preferences });
    meApi.updatePreferences(next).catch(() => {});
  }

  const bodySize = 19 * fontScale;
  const highlightBg = (key: number) => {
    const h = study.highlightByKey.get(key);
    if (!h) return undefined;
    const cat = study.categories.find((c) => c.id === h.category_id);
    return cat ? HIGHLIGHT_COLORS[cat.color][themeName] : undefined;
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'left', 'right']}>
      {/* Barra superior */}
      <View style={[styles.toolbar, { borderBottomColor: colors.border }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('bible.chooseBook')}
          onPress={() => position && router.push({ pathname: '/bible/books', params: { book: position.book, t: translation ?? undefined } })}
          style={styles.titleButton}>
          <RNText style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {position ? `${bookName(position.book, locale)} ${position.chapter}` : '…'}
          </RNText>
          <Ionicons name="chevron-down" size={18} color={colors.gold} />
        </Pressable>
        <View style={styles.toolbarRight}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('bible.translation')}
            onPress={() => router.push({ pathname: '/bible/translations', params: { current: translation ?? '' } })}
            style={[styles.chip, { borderColor: colors.border }]}>
            <RNText style={{ color: colors.text, fontFamily: fonts.bodyBold, fontSize: 13 }}>{abbr}</RNText>
          </Pressable>
          <IconButton
            icon="images-outline"
            label={t('visual.title')}
            onPress={() => position && router.push({ pathname: '/bible/visual', params: { book: position.book, chapter: String(position.chapter) } })}
          />
          <IconButton
            icon={aloud.playing ? 'stop-circle-outline' : 'headset-outline'}
            label={aloud.playing ? t('bible.stopListening') : t('bible.listen')}
            onPress={() => (aloud.playing ? aloud.stop() : data && aloud.play(data.verses, current?.language ?? locale))}
          />
          <IconButton icon="text" label={t('bible.fontSize')} onPress={() => setShowType((v) => !v)} />
          <IconButton icon="search" label={t('bible.search')} onPress={() => router.push({ pathname: '/bible/search', params: { t: translation ?? '' } })} />
        </View>
      </View>

      {showType ? (
        <View style={[styles.typePanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text variant="label">{t('bible.fontSize')}</Text>
          <View style={styles.row}>
            <StepButton label="A−" onPress={() => changeType({ font_scale: Math.max(0.8, +(fontScale - 0.1).toFixed(2)) })} />
            <Text variant="muted">{Math.round(fontScale * 100)}%</Text>
            <StepButton label="A+" onPress={() => changeType({ font_scale: Math.min(2, +(fontScale + 0.1).toFixed(2)) })} />
          </View>
          <Text variant="label">{t('bible.lineSpacing')}</Text>
          <View style={styles.row}>
            <StepButton label="−" onPress={() => changeType({ line_height: Math.max(1.2, +(lineHeight - 0.1).toFixed(2)) })} />
            <Text variant="muted">{lineHeight.toFixed(1)}</Text>
            <StepButton label="+" onPress={() => changeType({ line_height: Math.min(2.4, +(lineHeight + 0.1).toFixed(2)) })} />
          </View>
        </View>
      ) : null}

      {study.status === 'offline' && study.pending > 0 ? (
        <View style={styles.banner}>
          <Notice>{t('bible.syncOffline')}</Notice>
        </View>
      ) : null}
      {study.conflicts.length ? (
        <Pressable style={styles.banner} onPress={study.dismissConflicts}>
          <Notice>{t('bible.conflict')}</Notice>
        </Pressable>
      ) : null}

      <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll}>
        <View style={styles.page}>
          {error ? (
            <Notice kind="error">{error === 'book_not_in_translation' ? t('bible.notInTranslation') : t('bible.loadError')}</Notice>
          ) : !data || !position ? (
            <ActivityIndicator color={colors.gold} style={{ marginTop: 48 }} />
          ) : (
            <>
              <RNText style={[styles.chapterTitle, { color: colors.text }]}>
                {bookName(data.book, locale)} {data.chapter}
              </RNText>
              {data.verses.map((v) => {
                const key = verseKey(data.book, data.chapter, v.verse);
                const isSel = selected.includes(key);
                const reading = aloud.current === v.verse;
                const bg = isSel || reading ? colors.surfaceAlt : flash === key ? colors.surfaceAlt : highlightBg(key);
                return (
                  <Pressable
                    key={v.verse}
                    onPress={() => toggleVerse(key)}
                    onLayout={(e) => (verseY.current[v.verse] = e.nativeEvent.layout.y)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSel }}
                    style={[styles.verse, bg ? { backgroundColor: bg } : null]}>
                    <RNText
                      style={{
                        color: colors.text,
                        fontFamily: 'Literata_400Regular',
                        fontSize: bodySize,
                        lineHeight: bodySize * lineHeight,
                        textDecorationLine: isSel ? 'underline' : 'none',
                        textDecorationStyle: 'dotted',
                        // Árabe, hebraico, persa…: da direita para a esquerda
                        ...(rtl ? { writingDirection: 'rtl' as const, textAlign: 'right' as const } : null),
                      }}>
                      {bookmarkStarts.has(key) ? (
                        <RNText style={{ color: colors.gold }}>
                          <Ionicons name="bookmark" size={bodySize * 0.65} color={colors.gold} />{' '}
                        </RNText>
                      ) : null}
                      <RNText style={[styles.verseNumber, { color: colors.gold, fontSize: bodySize * 0.62 }]}>
                        {v.verse}{' '}
                      </RNText>
                      {v.text}
                      {noteKeys.has(key) ? (
                        <RNText
                          onPress={() => router.push({ pathname: '/bible/note', params: { id: noteKeys.get(key)! } })}
                          style={{ color: colors.gold }}>
                          {'  '}
                          <Ionicons name="create-outline" size={bodySize * 0.8} color={colors.gold} />
                        </RNText>
                      ) : null}
                    </RNText>
                  </Pressable>
                );
              })}

              <View style={styles.navRow}>
                <NavButton icon="chevron-back" label={t('bible.previous')} disabled={!data.prev} onPress={() => go(data.prev)} />
                <NavButton icon="chevron-forward" label={t('bible.next')} disabled={!data.next} onPress={() => go(data.next)} right />
              </View>
              {current ? (
                <Pressable onPress={() => router.push({ pathname: '/bible/info/[code]', params: { code: current.code } })}>
                  <Text variant="small" style={{ textAlign: 'center', marginTop: space.lg }}>
                    {current.name} ({current.abbreviation}) · {current.license} · {t('bible.credits')}
                  </Text>
                </Pressable>
              ) : null}
            </>
          )}
        </View>
      </ScrollView>

      {/* Ações do versículo selecionado */}
      {sortedSel.length ? (
        <View style={[styles.actionSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.sheetHeader}>
            <Text variant="heading">{selLabel}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={t('bible.close')} onPress={() => setSelected([])} hitSlop={12}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>
          <View style={styles.swatches}>
            {study.categories.map((c) => (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                accessibilityLabel={`${t('bible.highlight')}: ${c.name}`}
                onPress={() => {
                  study.setHighlight(sortedSel, c.id);
                  setSelected([]);
                }}
                style={styles.swatchItem}>
                <View style={[styles.swatch, { backgroundColor: HIGHLIGHT_COLORS[c.color].swatch }]} />
                <RNText style={[styles.swatchLabel, { color: colors.textMuted }]} numberOfLines={1}>
                  {c.name}
                </RNText>
              </Pressable>
            ))}
            {selHighlighted ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('bible.removeHighlight')}
                onPress={() => {
                  study.setHighlight(sortedSel, null);
                  setSelected([]);
                }}
                style={styles.swatchItem}>
                <View style={[styles.swatch, styles.swatchClear, { borderColor: colors.border }]}>
                  <Ionicons name="close" size={16} color={colors.textMuted} />
                </View>
                <RNText style={[styles.swatchLabel, { color: colors.textMuted }]}>{t('bible.removeHighlight')}</RNText>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.actions}>
            <Action
              icon={selBookmark ? 'bookmark' : 'bookmark-outline'}
              label={selBookmark ? t('bible.removeBookmark') : t('bible.bookmark')}
              onPress={() => {
                if (selBookmark) study.removeBookmark(selBookmark.id);
                else study.addBookmark(sortedSel[0], sortedSel[sortedSel.length - 1], translation);
                setSelected([]);
              }}
            />
            <Action
              icon="create-outline"
              label={t('bible.note')}
              onPress={() => {
                const start = sortedSel[0];
                const end = sortedSel[sortedSel.length - 1];
                setSelected([]);
                router.push({ pathname: '/bible/note', params: { start: String(start), end: String(end) } });
              }}
            />
            <Action
              icon="sparkles-outline"
              label={t('study.askAI')}
              onPress={() => {
                const start = sortedSel[0];
                const end = sortedSel[sortedSel.length - 1];
                setAsk({ start, end, label: `${selLabel} (${abbr})` });
                setSelected([]);
              }}
            />
            <Action
              icon="layers-outline"
              label={t('bible.deepen')}
              onPress={() => {
                const start = sortedSel[0];
                const end = sortedSel[sortedSel.length - 1];
                setSelected([]);
                router.push({ pathname: '/bible/verse', params: { start: String(start), end: String(end), t: translation ?? 'blivre' } });
              }}
            />
            <Action icon={copied ? 'checkmark' : 'copy-outline'} label={copied ? t('bible.copied') : t('bible.copy')} onPress={copy} />
            <Action icon="share-outline" label={t('bible.share')} onPress={share} />
            <Action
              icon="image-outline"
              label={t('shareImage.action')}
              onPress={() => {
                const body = selText.map((v) => (selText.length > 1 ? `${v.verse} ${v.text}` : v.text)).join(' ');
                setSelected([]);
                router.push({ pathname: '/bible/share-image', params: { text: body, reference: `${selLabel} (${abbr})` } });
              }}
            />
          </View>
        </View>
      ) : null}
      {ask && translation ? (
        <AskSheet visible onClose={() => setAsk(null)} label={ask.label} start={ask.start} end={ask.end} translation={translation} />
      ) : null}
      {aloud.playing && data ? (
        <View style={[styles.player, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="headset" size={20} color={colors.gold} />
          <RNText style={{ flex: 1, color: colors.text, fontFamily: fonts.bodyMedium }} numberOfLines={1}>
            {bookName(data.book, locale)} {data.chapter}
            {aloud.current ? `:${aloud.current}` : ''}
          </RNText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('bible.speed')}
            onPress={() => aloud.setRate(aloud.rate >= 1.5 ? 0.75 : aloud.rate + 0.25)}
            style={[styles.chip, { borderColor: colors.border }]}>
            <RNText style={{ color: colors.text, fontFamily: fonts.bodyBold, fontSize: 13 }}>{aloud.rate}×</RNText>
          </Pressable>
          <IconButton icon="mic-outline" label={t('bible.voice')} onPress={() => setVoiceOpen(true)} />
          <IconButton icon="stop" label={t('bible.stopListening')} onPress={aloud.stop} />
        </View>
      ) : null}
      {voiceOpen && aloud.language ? (
        <VoicePicker language={aloud.language} onClose={() => setVoiceOpen(false)} onChanged={aloud.reloadVoice} />
      ) : null}
    </SafeAreaView>
  );
}

function IconButton({ icon, label, onPress }: { icon: any; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={8} style={styles.iconButton}>
      <Ionicons name={icon} size={21} color={colors.text} />
    </Pressable>
  );
}

function StepButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.step, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
      <RNText style={{ color: colors.text, fontFamily: fonts.bodyBold, fontSize: 16 }}>{label}</RNText>
    </Pressable>
  );
}

function NavButton({
  icon,
  label,
  onPress,
  disabled,
  right,
}: {
  icon: any;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  right?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={[styles.navButton, { borderColor: colors.border, opacity: disabled ? 0.35 : 1 }]}>
      {!right ? <Ionicons name={icon} size={18} color={colors.gold} /> : null}
      <RNText style={{ color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 15 }}>{label}</RNText>
      {right ? <Ionicons name={icon} size={18} color={colors.gold} /> : null}
    </Pressable>
  );
}

function Action({ icon, label, onPress }: { icon: any; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.action}>
      <Ionicons name={icon} size={22} color={colors.gold} />
      <RNText style={{ color: colors.text, fontFamily: fonts.body, fontSize: 12 }} numberOfLines={1}>
        {label}
      </RNText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: space.sm,
  },
  titleButton: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, paddingVertical: 6 },
  title: { fontFamily: fonts.displayBold, fontSize: 24, fontVariant: LINING },
  toolbarRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  player: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  chip: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6, marginRight: 4 },
  iconButton: { padding: 8 },
  typePanel: {
    marginHorizontal: space.md,
    marginTop: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: space.sm,
    alignSelf: 'center',
    width: '100%',
    maxWidth: maxContentWidth,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  step: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 8 },
  banner: { paddingHorizontal: space.md, paddingTop: space.sm, width: '100%', maxWidth: maxContentWidth + 32, alignSelf: 'center' },
  scroll: { paddingHorizontal: space.md, paddingTop: space.lg, paddingBottom: 220 },
  page: { width: '100%', maxWidth: 680, alignSelf: 'center' },
  chapterTitle: { fontFamily: fonts.displayBold, fontSize: 34, marginBottom: space.md, fontVariant: LINING },
  verse: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, marginHorizontal: -6, marginBottom: 4 },
  verseNumber: { fontFamily: fonts.bodyBold },
  navRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.xl, gap: space.md },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  actionSheet: {
    position: 'absolute',
    left: space.sm,
    right: space.sm,
    bottom: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space.md,
    gap: space.md,
    maxWidth: 620,
    alignSelf: 'center',
    marginHorizontal: 'auto',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  swatchItem: { alignItems: 'center', width: 76, gap: 4 },
  swatch: { width: 34, height: 34, borderRadius: 17 },
  swatchClear: { borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  swatchLabel: { fontFamily: fonts.body, fontSize: 11, textAlign: 'center' },
  actions: { flexDirection: 'row', justifyContent: 'space-around' },
  action: { alignItems: 'center', gap: 4, minWidth: 64, paddingVertical: 4 },
});

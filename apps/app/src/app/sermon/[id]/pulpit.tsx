// Modo púlpito: tela cheia, sem distrações, com cronômetro regressivo, navegação por seções,
// tela sempre acesa, notas rápidas, leitura offline e o telão da igreja (toque no texto para mostrar).

import Ionicons from '@expo/vector-icons/Ionicons';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text as RNText, TextInput, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Notice, Segmented, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { ApiError } from '@/lib/api';
import { kvGet, kvSet } from '@/lib/kv';
import { rememberedScreen, rememberScreen, screenApi, type ScreenState } from '@/lib/screens';
import { sermonApi, type Block } from '@/lib/sermons';
import { docFromSermon, formatClock, memorize, outlineLines, stripMarkdown, type Doc, type PulpitMode } from '@/sermon/document';
import { loadLocal, localFromServer, pulpitScrollKey, queuePulpitNote, saveLocal, takePendingNotes } from '@/sermon/local';
import { ScreenConnect } from '@/sermon/screen-connect';
import { useTheme } from '@/theme';
import { fonts, radius } from '@/theme/tokens';

const FONT_KEY = 'pulpit:font';
const MODE_KEY = 'pulpit:mode';
const minutesKey = (id: string) => `pulpit:minutes:${id}`;
// Cores do tempo: amarelo nos 10 minutos finais, vermelho nos 5 finais
const WARN = '#FACC15';
const DEFAULT_MINUTES = 30;

/** Parágrafos de um bloco de texto (cada um pode ir para o telão sozinho). */
function paragraphs(text: string): string[] {
  const clean = stripMarkdown(text).trim();
  const parts = clean.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return parts.length > 1 ? parts : clean.split('\n').map((p) => p.trim()).filter(Boolean);
}
// Fila única de ativar/desativar a tela acesa (ver o efeito abaixo)
let keepAwakeQueue: Promise<unknown> = Promise.resolve();

export default function PulpitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const { colors } = useTheme();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [missing, setMissing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [notes, setNotes] = useState('');
  const [mode, setMode] = useState<PulpitMode>('pulpit');
  const [font, setFont] = useState(22);
  const [noteText, setNoteText] = useState('');
  const [noteStatus, setNoteStatus] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  // Cronômetro
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef<number | null>(null);
  const accumulated = useRef(0);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [editTime, setEditTime] = useState(false);

  // Telão da igreja
  const [screen, setScreen] = useState<ScreenState | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [onScreen, setOnScreen] = useState<string | null>(null);
  const [screenMsg, setScreenMsg] = useState<string | null>(null);
  const [bgBusy, setBgBusy] = useState(false);

  // Rolagem e seções
  const scroll = useRef<ScrollViewInstance>(null);
  const sectionY = useRef<Record<string, number>>({});
  const savedScroll = useRef<number | null>(null);
  const restored = useRef(false);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // No navegador sem Wake Lock (ou sem permissão) a ativação falha, e desativar uma trava que
    // não chegou a ativar lança "has not activated yet". Ativar e desativar ficam em fila (no
    // React StrictMode a tela monta duas vezes) e só desativa o que realmente ativou.
    let ok = false;
    keepAwakeQueue = keepAwakeQueue
      .then(() => activateKeepAwakeAsync('pulpit'))
      .then(
        () => {
          ok = true;
        },
        () => {},
      );
    return () => {
      keepAwakeQueue = keepAwakeQueue
        .then(() => (ok ? deactivateKeepAwake('pulpit') : undefined))
        .catch(() => {});
    };
  }, []);

  useEffect(() => {
    kvGet<number>(FONT_KEY).then((f) => f && setFont(f));
    kvGet<PulpitMode>(MODE_KEY).then((m) => m && setMode(m));
    kvGet<number>(minutesKey(id)).then((m) => m && setMinutes(m));
    // Tela já conectada neste aparelho: passa a acompanhar esta ministração, sem escanear de novo
    rememberedScreen().then(async (saved) => {
      if (!saved) return;
      try {
        const state = await screenApi.follow(saved.id, id);
        setScreen(state);
        // Primeira vez desta ministração na tela: a IA cria o fundo dos slides
        if (!state.background.id && state.can_generate) newBackground(state.id);
      } catch {
        rememberScreen(null);
      }
    });
    kvGet<number>(pulpitScrollKey(id)).then((y) => {
      savedScroll.current = y;
    });
    (async () => {
      const local = await loadLocal(id);
      if (local) setDoc(local.doc);
      try {
        const s = await sermonApi.get(id);
        setNotes(s.pulpit_notes);
        // Rascunho local ainda não enviado vale mais que o servidor
        if (!local?.dirty) {
          setDoc(docFromSermon(s));
          saveLocal(id, localFromServer(s));
        }
        for (const text of await takePendingNotes(id)) {
          const r = await sermonApi.pulpitNote(id, text).catch(() => null);
          if (r) setNotes(r.pulpit_notes);
          else await queuePulpitNote(id, text);
        }
      } catch {
        setOffline(true);
        if (!local) setMissing(true);
      }
    })();
  }, [id]);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      if (startedAt.current !== null) setElapsed(accumulated.current + (Date.now() - startedAt.current) / 1000);
    }, 500);
    return () => clearInterval(timer);
  }, [running]);

  function toggleTimer() {
    if (running) {
      accumulated.current += (Date.now() - (startedAt.current ?? Date.now())) / 1000;
      startedAt.current = null;
      setElapsed(accumulated.current);
      setRunning(false);
    } else {
      startedAt.current = Date.now();
      setRunning(true);
    }
  }

  function resetTimer() {
    accumulated.current = 0;
    startedAt.current = running ? Date.now() : null;
    setElapsed(0);
  }

  function changeMinutes(delta: number) {
    setMinutes((m) => {
      const next = Math.min(240, Math.max(1, (m ?? (Number(doc?.meta.duration) || DEFAULT_MINUTES)) + delta));
      kvSet(minutesKey(id), next);
      return next;
    });
  }

  async function connected(state: ScreenState) {
    setConnectOpen(false);
    setScreen(state);
    setOnScreen(null);
    rememberScreen({ id: state.id, code: state.code });
    // Primeira vez com esta ministração: a IA cria o fundo dos slides
    if (!state.background.id && state.can_generate) newBackground(state.id);
  }

  async function show(key: string | null, text: string, reference?: string | null) {
    if (!screen) return;
    setOnScreen(key);
    setScreenMsg(null);
    try {
      setScreen(await screenApi.show(screen.id, text, reference));
    } catch (e) {
      if (e instanceof ApiError && e.code === 'screen_not_found') {
        setScreen(null);
        rememberScreen(null);
        setScreenMsg(t('screen.lost'));
      } else setScreenMsg(t('study.errors.generic'));
    }
  }

  async function newBackground(screenId = screen?.id) {
    if (!screenId) return;
    setBgBusy(true);
    setScreenMsg(t('screen.creatingBackground'));
    try {
      setScreen(await screenApi.background(screenId));
      setScreenMsg(null);
    } catch (e) {
      setScreenMsg(e instanceof ApiError && e.code === 'slides_quota' ? t('screen.quota') : t('screen.backgroundFailed'));
    } finally {
      setBgBusy(false);
    }
  }

  async function disconnect() {
    if (!screen) return;
    await screenApi.end(screen.id).catch(() => {});
    rememberScreen(null);
    setScreen(null);
    setOnScreen(null);
  }

  function changeFont(delta: number) {
    setFont((f) => {
      const next = Math.min(44, Math.max(14, f + delta));
      kvSet(FONT_KEY, next);
      return next;
    });
  }

  function changeMode(m: PulpitMode) {
    setMode(m);
    kvSet(MODE_KEY, m);
  }

  function exit() {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/sermon/[id]', params: { id } });
  }

  async function sendNote() {
    const text = noteText.trim();
    if (!text) return;
    setNoteText('');
    try {
      const r = await sermonApi.pulpitNote(id, text);
      setNotes(r.pulpit_notes);
      setNoteStatus(t('sermons.pulpit.noteSaved'));
    } catch (e) {
      if (e instanceof ApiError && e.status !== 0) {
        setNoteText(text);
        setNoteStatus(t('study.errors.generic'));
        return;
      }
      await queuePulpitNote(id, text);
      setNoteStatus(t('sermons.pulpit.noteQueued'));
    }
  }

  if (missing) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, padding: 16, justifyContent: 'center', gap: 16 }}>
        <Notice kind="error">{t('sermons.pulpit.notAvailable')}</Notice>
        <IconButton icon="close" label={t('sermons.pulpit.exit')} onPress={exit} />
      </SafeAreaView>
    );
  }
  if (!doc) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  const total = (minutes ?? (Number(doc.meta.duration) || DEFAULT_MINUTES)) * 60;
  const remaining = total - elapsed;
  const timeColor = remaining <= 5 * 60 ? colors.danger : remaining <= 10 * 60 ? WARN : colors.text;
  const sections = doc.blocks.filter((b): b is Extract<Block, { type: 'section' }> => b.type === 'section');
  const body = { color: colors.text, fontFamily: fonts.body, fontSize: font, lineHeight: Math.round(font * 1.5) };

  function screenButton(k: string, text: string, reference?: string | null) {
    if (!screen) return null;
    const active = onScreen === k;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('screen.showOnScreen')}
        onPress={() => (active ? show(null, '') : show(k, text, reference))}
        hitSlop={6}
        style={{
          padding: 7,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: active ? colors.gold : colors.border,
          backgroundColor: active ? colors.gold : 'transparent',
          alignSelf: 'flex-start',
        }}>
        <Ionicons name={active ? 'tv' : 'tv-outline'} size={18} color={active ? colors.onGold : colors.gold} />
      </Pressable>
    );
  }

  function showable(key: string | number, k: string, text: string, reference: string | null, children: ReactNode) {
    if (!screen) return children;
    return (
      <View
        key={key}
        style={{
          flexDirection: 'row',
          gap: 10,
          alignItems: 'flex-start',
          borderRadius: radius.sm,
          backgroundColor: onScreen === k ? colors.surfaceAlt : 'transparent',
          padding: onScreen === k ? 6 : 0,
        }}>
        {screenButton(k, text, reference)}
        <View style={{ flex: 1 }}>{children}</View>
      </View>
    );
  }

  function renderBlock(b: Block) {
    switch (b.type) {
      case 'section':
        return (
          <RNText style={{ color: colors.gold, fontFamily: fonts.bodyBold, fontSize: Math.round(font * 1.2), lineHeight: Math.round(font * 1.6), marginTop: 12 }}>
            {b.title || t(`sermons.roles.${b.role}`)}
          </RNText>
        );
      case 'text': {
        if (!b.text.trim()) return null;
        if (mode === 'outline') {
          return (
            <View style={{ gap: 4 }}>
              {outlineLines(b.text).map((l, i) => (
                <RNText key={i} style={body}>
                  •  {l}
                </RNText>
              ))}
            </View>
          );
        }
        if (screen) {
          // Com o telão: cada parágrafo pode ser mostrado sozinho
          return (
            <View style={{ gap: Math.round(font * 0.5) }}>
              {paragraphs(b.text).map((para, i) => (
                showable(i, `${b.id}:${i}`, para, null, <RNText style={body}>{mode === 'memorize' ? memorize(para) : para}</RNText>)
              ))}
            </View>
          );
        }
        return <RNText style={body}>{mode === 'memorize' ? memorize(b.text) : stripMarkdown(b.text)}</RNText>;
      }
      case 'scripture': {
        const verses = b.verses.map((v) => v.text).join(' ');
        if (screen) {
          // Passagem inteira ou um versículo de cada vez
          return (
            <View style={{ borderLeftWidth: 3, borderColor: colors.gold, paddingLeft: 12, gap: 6 }}>
              {showable('all', b.id, verses, b.reference, <RNText style={{ ...body, fontFamily: fonts.bodyBold }}>{b.reference}</RNText>)}
              {b.verses.length > 1
                ? b.verses.map((v) => (
                    showable(
                      v.verse,
                      `${b.id}:${v.verse}`,
                      v.text,
                      verseRef(b.reference, v.verse),
                      <RNText style={{ ...body, fontStyle: 'italic' }}>
                        <RNText style={{ color: colors.gold, fontSize: Math.round(font * 0.7) }}>{v.verse} </RNText>
                        {v.text}
                      </RNText>,
                    )
                  ))
                : <RNText style={{ ...body, fontStyle: 'italic' }}>{verses}</RNText>}
            </View>
          );
        }
        return (
          <View style={{ borderLeftWidth: 3, borderColor: colors.gold, paddingLeft: 12, gap: 4 }}>
            <RNText style={{ ...body, fontFamily: fonts.bodyBold }}>{b.reference}</RNText>
            {mode === 'outline' ? null : (
              <RNText style={{ ...body, fontStyle: 'italic' }}>{mode === 'memorize' ? memorize(verses) : verses}</RNText>
            )}
          </View>
        );
      }
      case 'note':
        if (mode !== 'full' || !b.text.trim()) return null;
        return (
          <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: colors.goldMuted, borderRadius: radius.sm, padding: 8 }}>
            <RNText style={{ ...body, fontSize: Math.round(font * 0.8), color: colors.textMuted }}>{b.text}</RNText>
          </View>
        );
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Controles */}
      <View style={{ borderBottomWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <IconButton icon="close" label={t('sermons.pulpit.exit')} onPress={exit} />
          <View style={{ flex: 1 }}>
            <Text variant="heading" numberOfLines={1}>
              {doc.meta.title}
            </Text>
          </View>
          <IconButton icon={screen ? 'tv' : 'tv-outline'} label={t('screen.share')} onPress={() => setConnectOpen(true)} active={!!screen} />
          <IconButton icon="remove" label={t('sermons.pulpit.smaller')} onPress={() => changeFont(-2)} />
          <IconButton icon="add" label={t('sermons.pulpit.larger')} onPress={() => changeFont(2)} />
        </View>
        <Segmented
          value={mode}
          onChange={changeMode}
          options={(['full', 'outline', 'memorize', 'pulpit'] as const).map((m) => ({ value: m, label: t(`sermons.pulpit.modes.${m}`) }))}
        />
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            borderRadius: radius.md,
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderWidth: 1,
            borderColor: timeColor === colors.text ? colors.border : timeColor,
          }}>
          <RNText
            accessibilityLabel={t('sermons.pulpit.remaining', { t: formatClock(Math.max(0, remaining)) })}
            accessibilityLiveRegion="polite"
            style={{ color: timeColor, fontFamily: fonts.bodyBold, fontSize: 30, fontVariant: ['tabular-nums'] }}>
            {remaining >= 0 ? formatClock(remaining) : `+${formatClock(-remaining)}`}
          </RNText>
          <Pressable accessibilityRole="button" onPress={() => setEditTime((v) => !v)} style={{ flex: 1 }}>
            <Text variant="small" style={{ color: timeColor === colors.text ? colors.textMuted : timeColor }}>
              {remaining >= 0 ? t('screen.timeOf', { n: total / 60 }) : t('sermons.pulpit.over', { t: formatClock(-remaining) })}
            </Text>
            <Text variant="small" style={{ color: colors.gold }}>
              {t('screen.setTime')}
            </Text>
          </Pressable>
          <IconButton icon={running ? 'pause' : 'play'} label={running ? t('sermons.pulpit.pause') : t('sermons.pulpit.start')} onPress={toggleTimer} />
          <IconButton icon="refresh" label={t('sermons.pulpit.reset')} onPress={resetTimer} />
        </View>
        {editTime ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text variant="small">{t('screen.duration')}</Text>
            {[-10, -5, -1].map((d) => (
              <Chip key={d} label={`${d}`} onPress={() => changeMinutes(d)} />
            ))}
            <RNText style={{ color: colors.text, fontFamily: fonts.bodyBold, fontSize: 18, minWidth: 64, textAlign: 'center' }}>
              {total / 60} min
            </RNText>
            {[1, 5, 10].map((d) => (
              <Chip key={d} label={`+${d}`} onPress={() => changeMinutes(d)} />
            ))}
          </View>
        ) : null}
        {screen ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Ionicons name="tv" size={16} color={colors.gold} />
            <Text variant="small" style={{ flex: 1, color: colors.gold }}>
              {t('screen.connected')}
            </Text>
            <Chip label={t('screen.clear')} onPress={() => show(null, '')} />
            <Chip label={bgBusy ? t('screen.creatingShort') : t('screen.newBackground')} onPress={() => (bgBusy ? undefined : newBackground())} />
            <Chip label={t('screen.disconnect')} onPress={disconnect} />
          </View>
        ) : null}
        {screenMsg ? <Text variant="small">{screenMsg}</Text> : null}
        {sections.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {sections.map((s, i) => (
              <Pressable
                key={s.id}
                accessibilityRole="button"
                onPress={() => scroll.current?.scrollTo({ y: Math.max(0, (sectionY.current[s.id] ?? 0) - 8), animated: true })}
                style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 }}>
                <RNText style={{ color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 13 }} numberOfLines={1}>
                  {i + 1}. {s.title || t(`sermons.roles.${s.role}`)}
                </RNText>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
      </View>

      {offline ? (
        <View style={{ padding: 8 }}>
          <Notice>{t('sermons.pulpit.offline')}</Notice>
        </View>
      ) : null}

      <ScrollView
        ref={scroll}
        scrollEventThrottle={200}
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y;
          if (scrollTimer.current) clearTimeout(scrollTimer.current);
          scrollTimer.current = setTimeout(() => kvSet(pulpitScrollKey(id), y), 400);
        }}
        onContentSizeChange={(_, h) => {
          // Volta para onde o pregador parou (uma vez, quando o conteúdo já tem altura suficiente)
          const y = savedScroll.current;
          if (!restored.current && y !== null && h > y) {
            restored.current = true;
            scroll.current?.scrollTo({ y, animated: false });
          }
        }}
        contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
        <View style={{ width: '100%', maxWidth: 900, alignSelf: 'center', gap: Math.round(font * 0.7) }}>
          {doc.blocks.map((b) => (
            <View
              key={b.id}
              onLayout={b.type === 'section' ? (e) => (sectionY.current[b.id] = e.nativeEvent.layout.y) : undefined}>
              {renderBlock(b)}
            </View>
          ))}
        </View>
      </ScrollView>

      {connectOpen ? <ScreenConnect sermonId={id} onClose={() => setConnectOpen(false)} onConnected={connected} /> : null}

      {/* Notas rápidas */}
      <View style={{ borderTopWidth: 1, borderColor: colors.border, padding: 10, gap: 6 }}>
        {noteStatus ? <Text variant="small">{noteStatus}</Text> : null}
        {showNotes && notes ? (
          <ScrollView style={{ maxHeight: 140 }}>
            <Text variant="small">{notes}</Text>
          </ScrollView>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%', maxWidth: 900, alignSelf: 'center' }}>
          <IconButton icon="list-outline" label={t('sermons.pulpit.notes')} onPress={() => setShowNotes((v) => !v)} />
          <TextInput
            value={noteText}
            onChangeText={(v) => {
              setNoteText(v);
              setNoteStatus(null);
            }}
            onSubmitEditing={sendNote}
            placeholder={t('sermons.pulpit.notePlaceholder')}
            placeholderTextColor={colors.textMuted}
            accessibilityLabel={t('sermons.pulpit.notePlaceholder')}
            maxLength={2000}
            returnKeyType="send"
            style={{
              flex: 1,
              color: colors.text,
              fontFamily: fonts.body,
              fontSize: 15,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: radius.pill,
              paddingHorizontal: 14,
              paddingVertical: 8,
            }}
          />
          <IconButton icon="send" label={t('study.send')} onPress={sendNote} />
        </View>
      </View>
    </SafeAreaView>
  );
}

function IconButton({ icon, label, onPress, active }: { icon: ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; active?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({ padding: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: active ? colors.gold : colors.border, opacity: pressed ? 0.6 : 1 })}>
      <Ionicons name={icon} size={20} color={colors.gold} />
    </Pressable>
  );
}

function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5, opacity: pressed ? 0.6 : 1 })}>
      <RNText style={{ color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 13 }}>{label}</RNText>
    </Pressable>
  );
}

/** "João 11:33-35" + 35 → "João 11:35" */
function verseRef(reference: string, verse: number) {
  const m = reference.match(/^(.*?\d+):/);
  return m ? `${m[1]}:${verse}` : reference;
}

// Editor de ministrações em blocos (seção, texto, texto bíblico, nota pessoal).
// Salva sozinho (com base_version), guarda rascunho no aparelho para editar sem internet,
// oferece inserir versículos citados no texto e um assistente de IA por bloco.

import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text as RNText,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { loadTranslation } from '@/bible/reader-state';
import { tryParseReferences, verseKey, type Reference } from '@/bible/reference';
import { getChapter } from '@/bible/text';
import { Button, Card, Notice, Text, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { useDictation } from '@/lib/dictation';
import { ApiError } from '@/lib/api';
import { KINDS, sermonApi, type Block, type Role, type Sermon } from '@/lib/sermons';
import { AskSheet } from '@/components/ask-sheet';
import { useSession } from '@/lib/session';
import { AssistSheet } from '@/sermon/assist-sheet';
import {
  candidateId,
  docFromSermon,
  emptyHistory,
  insertAfter,
  insertableReferences,
  makeBlock,
  metaToPayload,
  moveBlock,
  record,
  redo,
  scriptureBlock,
  scriptureInsertPoint,
  sermonHtml,
  speakingMinutes,
  undo,
  updateBlock,
  type Candidate,
  type Doc,
  type MetaForm,
} from '@/sermon/document';
import { exportDocx, exportPdf, exportPptx } from '@/sermon/export';
import { dropLocal, loadLocal, localFromServer, onSermonReplaced, saveLocal } from '@/sermon/local';
import { useTheme } from '@/theme';
import { fonts, radius } from '@/theme/tokens';

type Status = 'saved' | 'dirty' | 'saving' | 'offline' | 'error';
type Banner = { kind: 'info' | 'error' | 'success'; text: string; copyId?: string };
const ROLES: Role[] = ['intro', 'point', 'application', 'conclusion', 'appeal', 'other'];
const SAVE_DELAY = 1500;
const RETRY_DELAY = 15_000;

const isOffline = (e: unknown) => e instanceof ApiError && e.status === 0;

/** Texto canônico para a API ("2KI 13:20-21"): não depende do idioma da tradução escolhida. */
function canonical(r: Reference) {
  let out = `${r.book} ${r.chapter}`;
  if (r.verseStart !== null) out += `:${r.verseStart}`;
  if (r.chapterEnd !== r.chapter) out += `-${r.chapterEnd}${r.verseEnd !== null ? `:${r.verseEnd}` : ''}`;
  else if (r.verseEnd !== null && r.verseEnd !== r.verseStart) out += `-${r.verseEnd}`;
  return out;
}

export default function SermonEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale, errorMessage } = useI18n();
  const { colors } = useTheme();

  const [doc, setDoc] = useState<Doc | null>(null);
  const docRef = useRef<Doc | null>(null);
  const history = useRef(emptyHistory());
  const base = useRef(0);
  const dirty = useRef(false);
  const saving = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [status, setStatus] = useState<Status>('saved');
  const [banner, setBanner] = useState<Banner | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [translation, setTranslation] = useState('blivre');
  const [showMeta, setShowMeta] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [fetching, setFetching] = useState<string | null>(null);
  const [addAt, setAddAt] = useState<string | null | undefined>(undefined);
  const [assistFor, setAssistFor] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  // IA que escreve/edita a ministração: só o administrador. Os demais só fazem perguntas.
  const isAdmin = !!useSession().user?.roles.includes('admin');
  const [busy, setBusy] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const flushRef = useRef<() => Promise<boolean>>(async () => true);

  const setHistory = useCallback((h: ReturnType<typeof emptyHistory>) => {
    history.current = h;
    setCanUndo(h.past.length > 0);
    setCanRedo(h.future.length > 0);
  }, []);

  const scheduleSave = useCallback((delay: number) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flushRef.current(), delay);
  }, []);

  // ---------- Persistência ----------

  const writeLocal = useCallback(() => {
    if (localTimer.current) clearTimeout(localTimer.current);
    localTimer.current = setTimeout(() => {
      const d = docRef.current;
      if (d) saveLocal(id, { doc: d, baseVersion: base.current, dirty: dirty.current, savedAt: new Date().toISOString() });
    }, 300);
  }, [id]);

  const apply = useCallback(
    (d: Doc, version: number, isDirty = false) => {
      docRef.current = d;
      base.current = version;
      dirty.current = isDirty;
      setHistory(emptyHistory());
      setDoc(d);
      setStatus(isDirty ? 'dirty' : 'saved');
    },
    [setHistory],
  );

  const saveAsCopy = useCallback(
    async (local: Doc) => {
      const title = `${local.meta.title} (${t('sermons.localCopy')})`.slice(0, 200);
      const copy = await sermonApi.create({ ...metaToPayload(local.meta), title, use_template: false });
      await sermonApi.save(copy.id, { base_version: copy.version, content: { blocks: local.blocks } });
      const server = await sermonApi.get(id);
      apply(docFromSermon(server), server.version);
      await saveLocal(id, localFromServer(server));
      setBanner({ kind: 'info', text: t('sermons.conflictCopy', { title }), copyId: copy.id });
    },
    [apply, id, t],
  );

  const flush = useCallback(async (): Promise<boolean> => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const snapshot = docRef.current;
    if (!snapshot || !dirty.current) return true;
    if (saving.current) return false;
    saving.current = true;
    setStatus('saving');
    try {
      const s = await sermonApi.save(id, {
        ...metaToPayload(snapshot.meta),
        base_version: base.current,
        content: { blocks: snapshot.blocks },
      });
      base.current = s.version;
      if (docRef.current === snapshot) {
        dirty.current = false;
        setStatus('saved');
      } else {
        setStatus('dirty');
        scheduleSave(SAVE_DELAY);
      }
      writeLocal();
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.code === 'version_conflict') {
        try {
          await saveAsCopy(docRef.current ?? snapshot);
          return true;
        } catch {
          setStatus('error');
        }
      } else {
        setStatus(isOffline(e) ? 'offline' : 'error');
      }
      writeLocal();
      scheduleSave(RETRY_DELAY);
      return false;
    } finally {
      saving.current = false;
    }
  }, [id, saveAsCopy, scheduleSave, writeLocal]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const commit = useCallback(
    (next: Doc) => {
      docRef.current = next;
      dirty.current = true;
      setDoc(next);
      setStatus((s) => (s === 'offline' ? s : 'dirty'));
      writeLocal();
      scheduleSave(SAVE_DELAY);
    },
    [scheduleSave, writeLocal],
  );

  const change = useCallback(
    (fn: (d: Doc) => Doc, key = '') => {
      const cur = docRef.current;
      if (!cur) return;
      const next = fn(cur);
      if (next === cur) return;
      setHistory(record(history.current, cur, key));
      commit(next);
    },
    [commit, setHistory],
  );

  const setMeta = (field: keyof MetaForm, value: string) =>
    change((d) => ({ ...d, meta: { ...d.meta, [field]: value } }), `meta:${field}`);
  const setBlocks = (fn: (b: Block[]) => Block[], key = '') => change((d) => ({ ...d, blocks: fn(d.blocks) }), key);

  function doUndo() {
    const r = docRef.current && undo(history.current, docRef.current);
    if (!r) return;
    setHistory(r[0]);
    commit(r[1]);
  }
  function doRedo() {
    const r = docRef.current && redo(history.current, docRef.current);
    if (!r) return;
    setHistory(r[0]);
    commit(r[1]);
  }

  // ---------- Carregamento ----------

  useEffect(() => {
    let alive = true;
    loadTranslation(locale).then((code) => alive && setTranslation(code));
    (async () => {
      const local = await loadLocal(id);
      let server: Sermon | null = null;
      try {
        server = await sermonApi.get(id);
      } catch (e) {
        if (!isOffline(e)) {
          if (alive) setLoadError(true);
          return;
        }
      }
      if (!alive) return;
      if (server) {
        if (local?.dirty && local.baseVersion === server.version) {
          // Alterações feitas sem internet: continua de onde parou e envia
          apply(local.doc, server.version, true);
          scheduleSave(300);
        } else if (local?.dirty) {
          apply(docFromSermon(server), server.version);
          try {
            await saveAsCopy(local.doc);
          } catch {
            setBanner({ kind: 'error', text: t('sermons.saveError') });
          }
        } else {
          apply(docFromSermon(server), server.version);
          saveLocal(id, localFromServer(server));
        }
      } else if (local) {
        apply(local.doc, local.baseVersion, local.dirty);
        setStatus('offline');
      } else {
        setLoadError(true);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Versão restaurada no histórico
  useEffect(
    () =>
      onSermonReplaced(id, (s) => {
        apply(docFromSermon(s), s.version);
        setBanner({ kind: 'success', text: t('sermons.restored') });
      }),
    [apply, id, t],
  );

  // Ao sair da tela (histórico, púlpito, voltar), envia o que estiver pendente
  useFocusEffect(
    useCallback(
      () => () => {
        void flush();
      },
      [flush],
    ),
  );

  // ---------- Versículos ----------

  async function fetchScripture(ref: Reference): Promise<Block> {
    try {
      const res = await sermonApi.passage(translation, canonical(ref));
      const p = res.passages[0];
      return scriptureBlock(ref, p.translation, p.verses, locale);
    } catch (e) {
      // Sem internet: usa o capítulo baixado para leitura offline, se houver
      if (ref.chapter === ref.chapterEnd) {
        try {
          const ch = await getChapter(translation, ref.book, ref.chapter);
          const from = ref.verseStart ?? 1;
          const to = ref.verseEnd ?? ref.verseStart ?? 999;
          const verses = ch.verses.filter((v) => v.verse >= from && v.verse <= to).map((v) => ({ chapter: ref.chapter, ...v }));
          if (verses.length) return scriptureBlock(ref, translation, verses, locale);
        } catch {
          // segue para o erro original
        }
      }
      throw e;
    }
  }

  async function insertCandidate(textBlockId: string, c: Candidate) {
    setFetching(candidateId(c));
    try {
      const block = await fetchScripture(c.ref);
      setBlocks((b) => insertAfter(b, scriptureInsertPoint(b, textBlockId), block));
    } catch {
      setBanner({ kind: 'error', text: t('sermons.verseNotFound', { ref: c.label }) });
    } finally {
      setFetching(null);
    }
  }

  async function insertByReference(afterId: string | null, raw: string) {
    const refs = tryParseReferences(raw, locale);
    if (!refs || refs.length !== 1) {
      setBanner({ kind: 'error', text: t('study.invalidPassage') });
      return false;
    }
    try {
      const block = await fetchScripture(refs[0]);
      setBlocks((b) => insertAfter(b, afterId, block));
      setAddAt(undefined);
      return true;
    } catch {
      setBanner({ kind: 'error', text: t('sermons.verseNotFound', { ref: raw }) });
      return false;
    }
  }

  // ---------- Ações gerais ----------

  async function run(task: () => Promise<void>) {
    setShowMore(false);
    setBusy(true);
    try {
      await task();
    } catch (e) {
      setBanner({ kind: 'error', text: e instanceof ApiError ? errorMessage(e) : t('sermons.exportError') });
    } finally {
      setBusy(false);
    }
  }

  const htmlLabels = () => ({
    main: t('sermons.mainReference'),
    theme: t('sermons.theme'),
    objective: t('sermons.objective'),
    date: t('sermons.date').replace(/\s*\(.*\)$/, ''),
    duration: t('sermons.duration').replace(/\s*\(.*\)$/, ''),
    note: t('sermons.noteLabel'),
    minutes: t('sermons.minutes'),
  });

  // ---------- Render ----------

  if (loadError) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: 16, justifyContent: 'center' }}>
        <Notice kind="error">{t('sermons.loadError')}</Notice>
      </View>
    );
  }
  if (!doc) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  // Passagem principal da ministração como contexto das perguntas (quando reconhecida)
  const mainRef = tryParseReferences(doc.meta.main_reference ?? '', locale)?.[0];
  const askRange: [number, number] | null =
    mainRef && mainRef.verseStart !== null && mainRef.chapterEnd === mainRef.chapter
      ? [
          verseKey(mainRef.book, mainRef.chapter, mainRef.verseStart ?? 1),
          verseKey(mainRef.book, mainRef.chapter, mainRef.verseEnd ?? mainRef.verseStart ?? 1),
        ]
      : null;
  const assistBlock = doc.blocks.find((b) => b.id === assistFor) ?? null;
  const assistText = !assistBlock
    ? null
    : assistBlock.type === 'section'
      ? assistBlock.title
      : assistBlock.type === 'scripture'
        ? `${assistBlock.reference}\n${assistBlock.verses.map((v) => v.text).join(' ')}`
        : assistBlock.text;

  const statusText = {
    saved: t('sermons.saved'),
    dirty: t('sermons.unsaved'),
    saving: t('sermons.saving'),
    offline: t('sermons.offlineDraft'),
    error: t('sermons.saveError'),
  }[status];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Barra fixa */}
      <View style={{ borderBottomWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 6 }}>
        <View style={{ width: '100%', maxWidth: 720, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <ToolButton icon="arrow-undo" label={t('sermons.undo')} onPress={doUndo} disabled={!canUndo} />
          <ToolButton icon="arrow-redo" label={t('sermons.redo')} onPress={doRedo} disabled={!canRedo} />
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 6 }}>
            <Ionicons
              name={status === 'saved' ? 'cloud-done-outline' : status === 'saving' ? 'sync-outline' : status === 'dirty' ? 'ellipse-outline' : 'cloud-offline-outline'}
              size={16}
              color={status === 'error' || status === 'offline' ? colors.danger : colors.textMuted}
            />
            <Text variant="small" numberOfLines={1} style={{ flexShrink: 1 }} accessibilityLiveRegion="polite">
              {status === 'offline' || status === 'error' ? t('sermons.unsaved') : statusText}
            </Text>
          </View>
          <ToolButton
            icon="tv-outline"
            label={t('screen.share')}
            onPress={() => run(async () => {
              await flush();
              router.push({ pathname: '/share-screen', params: { sermon: id } });
            })}
          />
          <ToolButton
            icon="easel-outline"
            label={t('sermons.pulpit.open')}
            onPress={() => run(async () => {
              await flush();
              router.push({ pathname: '/sermon/[id]/pulpit', params: { id } });
            })}
          />
          <ToolButton
            icon="time-outline"
            label={t('sermons.versions')}
            onPress={() => run(async () => {
              await flush();
              router.push({ pathname: '/sermon/[id]/versions', params: { id } });
            })}
          />
          <ToolButton icon="ellipsis-horizontal" label={t('sermons.more')} onPress={() => setShowMore((v) => !v)} />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 96 }} keyboardShouldPersistTaps="handled">
        <View style={{ width: '100%', maxWidth: 720, alignSelf: 'center', gap: 12 }}>
          {showMore ? (
            <Card>
              <MenuItem icon="document-outline" label={t('sermons.exportPdf')} onPress={() => run(async () => {
                  await flush();
                  await exportPdf(id, doc.meta.title, () => sermonHtml(doc, htmlLabels(), locale));
                })} />
              <MenuItem
                icon="document-text-outline"
                label={t('sermons.exportDocx')}
                onPress={() => run(async () => {
                  await flush();
                  await exportDocx(id, doc.meta.title);
                })}
              />
              <MenuItem
                icon="easel-outline"
                label={t('sermons.present')}
                onPress={() => run(async () => {
                  await flush();
                  router.push({ pathname: '/sermon/[id]/present', params: { id } });
                })}
              />
              <MenuItem
                icon="albums-outline"
                label={t('sermons.exportPptx')}
                onPress={() => run(async () => {
                  await flush();
                  await exportPptx(id, doc.meta.title);
                })}
              />
              <MenuItem
                icon="copy-outline"
                label={t('sermons.duplicate')}
                onPress={() => run(async () => {
                  await flush();
                  const c = await sermonApi.duplicate(id);
                  router.push({ pathname: '/sermon/[id]', params: { id: c.id } });
                })}
              />
              <MenuItem
                icon="trash-outline"
                danger
                label={t('sermons.moveToTrash')}
                onPress={() => run(async () => {
                  await flush();
                  await sermonApi.trash(id);
                  await dropLocal(id);
                  if (router.canGoBack()) router.back();
                  else router.replace('/sermons');
                })}
              />
            </Card>
          ) : null}
          {busy ? <ActivityIndicator color={colors.gold} /> : null}
          {status === 'offline' ? <Notice>{t('sermons.offlineDraft')}</Notice> : null}
          {status === 'error' ? <Notice kind="error">{t('sermons.saveError')}</Notice> : null}
          {banner ? (
            <View style={{ gap: 8 }}>
              <Notice kind={banner.kind}>{banner.text}</Notice>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {banner.copyId ? (
                  <View style={{ flex: 1 }}>
                    <Button
                      kind="secondary"
                      title={t('sermons.openCopy')}
                      onPress={() => router.push({ pathname: '/sermon/[id]', params: { id: banner.copyId! } })}
                    />
                  </View>
                ) : null}
                <View style={{ flex: 1 }}>
                  <Button kind="ghost" title={t('bible.close')} onPress={() => setBanner(null)} />
                </View>
              </View>
            </View>
          ) : null}

          {/* Perguntas para a IA: só respostas, nunca texto da ministração */}
          <Pressable
            accessibilityRole="button"
            onPress={() => setAsking(true)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              borderWidth: 1,
              borderColor: colors.goldMuted,
              borderRadius: radius.lg,
              backgroundColor: colors.surface,
              paddingHorizontal: 14,
              paddingVertical: 12,
              opacity: pressed ? 0.7 : 1,
            })}>
            <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.gold} />
            <View style={{ flex: 1 }}>
              <RNText style={{ color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 15 }}>{t('sermons.askAI')}</RNText>
              <Text variant="small" numberOfLines={2}>
                {t('sermons.askAIHint')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>

          {/* Título e detalhes */}
          <TextInput
            value={doc.meta.title}
            onChangeText={(v) => setMeta('title', v)}
            placeholder={t('sermons.titleField')}
            placeholderTextColor={colors.textMuted}
            accessibilityLabel={t('sermons.titleField')}
            maxLength={200}
            style={{ fontFamily: fonts.display, fontSize: 30, color: colors.text, paddingVertical: 4 }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showMeta }}
            onPress={() => setShowMeta((v) => !v)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name={showMeta ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.gold} />
            <RNText style={{ color: colors.gold, fontFamily: fonts.bodyMedium }}>{t('sermons.details')}</RNText>
            <Text variant="small" numberOfLines={1} style={{ flex: 1 }}>
              {[doc.meta.main_reference, t(`sermons.kinds.${doc.meta.kind}`), t('sermons.estimated', { n: speakingMinutes(doc.blocks) })]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </Pressable>
          {showMeta ? <MetaEditor meta={doc.meta} onChange={setMeta} /> : null}

          {/* Blocos */}
          {doc.blocks.length === 0 ? <Text variant="muted">{t('sermons.emptySermon')}</Text> : null}
          {doc.blocks.map((block, index) => {
            const candidates = block.type === 'text' && focused === block.id ? insertableReferences(block.text, doc.blocks, locale, dismissed) : [];
            return (
              <View key={block.id} style={{ gap: 8 }}>
                <BlockCard
                  block={block}
                  first={index === 0}
                  last={index === doc.blocks.length - 1}
                  onFocus={() => setFocused(block.id)}
                  onChange={(patch, field) => setBlocks((b) => updateBlock(b, block.id, patch), `${block.id}:${field}`)}
                  onMove={(delta) => setBlocks((b) => moveBlock(b, block.id, delta))}
                  onDelete={() => setBlocks((b) => b.filter((x) => x.id !== block.id))}
                  onAdd={() => setAddAt((cur) => (cur === block.id ? undefined : block.id))}
                  onAssist={isAdmin ? () => setAssistFor(block.id) : undefined}
                />
                {candidates.map((c) => (
                  <View key={candidateId(c)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => insertCandidate(block.id, c)}
                      disabled={fetching !== null}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        borderWidth: 1,
                        borderColor: colors.gold,
                        borderRadius: radius.pill,
                        paddingHorizontal: 12,
                        paddingVertical: 7,
                        flexShrink: 1,
                      }}>
                      {fetching === candidateId(c) ? (
                        <ActivityIndicator size="small" color={colors.gold} />
                      ) : (
                        <Ionicons name="book-outline" size={15} color={colors.gold} />
                      )}
                      <RNText style={{ color: colors.gold, fontFamily: fonts.bodyMedium, fontSize: 14 }}>{t('sermons.insertVerse', { ref: c.label })}</RNText>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('sermons.dismiss')}
                      hitSlop={10}
                      onPress={() => setDismissed((d) => [...d, candidateId(c)])}>
                      <Ionicons name="close" size={18} color={colors.textMuted} />
                    </Pressable>
                  </View>
                ))}
                {addAt === block.id ? (
                  <AddMenu
                    onAdd={(type) => {
                      const nb = makeBlock(type);
                      setBlocks((b) => insertAfter(b, block.id, nb));
                      setAddAt(undefined);
                      setFocused(nb.id);
                    }}
                    onScripture={(raw) => insertByReference(block.id, raw)}
                  />
                ) : null}
              </View>
            );
          })}

          <Text variant="label" style={{ marginTop: 8 }}>
            {t('sermons.add')}
          </Text>
          <AddMenu
            onAdd={(type) => {
              const nb = makeBlock(type);
              setBlocks((b) => insertAfter(b, null, nb));
              setFocused(nb.id);
            }}
            onScripture={(raw) => insertByReference(null, raw)}
          />
        </View>
      </ScrollView>

      {asking ? (
        <AskSheet
          visible
          onClose={() => setAsking(false)}
          label={askRange ? doc.meta.main_reference : ''}
          start={askRange?.[0] ?? null}
          end={askRange?.[1] ?? null}
          translation={translation}
          hint={t('sermons.askAIHint')}
        />
      ) : null}

      {isAdmin ? (
      <AssistSheet
        key={assistFor ?? 'none'}
        sermonId={id}
        text={assistText}
        canReplace={assistBlock?.type === 'text' || assistBlock?.type === 'note'}
        onClose={() => setAssistFor(null)}
        onInsertBelow={(suggestion) => {
          if (!assistBlock) return;
          setBlocks((b) => insertAfter(b, assistBlock.id, { ...makeBlock('text'), text: suggestion } as Block));
          setAssistFor(null);
        }}
        onReplace={(suggestion) => {
          if (!assistBlock) return;
          setBlocks((b) => updateBlock(b, assistBlock.id, { text: suggestion } as Partial<Block>));
          setAssistFor(null);
        }}
      />
      ) : null}
    </KeyboardAvoidingView>
  );
}

// ---------- Componentes ----------

function ToolButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({ padding: 8, borderRadius: radius.sm, opacity: disabled ? 0.35 : pressed ? 0.6 : 1 })}>
      <Ionicons name={icon} size={21} color={colors.gold} />
    </Pressable>
  );
}

function MenuItem({ icon, label, onPress, danger }: { icon: ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; danger?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 10, opacity: pressed ? 0.6 : 1 })}>
      <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.gold} />
      <Text variant="body" style={danger ? { color: colors.danger } : undefined}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Campo de várias linhas que cresce com o texto (também no navegador). */
function GrowingInput({ minHeight = 44, style, ...props }: TextInputProps & { minHeight?: number }) {
  const { colors } = useTheme();
  // No navegador o tamanho do conteúdo inicial nem sempre é informado: começa por uma estimativa
  const [height, setHeight] = useState(() => {
    const lines = String(props.value ?? '')
      .split('\n')
      .reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 48)), 0);
    return Math.max(minHeight, lines * 24 + 12);
  });
  return (
    <TextInput
      {...props}
      multiline
      placeholderTextColor={colors.textMuted}
      onContentSizeChange={(e) => setHeight(Math.max(minHeight, Math.ceil(e.nativeEvent.contentSize.height)))}
      style={[
        { color: colors.text, fontFamily: fonts.body, fontSize: 16, lineHeight: 24, textAlignVertical: 'top' },
        // Navegadores com field-sizing (Chrome, Edge) ajustam a altura sozinhos, inclusive ao abrir texto já salvo
        Platform.OS === 'web' ? ({ minHeight: Math.max(minHeight, height), fieldSizing: 'content' } as object) : { height },
        style,
      ]}
    />
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        borderWidth: 1,
        borderColor: active ? colors.gold : colors.border,
        backgroundColor: active ? colors.gold : 'transparent',
        borderRadius: radius.pill,
        paddingHorizontal: 10,
        paddingVertical: 5,
      }}>
      <RNText style={{ color: active ? colors.onGold : colors.text, fontFamily: fonts.bodyMedium, fontSize: 13 }}>{label}</RNText>
    </Pressable>
  );
}

function BlockCard({
  block,
  first,
  last,
  onFocus,
  onChange,
  onMove,
  onDelete,
  onAdd,
  onAssist,
}: {
  block: Block;
  first: boolean;
  last: boolean;
  onFocus: () => void;
  onChange: (patch: Partial<Block>, field: string) => void;
  onMove: (delta: -1 | 1) => void;
  onDelete: () => void;
  onAdd: () => void;
  onAssist?: () => void;
}) {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  // Ministração por voz: o que a pessoa fala vai para o fim do bloco
  const dictation = useDictation(locale);
  const textRef = useRef('');
  useEffect(() => {
    textRef.current = block.type === 'text' || block.type === 'note' ? block.text : '';
  });
  const label = block.type === 'section' ? t(`sermons.roles.${block.role}`) : t(`sermons.blockTypes.${block.type}`);
  return (
    <View
      style={{
        borderWidth: 1,
        borderStyle: block.type === 'note' ? 'dashed' : 'solid',
        borderColor: block.type === 'section' ? colors.goldMuted : colors.border,
        backgroundColor: block.type === 'scripture' ? colors.surfaceAlt : colors.surface,
        borderRadius: radius.md,
        padding: 12,
        gap: 8,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        <Text variant="small" style={{ flex: 1, color: colors.gold, fontFamily: fonts.bodyMedium, textTransform: 'uppercase', letterSpacing: 0.6, fontSize: 11 }}>
          {label}
        </Text>
        {onAssist ? <ToolButton icon="sparkles-outline" label={t('sermons.assist.title')} onPress={onAssist} /> : null}
        <ToolButton icon="arrow-up" label={t('sermons.moveUp')} onPress={() => onMove(-1)} disabled={first} />
        <ToolButton icon="arrow-down" label={t('sermons.moveDown')} onPress={() => onMove(1)} disabled={last} />
        <ToolButton icon="add" label={t('sermons.addHere')} onPress={onAdd} />
        <ToolButton icon="trash-outline" label={t('sermons.deleteBlock')} onPress={onDelete} />
      </View>
      {block.type === 'section' ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {ROLES.map((r) => (
              <Chip key={r} label={t(`sermons.roles.${r}`)} active={block.role === r} onPress={() => onChange({ role: r } as Partial<Block>, 'role')} />
            ))}
          </View>
          <TextInput
            value={block.title}
            onFocus={onFocus}
            onChangeText={(v) => onChange({ title: v } as Partial<Block>, 'title')}
            placeholder={t('sermons.sectionPlaceholder')}
            placeholderTextColor={colors.textMuted}
            accessibilityLabel={t('sermons.sectionPlaceholder')}
            maxLength={300}
            style={{ fontFamily: fonts.bodyBold, fontSize: 19, color: colors.text, paddingVertical: 4 }}
          />
        </>
      ) : block.type === 'scripture' ? (
        <View style={{ gap: 4 }}>
          <Text variant="heading">
            {block.reference} <RNText style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13 }}>({block.translation})</RNText>
          </Text>
          <Text variant="body" style={{ fontStyle: 'italic' }}>
            {block.verses.map((v, i) => (
              <RNText key={`${v.chapter}:${v.verse}`}>
                {i > 0 ? ' ' : ''}
                <RNText style={{ color: colors.gold, fontSize: 12, fontStyle: 'normal' }}>{v.verse} </RNText>
                {v.text}
              </RNText>
            ))}
          </Text>
        </View>
      ) : (
        <View style={{ gap: 6 }}>
          <GrowingInput
            value={block.text}
            onFocus={onFocus}
            onChangeText={(v) => onChange({ text: v } as Partial<Block>, 'text')}
            placeholder={block.type === 'note' ? t('sermons.notePlaceholder') : t('sermons.textPlaceholder')}
            accessibilityLabel={block.type === 'note' ? t('sermons.blockTypes.note') : t('sermons.blockTypes.text')}
            minHeight={block.type === 'note' ? 44 : 72}
            style={block.type === 'note' ? { fontSize: 15, color: colors.textMuted } : undefined}
          />
          {dictation.supported ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={dictation.listening ? t('sermons.stopDictation') : t('sermons.dictate')}
              onPress={() =>
                dictation.toggle((said) => {
                  const current = textRef.current;
                  onChange({ text: current ? `${current} ${said}` : said } as Partial<Block>, 'text');
                })
              }
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}>
              <Ionicons name={dictation.listening ? 'mic' : 'mic-outline'} size={18} color={dictation.listening ? colors.danger : colors.gold} />
              <RNText style={{ color: dictation.listening ? colors.danger : colors.gold, fontFamily: fonts.bodyMedium, fontSize: 13 }}>
                {dictation.listening ? t('sermons.stopDictation') : t('sermons.dictate')}
              </RNText>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

function AddMenu({ onAdd, onScripture }: { onAdd: (type: 'section' | 'text' | 'note') => void; onScripture: (raw: string) => Promise<boolean> }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const [askRef, setAskRef] = useState(false);
  const [ref, setRef] = useState('');
  const [loading, setLoading] = useState(false);
  const item = (icon: ComponentProps<typeof Ionicons>['name'], label: string, onPress: () => void) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8 }}>
      <Ionicons name={icon} size={16} color={colors.gold} />
      <RNText style={{ color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 14 }}>{label}</RNText>
    </Pressable>
  );
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {item('bookmark-outline', t('sermons.blockTypes.section'), () => onAdd('section'))}
        {item('create-outline', t('sermons.blockTypes.text'), () => onAdd('text'))}
        {item('book-outline', t('sermons.blockTypes.scripture'), () => setAskRef((v) => !v))}
        {item('chatbox-ellipses-outline', t('sermons.blockTypes.note'), () => onAdd('note'))}
      </View>
      {askRef ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <TextField
              label={t('sermons.scripturePrompt')}
              value={ref}
              onChangeText={setRef}
              autoFocus
              onSubmitEditing={async () => {
                setLoading(true);
                if (await onScripture(ref)) setRef('');
                setLoading(false);
              }}
            />
          </View>
          <Button
            title={t('sermons.insert')}
            loading={loading}
            onPress={async () => {
              setLoading(true);
              if (await onScripture(ref)) {
                setRef('');
                setAskRef(false);
              }
              setLoading(false);
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

function MetaEditor({ meta, onChange }: { meta: MetaForm; onChange: (field: keyof MetaForm, value: string) => void }) {
  const { t } = useI18n();
  const field = (key: keyof MetaForm, label: string, extra: TextInputProps = {}) => (
    <TextField key={key} label={label} value={meta[key]} onChangeText={(v) => onChange(key, v)} {...extra} />
  );
  return (
    <Card>
      {field('theme', t('sermons.theme'), { placeholder: t('sermons.themePlaceholder') })}
      {field('main_reference', t('sermons.mainReference'), { placeholder: 'Rm 12:1-2' })}
      {field('other_references', t('sermons.otherReferences'), { placeholder: 'Jo 3:16; Ef 2:8' })}
      <Text variant="label">{t('sermons.format')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {KINDS.map((k) => (
          <Chip key={k} label={t(`sermons.kinds.${k}`)} active={meta.kind === k} onPress={() => onChange('kind', k)} />
        ))}
      </View>
      {field('objective', t('sermons.objective'), { multiline: true, style: { minHeight: 60 } })}
      {field('audience', t('sermons.audience'))}
      {field('event', t('sermons.event'))}
      {field('scheduled_for', t('sermons.date'), { placeholder: '2026-11-01', maxLength: 10 })}
      {field('duration', t('sermons.duration'), { keyboardType: 'numeric', maxLength: 3 })}
      {field('folder', t('sermons.folder'))}
      {field('tags', t('sermons.tags'))}
    </Card>
  );
}

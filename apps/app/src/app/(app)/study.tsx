import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text as RNText, View } from 'react-native';

import { loadTranslation } from '@/bible/reader-state';
import { formatKeyRange, tryParseReferences, verseKey } from '@/bible/reference';
import { Markdown } from '@/components/markdown';
import { Button, Card, Divider, Notice, Screen, Text, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { AI_MODES, aiApi, askAI, type AIMode, type AIStatus, type ConversationSummary } from '@/lib/ai';
import { ApiError } from '@/lib/api';
import { useTheme } from '@/theme';
import { fonts, radius } from '@/theme/tokens';

type Turn = { role: 'user' | 'assistant'; content: string; messageId?: string; invalid?: string[]; feedback?: number | null };

export default function Study() {
  const params = useLocalSearchParams<{ start?: string; end?: string; t?: string; c?: string }>();
  const { t, locale } = useI18n();
  const { colors } = useTheme();

  const [translation, setTranslation] = useState('blivre');
  const [passage, setPassage] = useState('');
  const [question, setQuestion] = useState('');
  const [mode, setMode] = useState<AIMode>('simple');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [savedMsg, setSavedMsg] = useState(false);
  const [recent, setRecent] = useState<ConversationSummary[]>([]);
  const abort = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    aiApi.status().then(setStatus).catch(() => {});
    aiApi
      .conversations()
      .then((r) => setRecent(r.conversations.slice(0, 8)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadTranslation(locale).then((code) => setTranslation(params.t || code));
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Vindo do leitor ("Perguntar à IA") com uma passagem selecionada
  const routeKey = params.start ? `${params.start}-${params.end}` : params.c ?? null;
  const [seenRoute, setSeenRoute] = useState<string | null>(null);
  if (routeKey !== seenRoute) {
    setSeenRoute(routeKey);
    if (params.start) {
      setPassage(formatKeyRange(Number(params.start), Number(params.end ?? params.start), locale));
      setTurns([]);
      setConversationId(null);
    }
  }

  // Abre uma conversa salva (?c=id)
  useEffect(() => {
    if (!params.c) return;
    aiApi
      .conversation(params.c)
      .then((c) => {
        setConversationId(c.id);
        setTranslation(c.translation);
        setMode(c.mode);
        setPassage(c.verse_key_start ? formatKeyRange(c.verse_key_start, c.verse_key_end ?? c.verse_key_start, locale) : '');
        setTurns(
          c.messages.map((m) => ({
            role: m.role,
            content: m.content,
            messageId: m.id,
            invalid: m.invalid_references,
            feedback: m.feedback,
          })),
        );
      })
      .catch(() => {});
  }, [params.c, locale]);

  function errorText(e: unknown) {
    const code = e instanceof ApiError ? e.code : 'generic';
    const key = `study.errors.${code}` as const;
    const msg = t(key as any);
    return msg === key ? (e instanceof ApiError && e.code === 'network_error' ? t('errors.network_error') : t('study.errors.generic')) : msg;
  }

  async function send() {
    setError(null);
    setSavedMsg(false);
    const follow = !!conversationId;
    let start: number | null = null;
    let end: number | null = null;
    if (!follow && passage.trim()) {
      const refs = tryParseReferences(passage, locale);
      if (!refs) {
        setError(t('study.invalidPassage'));
        return;
      }
      const r = refs[0];
      start = verseKey(r.book, r.chapter, r.verseStart ?? 0);
      end = verseKey(r.book, r.chapterEnd, r.verseEnd ?? (r.verseStart ? r.verseStart : 0));
      if (!r.verseStart) {
        start = verseKey(r.book, r.chapter, 1);
        end = verseKey(r.book, r.chapterEnd, 199);
      }
    }
    if (!follow && !start && !question.trim()) {
      setError(t('study.invalidPassage'));
      return;
    }
    const q = question.trim();
    setTurns((prev) => [
      ...prev,
      { role: 'user', content: q || passage },
      { role: 'assistant', content: '' },
    ]);
    setQuestion('');
    setStreaming(true);
    abort.current = new AbortController();
    try {
      await askAI(
        {
          translation,
          mode,
          question: q || null,
          verse_key_start: follow ? null : start,
          verse_key_end: follow ? null : end,
          conversation_id: conversationId,
        },
        (e) => {
          if (e.type === 'start' && e.conversation_id) setConversationId(e.conversation_id);
          if (e.type === 'delta') {
            setTurns((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              next[next.length - 1] = { ...last, content: last.content + e.text };
              return next;
            });
          }
          if (e.type === 'done') {
            setTurns((prev) => {
              const next = [...prev];
              next[next.length - 1] = { ...next[next.length - 1], messageId: e.message_id, invalid: e.invalid_references };
              return next;
            });
          }
          if (e.type === 'error') setError(errorText(new ApiError(0, e.code, '')));
        },
        abort.current.signal,
      );
    } catch (e) {
      setError(errorText(e));
      setTurns((prev) => prev.slice(0, -2));
    } finally {
      setStreaming(false);
      refresh();
    }
  }

  function reset() {
    abort.current?.abort();
    setTurns([]);
    setConversationId(null);
    setQuestion('');
    setError(null);
    setSavedMsg(false);
  }

  async function save() {
    if (!conversationId) return;
    await aiApi.save(conversationId, true).catch(() => {});
    setSavedMsg(true);
  }

  async function rate(index: number, value: 1 | -1) {
    const turn = turns[index];
    if (!turn.messageId) return;
    const next = turn.feedback === value ? 0 : value;
    setTurns((prev) => prev.map((x, i) => (i === index ? { ...x, feedback: next || null } : x)));
    aiApi.feedback(turn.messageId, next as 1 | -1 | 0).catch(() => {});
  }

  const hasConversation = turns.length > 0;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="title">{t('study.title')}</Text>
        {hasConversation ? (
          <Pressable accessibilityRole="button" onPress={reset} style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
            <Ionicons name="add-circle-outline" size={20} color={colors.gold} />
            <RNText style={{ color: colors.gold, fontFamily: fonts.bodyMedium }}>{t('study.newStudy')}</RNText>
          </Pressable>
        ) : null}
      </View>
      {!hasConversation ? <Text variant="muted">{t('study.subtitle')}</Text> : null}
      {!hasConversation ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/bible/quiz', params: { t: translation ?? 'blivre' } })}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12 }}>
          <Ionicons name="school-outline" size={24} color={colors.gold} />
          <View style={{ flex: 1 }}>
            <RNText style={{ color: colors.text, fontFamily: fonts.bodyBold }}>{t('quiz.title')}</RNText>
            <Text variant="small">{t('quiz.subtitle')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      ) : null}

      {!hasConversation ? (
        <>
          <TextField
            label={t('study.passage')}
            placeholder={t('study.passagePlaceholder')}
            value={passage}
            onChangeText={setPassage}
            autoCapitalize="words"
          />
          <Text variant="label">{t('study.mode')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {AI_MODES.filter((m) => !status || status.modes.includes(m)).map((m) => {
              const active = m === mode;
              return (
                <Pressable
                  key={m}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  onPress={() => setMode(m)}
                  style={{
                    borderWidth: 1,
                    borderColor: active ? colors.gold : colors.border,
                    backgroundColor: active ? colors.gold : colors.surface,
                    borderRadius: radius.pill,
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                  }}>
                  <RNText style={{ color: active ? colors.onGold : colors.text, fontFamily: fonts.bodyMedium, fontSize: 14 }}>
                    {t(`study.modes.${m}`)}
                  </RNText>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : (
        <Card style={{ gap: 4 }}>
          <Text variant="small">{t(`study.modes.${mode}`)} · {translation.toUpperCase()}</Text>
          {passage ? <Text variant="heading">{passage}</Text> : null}
        </Card>
      )}

      {turns.map((turn, i) =>
        turn.role === 'user' ? (
          <View key={i} style={{ alignSelf: 'flex-end', maxWidth: '90%', backgroundColor: colors.surfaceAlt, borderRadius: radius.lg, padding: 12 }}>
            <Text variant="body">{turn.content}</Text>
          </View>
        ) : (
          <Card key={i}>
            {turn.content ? (
              <Markdown text={turn.content} />
            ) : (
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <ActivityIndicator color={colors.gold} />
                <Text variant="muted">{t('study.thinking')}</Text>
              </View>
            )}
            {turn.invalid?.length ? <Notice kind="error">{t('study.invalidRefs', { refs: turn.invalid.join(', ') })}</Notice> : null}
            {turn.messageId ? (
              <>
                <Divider />
                <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
                  <Pressable accessibilityRole="button" accessibilityLabel={t('study.helpful')} onPress={() => rate(i, 1)} hitSlop={8}>
                    <Ionicons name={turn.feedback === 1 ? 'thumbs-up' : 'thumbs-up-outline'} size={18} color={colors.gold} />
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={t('study.notHelpful')} onPress={() => rate(i, -1)} hitSlop={8}>
                    <Ionicons name={turn.feedback === -1 ? 'thumbs-down' : 'thumbs-down-outline'} size={18} color={colors.gold} />
                  </Pressable>
                  <Text variant="small" style={{ flex: 1 }}>
                    {t('study.disclaimer')}
                  </Text>
                </View>
              </>
            ) : null}
          </Card>
        ),
      )}

      {error ? <Notice kind="error">{error}</Notice> : null}
      {error && status?.plan === 'free' && /Pro/.test(error) ? (
        <Button kind="secondary" icon="sparkles-outline" title={t('pro.learnMore')} onPress={() => router.push('/pro')} />
      ) : null}
      {savedMsg ? <Notice kind="success">{t('study.saved')}</Notice> : null}

      <TextField
        label={hasConversation ? t('study.followUpPlaceholder') : t('study.question')}
        placeholder={hasConversation ? undefined : t('study.questionPlaceholder')}
        value={question}
        onChangeText={setQuestion}
        multiline
        maxLength={2000}
        style={{ minHeight: 60 }}
      />
      {streaming ? (
        <Button kind="secondary" icon="stop-circle-outline" title={t('study.stop')} onPress={() => abort.current?.abort()} />
      ) : (
        <Button icon="sparkles" title={hasConversation ? t('study.send') : t('study.ask')} onPress={send} />
      )}
      {hasConversation && !streaming && conversationId ? (
        <Button kind="ghost" icon="bookmark-outline" title={t('study.save')} onPress={save} />
      ) : null}
      {status?.plan === 'free' && status.free_remaining_today !== undefined ? (
        <Text variant="small" style={{ textAlign: 'center' }}>
          {t('study.remaining', { n: status.free_remaining_today })}
        </Text>
      ) : null}

      {!hasConversation && recent.length ? (
        <>
          <Text variant="heading">{t('study.recent')}</Text>
          <Card style={{ paddingVertical: 4 }}>
            {recent.map((c, i) => (
              <View key={c.id}>
                {i > 0 ? <Divider /> : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setSeenRoute(null);
                    router.setParams({ c: c.id, start: undefined, end: undefined });
                  }}
                  style={{ paddingVertical: 12, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                  <Ionicons name={c.saved ? 'bookmark' : 'chatbubble-ellipses-outline'} size={18} color={colors.gold} />
                  <View style={{ flex: 1 }}>
                    <Text variant="body" numberOfLines={1}>
                      {c.title}
                    </Text>
                    <Text variant="small">{t(`study.modes.${c.mode}`)}</Text>
                  </View>
                </Pressable>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

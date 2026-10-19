// Janela "Perguntar à IA" aberta direto do versículo selecionado no leitor.
// Pergunta por texto ou voz, resposta em tempo real e opção de salvar no "Estudar".

import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, Text as RNText, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Markdown } from '@/components/markdown';
import { Button, Notice, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { aiApi, askAI } from '@/lib/ai';
import { ApiError } from '@/lib/api';
import { ensureSpeechPermission, speechRecognitionClass } from '@/lib/speech';
import { useTheme } from '@/theme';
import { fonts, radius } from '@/theme/tokens';

type Turn = { q: string; a: string; invalid?: string[] };

// Reconhecimento de voz: do navegador no site, do aparelho nos apps
const speechRecognition = speechRecognitionClass;

export function AskSheet({
  visible,
  onClose,
  label,
  start,
  end,
  translation,
  hint,
}: {
  visible: boolean;
  onClose: () => void;
  label: string;
  /** Sem passagem (ex.: perguntas na ministração): só perguntas escritas */
  start: number | null;
  end: number | null;
  translation: string;
  hint?: string;
}) {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const recognizer = useRef<any>(null);
  const abort = useRef<AbortController | null>(null);
  const Speech = speechRecognition();

  // Nova passagem selecionada: começa uma conversa nova
  useEffect(() => {
    if (!visible) return;
    return () => {
      abort.current?.abort();
      recognizer.current?.stop?.();
    };
  }, [visible]);

  function reset() {
    setQuestion('');
    setTurns([]);
    setConversationId(null);
    setError(null);
    setSaved(false);
  }

  function close() {
    abort.current?.abort();
    recognizer.current?.stop?.();
    reset();
    onClose();
  }

  async function listen() {
    if (!Speech) return;
    if (listening) {
      recognizer.current?.stop();
      return;
    }
    if (!(await ensureSpeechPermission())) return;
    const r = new Speech();
    r.lang = locale;
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e: any) => {
      const text = Array.from(e.results as ArrayLike<any>)
        .map((res: any) => res[0].transcript)
        .join(' ');
      setQuestion(text);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recognizer.current = r;
    setListening(true);
    r.start();
  }

  async function ask() {
    const q = question.trim();
    if (!q && (!start || conversationId)) return;
    setError(null);
    setSaved(false);
    setTurns((prev) => [...prev, { q: q || t('askSheet.explainThis'), a: '' }]);
    setQuestion('');
    setStreaming(true);
    abort.current = new AbortController();
    try {
      await askAI(
        {
          translation,
          mode: 'simple',
          question: q || null,
          verse_key_start: conversationId ? null : start,
          verse_key_end: conversationId ? null : end,
          conversation_id: conversationId,
        },
        (e) => {
          if (e.type === 'start' && e.conversation_id) setConversationId(e.conversation_id);
          if (e.type === 'delta')
            setTurns((prev) => {
              const next = [...prev];
              next[next.length - 1] = { ...next[next.length - 1], a: next[next.length - 1].a + e.text };
              return next;
            });
          if (e.type === 'done')
            setTurns((prev) => {
              const next = [...prev];
              next[next.length - 1] = { ...next[next.length - 1], invalid: e.invalid_references };
              return next;
            });
          if (e.type === 'error') setError(t('study.errors.generic'));
        },
        abort.current.signal,
      );
    } catch (e) {
      const code = e instanceof ApiError ? e.code : 'generic';
      const msg = t(`study.errors.${code}` as any);
      setError(msg === `study.errors.${code}` ? t('study.errors.generic') : msg);
      setTurns((prev) => prev.slice(0, -1));
    } finally {
      setStreaming(false);
    }
  }

  async function save() {
    if (!conversationId) return;
    await aiApi.save(conversationId, true).catch(() => {});
    setSaved(true);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={{ flex: 1, backgroundColor: colors.overlay }} onPress={close} accessibilityLabel={t('bible.close')} />
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: '88%',
          backgroundColor: colors.bg,
          borderTopLeftRadius: radius.lg,
          borderTopRightRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          paddingBottom: insets.bottom + 12,
        }}>
        <View style={{ width: '100%', maxWidth: 720, alignSelf: 'center', flexShrink: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16, paddingBottom: 8 }}>
            <Ionicons name="sparkles" size={20} color={colors.gold} />
            <View style={{ flex: 1 }}>
              <Text variant="heading">{t('study.askAI')}</Text>
              {label ? <Text variant="small">{label}</Text> : null}
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={t('bible.close')} onPress={close} hitSlop={12}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 12, paddingBottom: 8 }}>
            {turns.length === 0 ? <Text variant="muted">{hint ?? t('askSheet.hint')}</Text> : null}
            {turns.map((turn, i) => (
              <View key={i} style={{ gap: 8 }}>
                <View style={{ alignSelf: 'flex-end', maxWidth: '90%', backgroundColor: colors.surfaceAlt, borderRadius: radius.lg, padding: 10 }}>
                  <Text variant="body">{turn.q}</Text>
                </View>
                {turn.a ? (
                  <Markdown text={turn.a} />
                ) : (
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <ActivityIndicator color={colors.gold} />
                    <Text variant="muted">{t('study.thinking')}</Text>
                  </View>
                )}
                {turn.invalid?.length ? <Notice kind="error">{t('study.invalidRefs', { refs: turn.invalid.join(', ') })}</Notice> : null}
              </View>
            ))}
            {error ? <Notice kind="error">{error}</Notice> : null}
            {saved ? <Notice kind="success">{t('study.saved')}</Notice> : null}
            {turns.length && !streaming ? <Text variant="small">{t('study.disclaimer')}</Text> : null}
          </ScrollView>

          <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 8 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-end',
                gap: 8,
                borderWidth: 1,
                borderColor: listening ? colors.gold : colors.border,
                borderRadius: radius.lg,
                backgroundColor: colors.surface,
                paddingHorizontal: 12,
                paddingVertical: 6,
              }}>
              <TextInput
                value={question}
                onChangeText={setQuestion}
                placeholder={turns.length ? t('study.followUpPlaceholder') : t('askSheet.placeholder')}
                placeholderTextColor={colors.textMuted}
                multiline
                maxLength={2000}
                accessibilityLabel={t('study.question')}
                style={{ flex: 1, color: colors.text, fontFamily: fonts.body, fontSize: 16, minHeight: 40, maxHeight: 120, paddingVertical: 8 }}
              />
              {Speech ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={listening ? t('askSheet.stopListening') : t('askSheet.speak')}
                  onPress={listen}
                  hitSlop={8}
                  style={{ padding: 6 }}>
                  <Ionicons name={listening ? 'mic' : 'mic-outline'} size={24} color={listening ? colors.danger : colors.gold} />
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('study.send')}
                onPress={streaming ? () => abort.current?.abort() : ask}
                hitSlop={8}
                style={{ padding: 6 }}>
                <Ionicons name={streaming ? 'stop-circle' : 'arrow-up-circle'} size={30} color={colors.gold} />
              </Pressable>
            </View>
            {listening ? <Text variant="small" style={{ color: colors.gold }}>{t('askSheet.listening')}</Text> : null}
            {conversationId && !streaming && turns.length ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Button kind="secondary" icon={saved ? 'bookmark' : 'bookmark-outline'} title={t('askSheet.saveToStudy')} onPress={save} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    kind="ghost"
                    icon="open-outline"
                    title={t('askSheet.openInStudy')}
                    onPress={() => {
                      const id = conversationId;
                      close();
                      router.navigate({ pathname: '/study', params: { c: id } });
                    }}
                  />
                </View>
              </View>
            ) : null}
            {!turns.length && start ? (
              <RNText style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 12, textAlign: 'center' }}>
                {t('askSheet.emptyHint')}
              </RNText>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

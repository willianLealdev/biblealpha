// Assistente de IA sobre um bloco da ministração: escolhe a ação, vê a sugestão e decide
// inserir abaixo, substituir ou descartar. Nada entra no texto sem o pregador tocar.

import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text as RNText, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Markdown } from '@/components/markdown';
import { Button, Notice, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { ASSIST_ACTIONS, CLARIFY_ACTIONS, sermonApi, type AssistAction } from '@/lib/sermons';
import { useTheme } from '@/theme';
import { fonts, radius } from '@/theme/tokens';

export function AssistSheet({
  sermonId,
  text,
  canReplace,
  onClose,
  onInsertBelow,
  onReplace,
}: {
  sermonId: string;
  /** Conteúdo do bloco escolhido; null fecha a janela */
  text: string | null;
  canReplace: boolean;
  onClose: () => void;
  onInsertBelow: (suggestion: string) => void;
  onReplace: (suggestion: string) => void;
}) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const isAdmin = !!useSession().user?.roles.includes('admin');
  const [action, setAction] = useState<AssistAction | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ suggestion: string; invalid_references: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(a: AssistAction) {
    if (!text?.trim()) {
      setError(t('sermons.assist.empty'));
      return;
    }
    setAction(a);
    setResult(null);
    setError(null);
    setLoading(true);
    try {
      setResult(await sermonApi.assist(sermonId, a, text));
    } catch (e) {
      const code = e instanceof ApiError ? e.code : 'generic';
      const msg = t(`study.errors.${code}` as any);
      setError(msg === `study.errors.${code}` ? t('study.errors.generic') : msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={text !== null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: colors.overlay }} onPress={onClose} accessibilityLabel={t('bible.close')} />
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
            <Text variant="heading" style={{ flex: 1 }}>
              {t('sermons.assist.title')}
            </Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('bible.close')} hitSlop={12}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, gap: 12, paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
            <Text variant="small" numberOfLines={3}>
              {text}
            </Text>
            <Text variant="label">{t('sermons.assist.choose')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {(isAdmin ? ASSIST_ACTIONS : CLARIFY_ACTIONS).map((a) => {
                const active = a === action;
                return (
                  <Pressable
                    key={a}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active, disabled: loading }}
                    disabled={loading}
                    onPress={() => run(a)}
                    style={{
                      borderWidth: 1,
                      borderColor: active ? colors.gold : colors.border,
                      backgroundColor: active ? colors.gold : 'transparent',
                      borderRadius: radius.pill,
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                    }}>
                    <RNText style={{ color: active ? colors.onGold : colors.text, fontFamily: fonts.bodyMedium, fontSize: 14 }}>
                      {t(`sermons.assist.actions.${a}`)}
                    </RNText>
                  </Pressable>
                );
              })}
            </View>
            {loading ? (
              <View style={{ alignItems: 'center', gap: 8, paddingVertical: 12 }}>
                <ActivityIndicator color={colors.gold} />
                <Text variant="muted">{t('sermons.assist.working')}</Text>
              </View>
            ) : null}
            {error ? <Notice kind="error">{error}</Notice> : null}
            {result ? (
              <View style={{ gap: 12 }}>
                <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, backgroundColor: colors.surface }}>
                  <Markdown text={result.suggestion} />
                </View>
                {result.invalid_references.length ? (
                  <Notice kind="error">{t('study.invalidRefs', { refs: result.invalid_references.join(', ') })}</Notice>
                ) : null}
                <Text variant="small">{t('study.disclaimer')}</Text>
                <Button icon="arrow-down" title={t('sermons.assist.insertBelow')} onPress={() => onInsertBelow(result.suggestion)} />
                {canReplace ? (
                  <Button kind="secondary" icon="swap-horizontal" title={t('sermons.assist.replace')} onPress={() => onReplace(result.suggestion)} />
                ) : null}
                <Button kind="ghost" title={t('sermons.assist.discard')} onPress={() => setResult(null)} />
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

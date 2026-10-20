// Biblioteca de fundos do telão: a pessoa guarda até LIBRARY_MAX fundos criados pela IA e reutiliza em
// qualquer ministração, sem gastar de novo. Para criar outro com a biblioteca cheia, apaga um.

import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, Text as RNText, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LinearGradientBg } from '@/components/gradient-bg';
import { Notice, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { backgroundUrl, screenApi, type Library, type ScreenState } from '@/lib/screens';
import { useTheme } from '@/theme';
import { fonts, radius } from '@/theme/tokens';

export function BackgroundLibrary({
  sermonId,
  screenId,
  onClose,
  onUsed,
  onCreate,
  creating,
}: {
  sermonId: string;
  /** Tela conectada (púlpito): ela redesenha com o fundo escolhido. Sem tela, só a ministração muda. */
  screenId?: string | null;
  onClose: () => void;
  /** Escolheu um fundo da biblioteca (devolve o estado da tela, quando há) */
  onUsed: (state: ScreenState | null) => void;
  /** Criar um fundo novo com a IA (só quando há espaço e cota) */
  onCreate: () => void;
  creating: boolean;
}) {
  const { t, errorMessage } = useI18n();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<Library | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      screenApi
        .library(sermonId)
        .then(setData)
        .catch((e) => setError(errorMessage(e))),
    [errorMessage, sermonId],
  );
  useEffect(() => {
    load();
  }, [load]);

  async function use(id: string) {
    setBusy(id);
    setError(null);
    try {
      if (screenId) onUsed(await screenApi.useBackground(screenId, id));
      else {
        await screenApi.useSermonBackground(sermonId, id);
        onUsed(null);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy(id);
    setError(null);
    try {
      await screenApi.deleteBackground(id);
      setConfirm(null);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const full = !!data && data.library_count >= data.library_max;
  const noQuota = !!data && !full && !data.can_generate;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: colors.overlay }} onPress={onClose} accessibilityLabel={t('bible.close')} />
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: '92%',
          backgroundColor: colors.bg,
          borderTopLeftRadius: radius.lg,
          borderTopRightRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 16,
          paddingBottom: insets.bottom + 16,
        }}>
        <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center', gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="images-outline" size={22} color={colors.gold} />
            <Text variant="heading" style={{ flex: 1 }}>
              {t('screen.library.title')}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel={t('bible.close')} onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </Pressable>
          </View>
          <Text variant="small">{t('screen.library.hint', { max: data?.library_max ?? 10 })}</Text>
          {error ? <Notice kind="error">{error}</Notice> : null}

          {!data ? (
            <ActivityIndicator color={colors.gold} />
          ) : (
            <>
              <Text variant="label">{t('screen.library.count', { n: data.library_count, max: data.library_max })}</Text>
              <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 10 }}>
                {data.items.length === 0 ? <Text variant="muted">{t('screen.library.empty')}</Text> : null}
                {data.items.map((b) => {
                  const active = b.id === data.current_id;
                  return (
                    <View
                      key={b.id}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: active ? colors.gold : colors.border, borderRadius: radius.md, padding: 8 }}>
                      <Pressable accessibilityRole="button" accessibilityLabel={t('screen.library.use')} onPress={() => use(b.id)} disabled={busy !== null} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                        <View style={{ width: 96, height: 54, borderRadius: 8, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
                          {b.image ? (
                            <Image source={{ uri: backgroundUrl(b.id) }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} resizeMode="cover" />
                          ) : (
                            <LinearGradientBg colors={b.style.gradient} />
                          )}
                          <View style={{ position: 'absolute', inset: 0, backgroundColor: '#000', opacity: b.style.overlay * 0.6 }} />
                          <RNText style={{ color: b.style.text_color, fontFamily: b.style.font === 'sans' ? fonts.bodyBold : fonts.display, fontSize: 16 }}>Aa</RNText>
                        </View>
                        <View style={{ flex: 1 }}>
                          <RNText numberOfLines={1} style={{ color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 15 }}>
                            {b.label || t('screen.library.noName')}
                          </RNText>
                          <RNText style={{ color: active ? colors.gold : colors.textMuted, fontFamily: fonts.body, fontSize: 12 }}>
                            {active ? t('screen.library.inUse') : t('screen.library.use')}
                          </RNText>
                        </View>
                      </Pressable>
                      {busy === b.id ? (
                        <ActivityIndicator color={colors.gold} />
                      ) : confirm === b.id ? (
                        <Pressable accessibilityRole="button" onPress={() => remove(b.id)} style={{ backgroundColor: colors.danger, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
                          <RNText style={{ color: '#fff', fontFamily: fonts.bodyBold, fontSize: 13 }}>{t('screen.library.confirmDelete')}</RNText>
                        </Pressable>
                      ) : (
                        <Pressable accessibilityRole="button" accessibilityLabel={t('screen.library.delete')} onPress={() => setConfirm(b.id)} hitSlop={10} style={{ padding: 6 }}>
                          <Ionicons name="trash-outline" size={20} color={colors.textMuted} />
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </ScrollView>

              {full ? <Notice>{t('screen.library.full', { max: data.library_max })}</Notice> : null}
              {noQuota ? <Notice>{t('screen.quota')}</Notice> : null}
              <Pressable
                accessibilityRole="button"
                disabled={full || noQuota || creating}
                onPress={() => {
                  onCreate();
                  onClose();
                }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  borderRadius: radius.pill,
                  paddingVertical: 12,
                  backgroundColor: colors.gold,
                  opacity: full || noQuota || creating ? 0.4 : pressed ? 0.8 : 1,
                })}>
                <Ionicons name="sparkles" size={18} color={colors.onGold} />
                <RNText style={{ color: colors.onGold, fontFamily: fonts.bodyBold, fontSize: 16 }}>{t('screen.newBackground')}</RNText>
              </Pressable>
              {data.remaining !== null && !full ? <Text variant="small">{t('screen.library.remaining', { n: data.remaining })}</Text> : null}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

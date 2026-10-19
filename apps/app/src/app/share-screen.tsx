// Compartilhar tela (igual ao WhatsApp Web): no computador aparece um QR code; aqui a pessoa
// escaneia (ou digita o código), escolhe a ministração e vai para o púlpito já conectada.

import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text as RNText, View } from 'react-native';

import { Card, Divider, Notice, Screen, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { ApiError } from '@/lib/api';
import { APP_URL, codeFrom, rememberScreen, screenApi } from '@/lib/screens';
import { sermonApi, type SermonSummary } from '@/lib/sermons';
import { ScanCode } from '@/sermon/scan-code';
import { useTheme } from '@/theme';
import { fonts, radius } from '@/theme/tokens';

export default function ShareScreen() {
  const params = useLocalSearchParams<{ code?: string; sermon?: string }>();
  const { t } = useI18n();
  const { colors } = useTheme();
  const [code, setCode] = useState<string | null>(null);
  const [sermons, setSermons] = useState<SermonSummary[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function connect(c: string, sermonId: string) {
    const s = await screenApi.pair(c, sermonId);
    await rememberScreen(sermonId, { id: s.id, code: s.code });
    router.replace({ pathname: '/sermon/[id]/pulpit', params: { id: sermonId } });
  }

  // Código lido e conferido: com a ministração já escolhida (aberto do editor) conecta direto
  async function gotCode(c: string) {
    await screenApi.check(c);
    if (params.sermon) return connect(c, params.sermon);
    setCode(c);
    if (!sermons) sermonApi.list().then((r) => setSermons(r.sermons)).catch(() => setSermons([]));
  }

  // Aberto pelo link do QR code (câmera do celular fora do app)
  useEffect(() => {
    const c = codeFrom(params.code ?? '');
    if (c.length !== 6) return;
    let alive = true;
    (async () => {
      try {
        await gotCode(c);
      } catch {
        if (alive) setError(t('screen.notFound'));
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.code]);

  async function choose(sermonId: string) {
    setBusy(sermonId);
    setError(null);
    try {
      await connect(code!, sermonId);
    } catch (e) {
      const k = e instanceof ApiError ? e.code : '';
      setError(k === 'screen_taken' ? t('screen.taken') : k === 'screen_not_found' ? t('screen.notFound') : t('study.errors.generic'));
      if (k === 'screen_not_found') setCode(null);
    } finally {
      setBusy(null);
    }
  }

  const steps = [t('screen.step1', { url: APP_URL ? APP_URL.replace(/^https?:\/\//, '') : 'BibleAlpha' }), t('screen.step2'), t('screen.step3')];

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Ionicons name="tv" size={28} color={colors.gold} />
        <Text variant="title">{t('screen.share')}</Text>
      </View>
      {error ? <Notice kind="error">{error}</Notice> : null}

      {!code ? (
        <>
          <Card>
            {steps.map((s, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' }}>
                  <RNText style={{ color: colors.onGold, fontFamily: fonts.bodyBold }}>{i + 1}</RNText>
                </View>
                <Text variant="body" style={{ flex: 1 }}>
                  {s}
                </Text>
              </View>
            ))}
          </Card>
          <ScanCode onCode={gotCode} />
        </>
      ) : (
        <>
          <Notice kind="success">{t('screen.codeOk', { code })}</Notice>
          <Text variant="heading">{t('screen.whichMessage')}</Text>
          {sermons === null ? <ActivityIndicator color={colors.gold} /> : null}
          {sermons?.length === 0 ? <Text variant="muted">{t('sermons.empty')}</Text> : null}
          {sermons?.length ? (
            <Card style={{ paddingVertical: 4 }}>
              {sermons.map((s, i) => (
                <View key={s.id}>
                  {i > 0 ? <Divider /> : null}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => choose(s.id)}
                    disabled={!!busy}
                    style={({ pressed }) => ({ paddingVertical: 12, flexDirection: 'row', gap: 12, alignItems: 'center', opacity: pressed ? 0.7 : 1 })}>
                    <Ionicons name="document-text-outline" size={22} color={colors.gold} />
                    <View style={{ flex: 1 }}>
                      <Text variant="heading" numberOfLines={1}>
                        {s.title}
                      </Text>
                      {s.main_reference ? <Text variant="small">{s.main_reference}</Text> : null}
                    </View>
                    {busy === s.id ? <ActivityIndicator color={colors.gold} /> : <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
                  </Pressable>
                </View>
              ))}
            </Card>
          ) : null}
          <Pressable accessibilityRole="button" onPress={() => setCode(null)} style={{ alignSelf: 'center', padding: 8, borderRadius: radius.pill }}>
            <RNText style={{ color: colors.gold, fontFamily: fonts.bodyMedium }}>{t('screen.otherCode')}</RNText>
          </Pressable>
        </>
      )}
    </Screen>
  );
}

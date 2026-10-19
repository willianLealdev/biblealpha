// Compartilhar tela (igual ao WhatsApp Web): no computador aparece um QR code; aqui a pessoa
// escaneia (ou digita o código) e o aparelho fica conectado à tela. A conexão vale para
// todas as ministrações: é só abrir qualquer uma no púlpito.

import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text as RNText, View } from 'react-native';

import { Button, Card, Divider, Notice, Screen, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { APP_URL, codeFrom, rememberedScreen, rememberScreen, screenApi } from '@/lib/screens';
import { sermonApi, type SermonSummary } from '@/lib/sermons';
import { ScanCode } from '@/sermon/scan-code';
import { useTheme } from '@/theme';
import { fonts } from '@/theme/tokens';

type Connected = { id: string; code: string };

export default function ShareScreen() {
  const params = useLocalSearchParams<{ code?: string; sermon?: string }>();
  const { t } = useI18n();
  const { colors } = useTheme();
  const [connected, setConnected] = useState<Connected | null>(null);
  const [sermons, setSermons] = useState<SermonSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function loadSermons() {
    sermonApi.list().then((r) => setSermons(r.sermons)).catch(() => setSermons([]));
  }

  // Lido o código: o aparelho fica conectado à tela (para qualquer ministração)
  async function gotCode(c: string) {
    const s = await screenApi.pair(c, params.sermon ?? null);
    const info = { id: s.id, code: s.code };
    await rememberScreen(info);
    if (params.sermon) {
      router.replace({ pathname: '/sermon/[id]/pulpit', params: { id: params.sermon } });
      return;
    }
    setConnected(info);
    loadSermons();
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      const c = codeFrom(params.code ?? '');
      try {
        // Aberto pelo link do QR code (câmera do celular fora do app)
        if (c.length === 6) return await gotCode(c);
        // Já conectado antes: mostra a conexão atual
        const saved = await rememberedScreen();
        if (saved && alive) {
          setConnected(saved);
          loadSermons();
        }
      } catch {
        if (alive) setError(t('screen.notFound'));
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.code]);

  async function disconnect() {
    if (connected) await screenApi.end(connected.id).catch(() => {});
    await rememberScreen(null);
    setConnected(null);
  }

  const steps = [t('screen.step1', { url: APP_URL ? APP_URL.replace(/^https?:\/\//, '') : 'BibleAlpha' }), t('screen.step2'), t('screen.step3')];

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Ionicons name="tv" size={28} color={colors.gold} />
        <Text variant="title">{t('screen.share')}</Text>
      </View>
      {error ? <Notice kind="error">{error}</Notice> : null}

      {!connected ? (
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
          <Notice kind="success">{t('screen.connectedAll', { code: connected.code })}</Notice>
          <Text variant="heading">{t('screen.openAny')}</Text>
          {sermons === null ? <ActivityIndicator color={colors.gold} /> : null}
          {sermons?.length === 0 ? <Text variant="muted">{t('sermons.empty')}</Text> : null}
          {sermons?.length ? (
            <Card style={{ paddingVertical: 4 }}>
              {sermons.map((s, i) => (
                <View key={s.id}>
                  {i > 0 ? <Divider /> : null}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push({ pathname: '/sermon/[id]/pulpit', params: { id: s.id } })}
                    style={({ pressed }) => ({ paddingVertical: 12, flexDirection: 'row', gap: 12, alignItems: 'center', opacity: pressed ? 0.7 : 1 })}>
                    <Ionicons name="easel-outline" size={22} color={colors.gold} />
                    <View style={{ flex: 1 }}>
                      <Text variant="heading" numberOfLines={1}>
                        {s.title}
                      </Text>
                      {s.main_reference ? <Text variant="small">{s.main_reference}</Text> : null}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </Pressable>
                </View>
              ))}
            </Card>
          ) : null}
          <Button kind="secondary" icon="close-circle-outline" title={t('screen.disconnect')} onPress={disconnect} />
        </>
      )}
    </Screen>
  );
}

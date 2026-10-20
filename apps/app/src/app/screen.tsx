// Telão da igreja: abra este endereço no computador ligado ao projetor/TV.
// Mostra um QR code; o pregador lê pelo app e passa a escolher o texto que aparece aqui.
// A tela mostra só o texto (sem o título da ministração), sobre o fundo criado pela IA.

import Ionicons from '@expo/vector-icons/Ionicons';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Platform, Pressable, Text as RNText, useWindowDimensions, View } from 'react-native';
import { LinearGradientBg } from '@/components/gradient-bg';
import { QrCode } from '@/components/qr-code';
import { Seal } from '@/components/ui';
import { useI18n } from '@/i18n';
import { ApiError } from '@/lib/api';
import { kvGet, kvSet } from '@/lib/kv';
import { backgroundUrl, screenApi, type ScreenState } from '@/lib/screens';
import { fonts } from '@/theme/tokens';

const STORE = 'screen:display';
type Stored = { id: string; token: string; pair_url: string };

/** Tamanho da letra para o texto caber na tela (textos curtos ficam grandes). */
function fitFont(text: string, width: number, height: number) {
  const area = width * 0.86 * (height * 0.72);
  const size = Math.sqrt((area * 0.42) / Math.max(12, text.length));
  return Math.round(Math.max(26, Math.min(height / 7, size)));
}

export default function ChurchScreen() {
  const { t } = useI18n();
  const { width, height } = useWindowDimensions();
  const [session, setSession] = useState<Stored | null>(null);
  const [state, setState] = useState<ScreenState | null>(null);
  const [error, setError] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [fade] = useState(() => new Animated.Value(1));
  const lastVersion = useRef(-1);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openNew = useCallback(async () => {
    setError(false);
    try {
      const s = await screenApi.open();
      const stored = { id: s.id, token: s.token, pair_url: s.pair_url };
      await kvSet(STORE, stored);
      lastVersion.current = -1;
      setSession(stored);
      setState(s);
    } catch {
      setError(true);
    }
  }, []);

  // Recarregar a página mantém a mesma conexão
  useEffect(() => {
    kvGet<Stored>(STORE).then((s) => (s ? setSession(s) : openNew()));
  }, [openNew]);

  useEffect(() => {
    let ok = false;
    activateKeepAwakeAsync('screen').then(() => (ok = true), () => {});
    return () => {
      if (ok) deactivateKeepAwake('screen');
    };
  }, []);

  // Lê o que mostrar a cada segundo
  useEffect(() => {
    if (!session) return;
    let stop = false;
    async function tick() {
      try {
        const s = await screenApi.state(session!.id, session!.token);
        if (stop) return;
        if (s.version !== lastVersion.current) {
          lastVersion.current = s.version;
          fade.setValue(0);
          setState(s);
          Animated.timing(fade, { toValue: 1, duration: 450, useNativeDriver: Platform.OS !== 'web' }).start();
        }
        setError(false);
      } catch (e) {
        if (stop) return;
        if (e instanceof ApiError && e.status === 404) return openNew();
        setError(true);
      }
    }
    tick();
    const timer = setInterval(tick, 1000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [session, fade, openNew]);

  function poke() {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), 3000);
  }

  function fullscreen() {
    const doc = globalThis.document as any;
    if (!doc) return;
    if (doc.fullscreenElement) doc.exitFullscreen?.();
    else doc.documentElement?.requestFullscreen?.().catch(() => {});
  }

  const style = state?.background.style;
  const paired = state?.status === 'paired';
  const slide = paired ? state?.slide : null;

  return (
    <Pressable onPress={poke} onHoverIn={poke} style={{ flex: 1, backgroundColor: '#000' }} accessibilityRole="none">
      {/* Fundo: imagem criada pela IA (ou degradê escolhido por ela) */}
      {style ? (
        <View style={{ position: 'absolute', inset: 0 } as object}>
          <LinearGradientBg colors={style.gradient} />
          {paired && state?.background.image && state.background.id ? (
            <Image source={{ uri: backgroundUrl(state.background.id) }} style={{ position: 'absolute', width: '100%', height: '100%' }} contentFit="cover" />
          ) : null}
          <View style={{ position: 'absolute', inset: 0, backgroundColor: `rgba(0,0,0,${paired ? style.overlay : 0.55})` } as object} />
        </View>
      ) : null}

      {!state ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          {error ? <RNText style={{ color: '#fff', fontFamily: fonts.body }}>{t('screen.offline')}</RNText> : <ActivityIndicator color="#E8B23A" />}
        </View>
      ) : state.status === 'waiting' && session ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 22, padding: 24 }}>
          <Seal size={64} />
          <RNText style={{ color: '#EDEBE6', fontFamily: fonts.display, fontSize: Math.min(46, width / 18), textAlign: 'center' }}>{t('screen.title')}</RNText>
          <View style={{ padding: 14, backgroundColor: '#fff', borderRadius: 18 }}>
            <QrCode value={session.pair_url} size={Math.min(320, height * 0.42, width * 0.7)} />
          </View>
          <RNText style={{ color: '#E8B23A', fontFamily: fonts.bodyBold, fontSize: 40, letterSpacing: 8 }} accessibilityLabel={state.code}>
            {state.code}
          </RNText>
          <RNText style={{ color: '#cfc9bd', fontFamily: fonts.body, fontSize: 18, textAlign: 'center', maxWidth: 640, lineHeight: 28 }}>
            {t('screen.instructions')}
          </RNText>
        </View>
      ) : state.status === 'ended' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
          <RNText style={{ color: '#EDEBE6', fontFamily: fonts.display, fontSize: 40 }}>{t('screen.ended')}</RNText>
          <Pressable onPress={openNew} accessibilityRole="button" style={{ backgroundColor: '#E8B23A', borderRadius: 999, paddingHorizontal: 26, paddingVertical: 14 }}>
            <RNText style={{ color: '#0B0906', fontFamily: fonts.bodyBold, fontSize: 18 }}>{t('screen.newConnection')}</RNText>
          </Pressable>
        </View>
      ) : (
        <Animated.View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: width * 0.07, opacity: fade }}>
          {slide ? (
            <>
              {slide.title ? (
                // Sozinho: grande no meio. Com texto: menor, acima dele
                <RNText
                  style={{
                    color: slide.text ? style!.accent_color : style!.text_color,
                    fontFamily: slide.text ? fonts.bodyBold : style!.font === 'serif' ? fonts.display : fonts.bodyMedium,
                    fontSize: slide.text ? Math.max(24, Math.round(height / 17)) : fitFont(slide.title, width, height),
                    lineHeight: slide.text ? undefined : Math.round(fitFont(slide.title, width, height) * 1.25),
                    marginBottom: slide.text ? height / 36 : 0,
                    textAlign: 'center',
                    textShadowColor: 'rgba(0,0,0,0.65)',
                    textShadowRadius: 12,
                  }}>
                  {slide.title}
                </RNText>
              ) : null}
              {slide.text ? (
                <RNText
                  style={{
                    color: style!.text_color,
                    fontFamily: style!.font === 'serif' ? fonts.display : fonts.bodyMedium,
                    fontSize: fitFont(slide.text, width, slide.title ? height * 0.8 : height),
                    lineHeight: Math.round(fitFont(slide.text, width, slide.title ? height * 0.8 : height) * 1.25),
                    textAlign: 'center',
                    textShadowColor: 'rgba(0,0,0,0.65)',
                    textShadowRadius: 12,
                  }}>
                  {slide.text}
                </RNText>
              ) : null}
              {slide.reference && slide.text ? (
                <RNText style={{ color: style!.accent_color, fontFamily: fonts.bodyBold, fontSize: Math.max(22, height / 26), marginTop: height / 30, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 8 }}>
                  {slide.reference}
                </RNText>
              ) : null}
            </>
          ) : null}
        </Animated.View>
      )}

      {/* Tela cheia (some sozinho para não aparecer no telão) */}
      {Platform.OS === 'web' && showControls ? (
        <Pressable
          onPress={fullscreen}
          accessibilityRole="button"
          accessibilityLabel={t('screen.fullscreen')}
          style={{ position: 'absolute', right: 16, bottom: 16, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 }}>
          <Ionicons name="expand" size={18} color="#E8B23A" />
          <RNText style={{ color: '#EDEBE6', fontFamily: fonts.bodyMedium }}>{t('screen.fullscreen')}</RNText>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

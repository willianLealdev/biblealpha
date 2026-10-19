import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text as RNText, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Notice } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { fonts } from '@/theme/tokens';

type Slide =
  | { kind: 'title'; title: string; subtitle: string }
  | { kind: 'section'; title: string; points: string[] }
  | { kind: 'scripture'; title: string; text: string };

// Cores fixas do projetor: fundo escuro e dourado, em qualquer tema do app
const BG = '#0A0806';
const GOLD = '#E8B33A';
const TEXT = '#F3ECDF';
const MUTED = '#A89F8F';

/** Apresentar a ministração em slides (para projetar): toque nas laterais ou use as setas. */
export default function PresentSermon() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, errorMessage } = useI18n();
  const { width, height } = useWindowDimensions();
  const [slides, setSlides] = useState<Slide[] | null>(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ slides: Slide[] }>(`/sermons/${id}/slides`)
      .then((r) => setSlides(r.slides))
      .catch((e) => setError(errorMessage(e)));
  }, [id, errorMessage]);

  const total = slides?.length ?? 0;
  const go = (delta: number) => setIndex((i) => Math.min(Math.max(0, i + delta), Math.max(0, total - 1)));
  const exit = () => (router.canGoBack() ? router.back() : router.replace({ pathname: '/sermon/[id]', params: { id } }));

  // Teclado (computador ligado ao projetor): setas, espaço, Esc
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowRight', 'ArrowDown', ' ', 'PageDown'].includes(e.key)) setIndex((i) => Math.min(i + 1, Math.max(0, total - 1)));
      if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) setIndex((i) => Math.max(0, i - 1));
      if (e.key === 'Escape') router.back();
    };
    globalThis.addEventListener('keydown', onKey);
    return () => globalThis.removeEventListener('keydown', onKey);
  }, [total]);

  const scale = Math.max(0.6, Math.min(width / 1100, height / 700));
  const slide = slides?.[index];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('sermons.exitPresent')} onPress={exit} hitSlop={12}>
          <Ionicons name="close" size={26} color={MUTED} />
        </Pressable>
        <RNText style={{ color: MUTED, fontFamily: fonts.body }}>{total ? `${index + 1} / ${total}` : ''}</RNText>
      </View>
      {error ? <Notice kind="error">{error}</Notice> : null}
      {!slides && !error ? <ActivityIndicator color={GOLD} style={{ flex: 1 }} /> : null}
      {slide ? (
        <View style={{ flex: 1 }}>
          <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 48 * scale, gap: 24 * scale }}>
            {slide.kind === 'title' ? (
              <>
                <RNText style={{ color: GOLD, fontFamily: fonts.displayBold, fontSize: 64 * scale, textAlign: 'center' }}>{slide.title}</RNText>
                {slide.subtitle ? <RNText style={{ color: MUTED, fontFamily: fonts.body, fontSize: 30 * scale, textAlign: 'center' }}>{slide.subtitle}</RNText> : null}
              </>
            ) : slide.kind === 'section' ? (
              <>
                {slide.title ? <RNText style={{ color: GOLD, fontFamily: fonts.displayBold, fontSize: 52 * scale }}>{slide.title}</RNText> : null}
                {slide.points.map((p, i) => (
                  <RNText key={i} style={{ color: TEXT, fontFamily: fonts.body, fontSize: 32 * scale, lineHeight: 44 * scale }}>
                    • {p}
                  </RNText>
                ))}
              </>
            ) : (
              <>
                <RNText style={{ color: GOLD, fontFamily: fonts.displayBold, fontSize: 44 * scale }}>{slide.title}</RNText>
                <RNText
                  style={{
                    color: TEXT,
                    fontFamily: 'Literata_400Regular',
                    fontStyle: 'italic',
                    fontSize: (slide.text.length < 400 ? 34 : slide.text.length < 800 ? 26 : 20) * scale,
                    lineHeight: (slide.text.length < 400 ? 50 : slide.text.length < 800 ? 38 : 30) * scale,
                  }}>
                  {slide.text}
                </RNText>
              </>
            )}
          </View>
          {/* Toque nas laterais para voltar/avançar */}
          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, flexDirection: 'row' }}>
            <Pressable accessibilityRole="button" accessibilityLabel={t('sermons.prevSlide')} style={{ flex: 1 }} onPress={() => go(-1)} />
            <Pressable accessibilityRole="button" accessibilityLabel={t('sermons.nextSlide')} style={{ flex: 2 }} onPress={() => go(1)} />
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

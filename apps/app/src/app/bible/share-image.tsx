import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, Text as RNText, useWindowDimensions, View } from 'react-native';

import { LinearGradientBg } from '@/components/gradient-bg';
import { Button, Notice, Screen, Segmented, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { API_BASE } from '@/lib/api';
import { screenApi, type LibraryBackground } from '@/lib/screens';
import {
  copyVerseImage,
  downloadVerseImage,
  makeVerseImage,
  pickPhoto,
  type Preset,
  type ShareBackground,
  type ShareFormat,
  shareImageApi,
  shareLinks,
  shareVerseImage,
  type VerseImage,
} from '@/lib/share-image';
import { useTheme } from '@/theme';
import { fonts, radius } from '@/theme/tokens';

/** Cria a imagem do versículo (feed ou story) e abre o menu de compartilhar do aparelho. */
export default function ShareImage() {
  const { text = '', reference = '' } = useLocalSearchParams<{ text: string; reference: string }>();
  const { t, errorMessage } = useI18n();
  const { colors } = useTheme();
  const { height } = useWindowDimensions();
  const [format, setFormat] = useState<ShareFormat>('feed');
  const [bg, setBg] = useState<ShareBackground>({ preset: 'gold' });
  const [presets, setPresets] = useState<Preset[]>([]);
  const [library, setLibrary] = useState<LibraryBackground[]>([]);
  const [image, setImage] = useState<VerseImage | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const request = useRef(0);

  useEffect(() => {
    shareImageApi
      .presets()
      .then((r) => setPresets(r.presets))
      .catch(() => {});
    screenApi
      .library()
      .then((r) => setLibrary(r.items.filter((i) => i.image)))
      .catch(() => {});
  }, []);

  // Monta de novo a cada troca de formato ou fundo (só vale a resposta do último pedido)
  useEffect(() => {
    const id = ++request.current;
    makeVerseImage(text, reference, format, bg)
      .then((img) => {
        if (id === request.current) {
          setImage(img);
          setError(null);
        }
      })
      .catch((e) => id === request.current && setError(errorMessage(e)))
      .finally(() => id === request.current && setBusy(false));
  }, [text, reference, format, bg, errorMessage]);

  function choose(next: ShareBackground) {
    setBusy(true);
    setBg(next);
  }

  function changeFormat(next: ShareFormat) {
    setBusy(true);
    setFormat(next);
  }

  async function addPhoto() {
    setInfo(null);
    const photo = await pickPhoto();
    if (photo === 'update') setInfo(t('shareImage.needsUpdate'));
    else if (photo) choose({ photo });
  }

  const filename = `BibleAlpha-${reference.replace(/[^\p{L}\p{N}]+/gu, '-')}.jpg`;
  async function share() {
    if (!image) return;
    setInfo(null);
    try {
      // Celular e apps: abre a lista de apps do aparelho. Computador: mostra as nossas opções.
      if ((await shareVerseImage(image, filename)) === 'unsupported') setSheet(true);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function copy() {
    if (image && (await copyVerseImage(image))) setInfo(t('shareImage.copied'));
    else setInfo(t('shareImage.copyFailed'));
    setSheet(false);
  }

  const ratio = format === 'feed' ? 4 / 5 : 9 / 16;
  const previewH = Math.min(height * 0.55, 560);
  const selected = (b: ShareBackground) => JSON.stringify(b) === JSON.stringify(bg);

  return (
    <Screen>
      <View style={{ alignItems: 'center' }}>
        <View
          style={{
            height: previewH,
            width: previewH * ratio,
            borderRadius: radius.md,
            overflow: 'hidden',
            backgroundColor: colors.surfaceAlt,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          {image ? <Image source={{ uri: image.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" /> : null}
          {busy ? (
            <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)' } as never}>
              <ActivityIndicator color={colors.gold} size="large" />
            </View>
          ) : null}
        </View>
      </View>

      {error ? <Notice kind="error">{error}</Notice> : null}
      {info ? <Notice kind="info">{info}</Notice> : null}

      <Segmented
        value={format}
        onChange={changeFormat}
        options={[
          { value: 'feed', label: t('shareImage.feed') },
          { value: 'story', label: t('shareImage.story') },
        ]}
      />

      <Text variant="label">{t('shareImage.background')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 2 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('shareImage.myPhoto')}
          onPress={addPhoto}
          style={[thumb, { borderColor: 'photo' in bg ? colors.gold : colors.border, alignItems: 'center', justifyContent: 'center', gap: 2 }]}>
          <Ionicons name="image-outline" size={24} color={colors.gold} />
          <RNText style={{ color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 10 }}>{t('shareImage.myPhoto')}</RNText>
        </Pressable>
        {presets.map((p) => (
          <Pressable
            key={p.id}
            accessibilityRole="radio"
            accessibilityState={{ selected: selected({ preset: p.id }) }}
            onPress={() => choose({ preset: p.id })}
            style={[thumb, { borderColor: selected({ preset: p.id }) ? colors.gold : 'transparent' }]}>
            <LinearGradientBg colors={p.colors} />
          </Pressable>
        ))}
        {library.map((l) => (
          <Pressable
            key={l.id}
            accessibilityRole="radio"
            accessibilityLabel={l.label ?? undefined}
            accessibilityState={{ selected: selected({ libraryId: l.id }) }}
            onPress={() => choose({ libraryId: l.id })}
            style={[thumb, { borderColor: selected({ libraryId: l.id }) ? colors.gold : 'transparent' }]}>
            <Image source={{ uri: `${API_BASE}/screens/backgrounds/${l.id}` }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          </Pressable>
        ))}
      </ScrollView>

      <Button icon="share-social-outline" title={t('shareImage.share')} disabled={!image || busy} onPress={share} />
      <Text variant="small">{t('shareImage.hint')}</Text>

      {sheet && image ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setSheet(false)}>
          <Pressable style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: 20 }} onPress={() => setSheet(false)}>
            <Pressable
              onPress={() => {}}
              style={{ width: '100%', maxWidth: 440, alignSelf: 'center', backgroundColor: colors.bg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 18, gap: 12 }}>
              <Text variant="heading">{t('shareImage.shareTo')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' }}>
                {(
                  [
                    ['copy', 'copy-outline', t('shareImage.copyImage'), copy],
                    ['whatsapp', 'logo-whatsapp', 'WhatsApp', () => Linking.openURL(shareLinks(text, reference).whatsapp)],
                    ['facebook', 'logo-facebook', 'Facebook', () => Linking.openURL(shareLinks(text, reference).facebook)],
                    ['x', 'logo-twitter', 'X', () => Linking.openURL(shareLinks(text, reference).x)],
                    ['telegram', 'paper-plane-outline', 'Telegram', () => Linking.openURL(shareLinks(text, reference).telegram)],
                    [
                      'download',
                      'download-outline',
                      t('shareImage.download'),
                      () => {
                        downloadVerseImage(image, filename);
                        setInfo(t('shareImage.downloaded'));
                        setSheet(false);
                      },
                    ],
                  ] as const
                ).map(([key, icon, label, onPress]) => (
                  <Pressable
                    key={key}
                    accessibilityRole="button"
                    onPress={onPress}
                    style={({ pressed }) => ({
                      width: '31%',
                      alignItems: 'center',
                      gap: 6,
                      paddingVertical: 14,
                      borderRadius: radius.md,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
                    })}>
                    <Ionicons name={icon} size={26} color={colors.gold} />
                    <RNText style={{ color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 12, textAlign: 'center' }}>{label}</RNText>
                  </Pressable>
                ))}
              </View>
              <Text variant="small">{t('shareImage.desktopHint')}</Text>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </Screen>
  );
}

const thumb = {
  width: 64,
  height: 64,
  borderRadius: radius.md,
  borderWidth: 2.5,
  overflow: 'hidden' as const,
};

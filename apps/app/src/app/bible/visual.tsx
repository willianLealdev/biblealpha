import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, Text as RNText, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { bookName } from '@/bible/reference';
import { Button, Card, Notice, Screen, Text } from '@/components/ui';
import { MindMap, type MindMapData } from '@/components/mind-map';
import { PassagePicker } from '@/components/passage-picker';
import { LayerSwitch, type MapLayer, type MapMarker, TileMap } from '@/components/tile-map';
import { useI18n, type TranslationKey } from '@/i18n';
import { API_BASE, api, ApiError } from '@/lib/api';
import { useTheme } from '@/theme';
import { fonts, radius } from '@/theme/tokens';

type Place = { id: string; name: string; label?: string; lon: number; lat: number; kind: string; verse: number };
type Study = {
  title: string;
  summary: string;
  key_verse: string;
  timeline: { when: string; event: string; reference: string; source: string }[];
  characters: { name: string; role: string; reference: string }[];
  old_testament_links: { this_reference: string; other_reference: string; type: string; explanation: string }[];
  jesus_fulfillment: { words: string; reference: string; prophecy_reference: string; explanation: string }[];
  historical_context: { text: string; source: string }[];
  images: string[];
  places: Place[];
  credits: string[];
  mind_map?: MindMapData;
};
const LINK_TYPES: Record<string, TranslationKey> = {
  quotation: 'visual.linkQuotation',
  allusion: 'visual.linkAllusion',
  prophecy_fulfillment: 'visual.linkProphecy',
  parallel: 'visual.linkParallel',
};
type Response = { status: 'ready' | 'none'; can_generate: boolean; remaining: number | null; study?: { content: Study } };

/** Estudo visual do capítulo: ilustrações, resumo, mapa, linha do tempo, personagens e profecias. */
export default function VisualStudy() {
  const params = useLocalSearchParams<{ book: string; chapter: string }>();
  // A pessoa escolhe qualquer livro e capítulo aqui dentro; o que veio da tela anterior é só o ponto de partida
  const [book, setBook] = useState(params.book ?? 'JHN');
  const [chapter, setChapter] = useState(params.chapter ?? '3');
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const [data, setData] = useState<Response | null>(null);
  const [busy, setBusy] = useState(false);
  const [mapBusy, setMapBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Response>(`/visual/${book}/${chapter}`)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.code : 'generic'));
  }, [book, chapter]);

  function pick(nextBook: string, nextChapter: number) {
    setData(null);
    setError(null);
    setBook(nextBook);
    setChapter(String(nextChapter));
  }

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      setData(await api<Response>(`/visual/${book}/${chapter}`, { method: 'POST' }));
    } catch (e) {
      setError(e instanceof ApiError ? e.code : 'generic');
    } finally {
      setBusy(false);
    }
  }

  async function makeMindMap() {
    setMapBusy(true);
    setError(null);
    try {
      setData(await api<Response>(`/visual/${book}/${chapter}/mind-map`, { method: 'POST', timeoutMs: 180_000 }));
    } catch (e) {
      setError(e instanceof ApiError ? e.code : 'generic');
    } finally {
      setMapBusy(false);
    }
  }

  const label = `${bookName(book, locale)} ${chapter}`;
  const errorText = error ? (error === 'visual_quota' ? t('visual.quota') : t('study.errors.generic')) : null;
  const s = data?.study?.content;

  return (
    <Screen>
      <PassagePicker book={book} chapter={Number(chapter) || 1} onChange={pick} />
      <Text variant="title">{s?.title || label}</Text>
      {s ? <Text variant="muted">{label}</Text> : null}
      {errorText ? <Notice kind="error">{errorText}</Notice> : null}
      {!data && !error ? <ActivityIndicator color={colors.gold} /> : null}

      {data?.status === 'none' ? (
        <Card>
          <Ionicons name="images-outline" size={36} color={colors.gold} style={{ alignSelf: 'center' }} />
          <Text variant="body" style={{ textAlign: 'center' }}>
            {t('visual.intro')}
          </Text>
          {busy ? (
            <View style={{ alignItems: 'center', gap: 6 }}>
              <ActivityIndicator color={colors.gold} />
              <Text variant="small" style={{ textAlign: 'center' }}>
                {t('visual.generating')}
              </Text>
            </View>
          ) : data.can_generate ? (
            <>
              <Button icon="sparkles" title={t('visual.generate')} onPress={generate} />
              {data.remaining !== null ? (
                <Text variant="small" style={{ textAlign: 'center' }}>
                  {t('visual.remaining', { n: data.remaining })}
                </Text>
              ) : null}
            </>
          ) : (
            <>
              <Notice>{t('visual.quota')}</Notice>
              <Button kind="secondary" icon="heart-outline" title={t('pro.learnMore')} onPress={() => router.push('/pro')} />
            </>
          )}
        </Card>
      ) : null}

      {s ? (
        <>
          {s.images.map((id) => (
            <View key={id} style={{ gap: 4 }}>
              <Image
                source={{ uri: `${API_BASE}/visual/images/${id}` }}
                style={{ width: '100%', aspectRatio: 3 / 2, borderRadius: radius.md }}
                contentFit="cover"
                accessibilityLabel={t('visual.aiLabel')}
              />
              <Text variant="small">{t('visual.aiLabel')}</Text>
            </View>
          ))}

          <Card>
            <Text variant="heading">{t('visual.summary')}</Text>
            <Text variant="body">{s.summary}</Text>
            {s.key_verse ? (
              <RNText style={{ color: colors.gold, fontFamily: 'Literata_400Regular', fontStyle: 'italic', fontSize: 16, lineHeight: 24 }}>{s.key_verse}</RNText>
            ) : null}
          </Card>

          <Card>
            <Text variant="heading">{t('visual.mindMap')}</Text>
            {s.mind_map ? (
              <MindMap data={s.mind_map} />
            ) : mapBusy ? (
              <View style={{ alignItems: 'center', gap: 6 }}>
                <ActivityIndicator color={colors.gold} />
                <Text variant="small">{t('visual.mindMapMaking')}</Text>
              </View>
            ) : (
              <>
                <Text variant="small">{t('visual.mindMapIntro')}</Text>
                <Button kind="secondary" icon="git-network-outline" title={t('visual.mindMapMake')} onPress={makeMindMap} />
              </>
            )}
          </Card>

          {s.places.length ? <PlacesMap places={s.places} /> : null}

          {s.timeline.length ? (
            <Card>
              <Text variant="heading">{t('visual.timeline')}</Text>
              {s.timeline.map((item, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ alignItems: 'center' }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.gold, marginTop: 5 }} />
                    {i < s.timeline.length - 1 ? <View style={{ width: 2, flex: 1, backgroundColor: colors.border }} /> : null}
                  </View>
                  <View style={{ flex: 1, paddingBottom: 10 }}>
                    <RNText style={{ color: colors.gold, fontFamily: fonts.bodyBold, fontSize: 13 }}>{item.when}</RNText>
                    <Text variant="body">{item.event}</Text>
                    <Text variant="small">{[item.reference, item.source !== item.reference ? item.source : null].filter(Boolean).join(' · ')}</Text>
                  </View>
                </View>
              ))}
            </Card>
          ) : null}

          {s.characters.length ? (
            <Card>
              <Text variant="heading">{t('visual.characters')}</Text>
              {s.characters.map((c, i) => (
                <View key={i} style={{ gap: 2 }}>
                  <RNText style={{ color: colors.text, fontFamily: fonts.bodyBold }}>{c.name}</RNText>
                  <Text variant="small">
                    {c.role} · {c.reference}
                  </Text>
                </View>
              ))}
            </Card>
          ) : null}

          {s.old_testament_links.length ? (
            <Card>
              <Text variant="heading">{t('visual.otLinks')}</Text>
              {s.old_testament_links.map((l, i) => (
                <View key={i} style={{ gap: 2 }}>
                  <RNText style={{ color: colors.gold, fontFamily: fonts.bodyBold }}>
                    {l.this_reference} ↔ {l.other_reference} · {t(LINK_TYPES[l.type] ?? 'visual.linkParallel')}
                  </RNText>
                  <Text variant="body">{l.explanation}</Text>
                </View>
              ))}
            </Card>
          ) : null}

          {s.jesus_fulfillment.length ? (
            <Card>
              <Text variant="heading">{t('visual.jesus')}</Text>
              {s.jesus_fulfillment.map((j, i) => (
                <View key={i} style={{ gap: 2 }}>
                  <RNText style={{ color: colors.text, fontFamily: 'Literata_400Regular', fontStyle: 'italic' }}>“{j.words}”</RNText>
                  <RNText style={{ color: colors.gold, fontFamily: fonts.bodyBold, fontSize: 13 }}>
                    {j.reference} ↔ {j.prophecy_reference}
                  </RNText>
                  <Text variant="body">{j.explanation}</Text>
                </View>
              ))}
            </Card>
          ) : null}

          {s.historical_context.length ? (
            <Card>
              <Text variant="heading">{t('visual.history')}</Text>
              {s.historical_context.map((h, i) => (
                <View key={i} style={{ gap: 2 }}>
                  <Text variant="body">{h.text}</Text>
                  <Text variant="small">{h.source}</Text>
                </View>
              ))}
            </Card>
          ) : null}

          <Text variant="small">{[t('visual.sourcesNote'), ...s.credits].join(' ')}</Text>
        </>
      ) : null}
    </Screen>
  );
}

/** Lugares do capítulo (coordenadas do OpenBible.info) num mapa de verdade; tocar num lugar abre o mapa da área. */
function PlacesMap({ places }: { places: Place[] }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const [layer, setLayer] = useState<MapLayer>('satellite');
  const [open, setOpen] = useState<Place | null>(null);
  const markers: MapMarker[] = places.map((p) => ({ id: p.id, lat: p.lat, lon: p.lon, label: p.label ?? p.name }));
  const pick = (m: MapMarker) => setOpen(places.find((p) => p.id === m.id) ?? null);
  return (
    <Card>
      <Text variant="heading">{t('visual.map')}</Text>
      <LayerSwitch value={layer} onChange={setLayer} />
      <TileMap markers={markers} height={280} layer={layer} onMarkerPress={pick} />
      <Text variant="small">{t('visual.mapHint')}</Text>
      {places.map((p) => (
        <Pressable
          key={p.id}
          accessibilityRole="button"
          onPress={() => setOpen(p)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
          <Ionicons name="location-outline" size={16} color={colors.gold} />
          <RNText style={{ flex: 1, color: colors.text, fontFamily: fonts.body }}>
            {p.label ?? p.name} · v. {p.verse}
          </RNText>
          <RNText style={{ color: colors.gold, fontFamily: fonts.bodyMedium, fontSize: 13 }}>{t('visual.openMap')}</RNText>
        </Pressable>
      ))}
      {open ? <AreaMap place={open} markers={markers} onClose={() => setOpen(null)} onPick={pick} /> : null}
    </Card>
  );
}

/** Mapa da área de um lugar, em tela cheia: arrastar, aproximar e trocar a camada. */
function AreaMap({
  place,
  markers,
  onClose,
  onPick,
}: {
  place: Place;
  markers: MapMarker[];
  onClose: () => void;
  onPick: (m: MapMarker) => void;
}) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [layer, setLayer] = useState<MapLayer>('satellite');
  const mapHeight = Math.max(280, height - insets.top - insets.bottom - 170);
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 }}>
          <Ionicons name="location" size={22} color={colors.gold} />
          <View style={{ flex: 1 }}>
            <Text variant="heading" numberOfLines={1}>
              {place.label ?? place.name}
            </Text>
            <Text variant="small">v. {place.verse}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={t('bible.close')} onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>
        <View style={{ paddingHorizontal: 16 }}>
          <LayerSwitch value={layer} onChange={setLayer} />
        </View>
        <TileMap
          key={place.id}
          markers={markers}
          height={mapHeight}
          layer={layer}
          draggable
          rounded={false}
          highlight={place.id}
          initial={{ center: { lat: place.lat, lon: place.lon }, zoom: 11 }}
          onMarkerPress={onPick}
        />
        <Pressable
          accessibilityRole="link"
          onPress={() => Linking.openURL(`https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lon}#map=12/${place.lat}/${place.lon}`)}
          style={{ alignSelf: 'center', padding: 6 }}>
          <RNText style={{ color: colors.gold, fontFamily: fonts.bodyMedium }}>{t('visual.fullMap')}</RNText>
        </Pressable>
      </View>
    </Modal>
  );
}

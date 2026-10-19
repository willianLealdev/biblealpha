import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Text as RNText, View } from 'react-native';
import Svg, { Circle, Rect, Text as SvgText } from 'react-native-svg';

import { bookName } from '@/bible/reference';
import { Button, Card, Notice, Screen, Text } from '@/components/ui';
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
  const { book, chapter } = useLocalSearchParams<{ book: string; chapter: string }>();
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const [data, setData] = useState<Response | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Response>(`/visual/${book}/${chapter}`)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.code : 'generic'));
  }, [book, chapter]);

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

  const label = `${bookName(book, locale)} ${chapter}`;
  const errorText = error ? (error === 'visual_quota' ? t('visual.quota') : t('study.errors.generic')) : null;
  const s = data?.study?.content;

  return (
    <Screen>
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

/** Mapa simples dos lugares do capítulo (coordenadas do OpenBible.info), com link para o mapa completo. */
function PlacesMap({ places }: { places: Place[] }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const lons = places.map((p) => p.lon);
  const lats = places.map((p) => p.lat);
  // Margem à direita para os nomes caberem
  const pad = 0.35;
  const minLon = Math.min(...lons) - pad;
  const maxLon = Math.max(...lons) + pad * 3;
  const minLat = Math.min(...lats) - pad;
  const maxLat = Math.max(...lats) + pad;
  const W = 600;
  const H = Math.max(220, Math.min(420, (W * (maxLat - minLat)) / Math.max(0.5, maxLon - minLon)));
  const x = (lon: number) => ((lon - minLon) / (maxLon - minLon)) * W;
  const y = (lat: number) => H - ((lat - minLat) / (maxLat - minLat)) * H;
  return (
    <Card>
      <Text variant="heading">{t('visual.map')}</Text>
      <Svg width="100%" height={H * 0.6} viewBox={`0 0 ${W} ${H}`}>
        <Rect x={0} y={0} width={W} height={H} rx={12} fill={colors.surfaceAlt} />
        {places.map((p) => (
          <Circle key={p.id} cx={x(p.lon)} cy={y(p.lat)} r={10} fill={colors.gold} />
        ))}
        {places.map((p) => (
          <SvgText key={`${p.id}-t`} x={x(p.lon) + 14} y={y(p.lat) + 8} fill={colors.text} fontSize={26} fontWeight="600">
            {p.label ?? p.name}
          </SvgText>
        ))}
      </Svg>
      {places.map((p) => (
        <Pressable
          key={p.id}
          accessibilityRole="link"
          onPress={() => Linking.openURL(`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=11/${p.lat}/${p.lon}`)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="location-outline" size={16} color={colors.gold} />
          <RNText style={{ flex: 1, color: colors.text, fontFamily: fonts.body }}>
            {p.label ?? p.name} · v. {p.verse}
          </RNText>
          <RNText style={{ color: colors.gold, fontFamily: fonts.bodyMedium, fontSize: 13 }}>{t('visual.openMap')}</RNText>
        </Pressable>
      ))}
    </Card>
  );
}

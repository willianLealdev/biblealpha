// Mapa de verdade (imagem de satélite, relevo ou ruas) feito só com imagens de "tiles": funciona no site
// e nos apps sem módulo nativo novo (dá para mandar por atualização automática).

import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import { type GestureResponderEvent, type LayoutChangeEvent, Pressable, Text as RNText, View } from 'react-native';

import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';
import { fonts, radius } from '@/theme/tokens';

export type MapLayer = 'satellite' | 'relief' | 'streets';
export type MapMarker = { id: string; lat: number; lon: number; label: string };

const TILE = 256;
const MIN_ZOOM = 3;
const MAX_ZOOM = 17;

// Esri: sem chave, com atribuição. Mesma fonte para as três camadas.
const LAYERS: Record<MapLayer, string> = {
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  relief: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
  streets: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
};
const ATTRIBUTION = 'Esri, Maxar, Earthstar Geographics';

// Projeção Web Mercator (a mesma dos mapas da internet), em pixels no nível de zoom z
const worldSize = (z: number) => TILE * 2 ** z;
const toPx = (lon: number, z: number) => ((lon + 180) / 360) * worldSize(z);
const toPy = (lat: number, z: number) => {
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * worldSize(z);
};
const toLon = (px: number, z: number) => (px / worldSize(z)) * 360 - 180;
const toLat = (py: number, z: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * py) / worldSize(z)))) * 180) / Math.PI;

/** Zoom e centro que mostram todos os pontos dentro de `w`×`h`, com margem. */
export function fitView(markers: MapMarker[], w: number, h: number, maxZoom = 10) {
  const lats = markers.map((m) => m.lat);
  const lons = markers.map((m) => m.lon);
  const center = { lat: (Math.min(...lats) + Math.max(...lats)) / 2, lon: (Math.min(...lons) + Math.max(...lons)) / 2 };
  let zoom = maxZoom;
  while (zoom > MIN_ZOOM) {
    const spanX = toPx(Math.max(...lons), zoom) - toPx(Math.min(...lons), zoom);
    const spanY = toPy(Math.min(...lats), zoom) - toPy(Math.max(...lats), zoom);
    if (spanX < w * 0.7 && spanY < h * 0.7) break;
    zoom -= 1;
  }
  return { center, zoom };
}

type Props = {
  markers: MapMarker[];
  height: number;
  /** Centro e zoom iniciais; sem eles, enquadra todos os pontos. */
  initial?: { center: { lat: number; lon: number }; zoom: number };
  /** Arrastar com o dedo/mouse. Desligado no mapa dentro da página, para a página continuar rolando. */
  draggable?: boolean;
  layer: MapLayer;
  highlight?: string;
  onMarkerPress?: (m: MapMarker) => void;
  rounded?: boolean;
};

export function TileMap({ markers, height, initial, draggable = false, layer, highlight, onMarkerPress, rounded = true }: Props) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [view, setView] = useState<{ center: { lat: number; lon: number }; zoom: number } | null>(initial ?? null);
  const start = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  function onLayout(e: LayoutChangeEvent) {
    const w = e.nativeEvent.layout.width;
    setWidth(w);
    if (!view && markers.length) setView(fitView(markers, w, height));
  }

  const current = view;
  // Arrastar: guarda onde o dedo começou e o centro do mapa naquele momento
  const responder = draggable
    ? {
        onStartShouldSetResponder: () => true,
        onMoveShouldSetResponder: () => true,
        onResponderTerminationRequest: () => false,
        onResponderGrant: (e: GestureResponderEvent) => {
          if (!current) return;
          start.current = {
            x: e.nativeEvent.pageX,
            y: e.nativeEvent.pageY,
            px: toPx(current.center.lon, current.zoom),
            py: toPy(current.center.lat, current.zoom),
          };
        },
        onResponderMove: (e: GestureResponderEvent) => {
          const s0 = start.current;
          if (!s0 || !current) return;
          const z = current.zoom;
          const py = Math.max(0, Math.min(worldSize(z), s0.py - (e.nativeEvent.pageY - s0.y)));
          setView({ zoom: z, center: { lon: toLon(s0.px - (e.nativeEvent.pageX - s0.x), z), lat: toLat(py, z) } });
        },
        onResponderRelease: () => {
          start.current = null;
        },
      }
    : {};

  function zoomBy(delta: number) {
    if (!current) return;
    setView({ ...current, zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, current.zoom + delta)) });
  }

  let tiles: { key: string; uri: string; left: number; top: number }[] = [];
  let pins: { m: MapMarker; left: number; top: number; showLabel: boolean }[] = [];
  if (current && width) {
    const z = current.zoom;
    const cx = toPx(current.center.lon, z);
    const cy = toPy(current.center.lat, z);
    const left0 = cx - width / 2;
    const top0 = cy - height / 2;
    const n = 2 ** z;
    for (let ty = Math.floor(top0 / TILE); ty <= Math.floor((top0 + height) / TILE); ty++) {
      if (ty < 0 || ty >= n) continue;
      for (let tx = Math.floor(left0 / TILE); tx <= Math.floor((left0 + width) / TILE); tx++) {
        const wrapped = ((tx % n) + n) % n;
        tiles.push({
          key: `${z}-${tx}-${ty}`,
          uri: LAYERS[layer].replace('{z}', String(z)).replace('{x}', String(wrapped)).replace('{y}', String(ty)),
          left: tx * TILE - left0,
          top: ty * TILE - top0,
        });
      }
    }
    // Nomes que encostariam em outro nome ficam escondidos (o ponto continua lá)
    const taken: { x: number; y: number }[] = [];
    pins = markers.map((m) => {
      const left = toPx(m.lon, z) - left0;
      const top = toPy(m.lat, z) - top0;
      const free = taken.every((p) => Math.abs(p.x - left) > 90 || Math.abs(p.y - top) > 22);
      if (free) taken.push({ x: left, y: top });
      return { m, left, top, showLabel: free || m.id === highlight };
    });
  }

  return (
    <View
      onLayout={onLayout}
      {...responder}
      style={{
        height,
        overflow: 'hidden',
        borderRadius: rounded ? radius.md : 0,
        backgroundColor: '#1c2a33',
        cursor: draggable ? 'grab' : undefined,
      } as never}>
      {tiles.map((tl) => (
        <Image
          key={tl.key}
          source={{ uri: tl.uri }}
          style={{ position: 'absolute', left: tl.left, top: tl.top, width: TILE, height: TILE }}
          pointerEvents="none"
          cachePolicy="memory-disk"
          transition={150}
        />
      ))}
      {pins.map(({ m, left, top, showLabel }) => {
        const active = m.id === highlight;
        return (
          <Pressable
            key={m.id}
            accessibilityRole="button"
            accessibilityLabel={m.label}
            onPress={() => onMarkerPress?.(m)}
            hitSlop={10}
            style={{ position: 'absolute', left: left - 9, top: top - 9, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View
              style={{
                width: active ? 22 : 18,
                height: active ? 22 : 18,
                borderRadius: 11,
                backgroundColor: colors.gold,
                borderWidth: 3,
                borderColor: '#fff',
              }}
            />
            {showLabel ? (
              <RNText
                numberOfLines={1}
                style={{
                  color: '#fff',
                  fontFamily: fonts.bodyBold,
                  fontSize: 13,
                  backgroundColor: 'rgba(0,0,0,0.55)',
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: 6,
                  overflow: 'hidden',
                }}>
                {m.label}
              </RNText>
            ) : null}
          </Pressable>
        );
      })}
      <View style={{ position: 'absolute', right: 8, top: 8, gap: 6 }}>
        <MapButton icon="add" onPress={() => zoomBy(1)} />
        <MapButton icon="remove" onPress={() => zoomBy(-1)} />
      </View>
      <RNText
        style={{ position: 'absolute', right: 6, bottom: 4, color: '#fff', fontSize: 9, opacity: 0.8, backgroundColor: 'rgba(0,0,0,0.35)', paddingHorizontal: 4 }}>
        {ATTRIBUTION}
      </RNText>
    </View>
  );
}

function MapButton({ icon, onPress }: { icon: 'add' | 'remove'; onPress: () => void }) {
  const { t } = useI18n();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={icon === 'add' ? t('visual.zoomIn') : t('visual.zoomOut')}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: pressed ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.6)',
        alignItems: 'center',
        justifyContent: 'center',
      })}>
      <Ionicons name={icon} size={20} color="#fff" />
    </Pressable>
  );
}

/** Botões para trocar entre satélite, relevo e ruas. */
export function LayerSwitch({ value, onChange }: { value: MapLayer; onChange: (v: MapLayer) => void }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const items: { v: MapLayer; label: string }[] = [
    { v: 'satellite', label: t('visual.satellite') },
    { v: 'relief', label: t('visual.relief') },
    { v: 'streets', label: t('visual.streets') },
  ];
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {items.map((i) => {
        const active = i.v === value;
        return (
          <Pressable
            key={i.v}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(i.v)}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: active ? colors.gold : colors.border,
              backgroundColor: active ? colors.gold : 'transparent',
            }}>
            <RNText style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color: active ? colors.onGold : colors.text }}>{i.label}</RNText>
          </Pressable>
        );
      })}
    </View>
  );
}

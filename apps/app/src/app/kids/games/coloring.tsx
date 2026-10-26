import { createElement, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

import { readStored, writeStored } from '@/kids/device-store';
import { DRAWINGS, type Drawing, PALETTE, type Region } from '@/kids/drawings';
import { GameEnd, GameShell } from '@/kids/game-ui';
import { useKidsText } from '@/kids/strings';
import { kidsColors, kidsFonts, kidsRadius } from '@/kids/theme';
import { PillButton } from '@/kids/ui';

const WHITE = '#FFFFFF';
const INK = '#2B2140';
const key = (id: string) => `bakids.color.${id}`;

// Cada desenho pintado fica guardado só neste aparelho
const loadFills = (id: string) => readStored<Record<string, string>>(key(id)) ?? {};
const saveFills = (id: string, fills: Record<string, string>) => writeStored(key(id), fills);

const geometry = (region: Region) =>
  region.kind === 'rect'
    ? { x: region.x, y: region.y, width: region.w, height: region.h }
    : region.kind === 'circle'
      ? { cx: region.cx, cy: region.cy, r: region.r }
      : region.kind === 'ellipse'
        ? { cx: region.cx, cy: region.cy, rx: region.rx, ry: region.ry }
        : { d: region.d };

/** No site: SVG do próprio navegador, que recebe o toque (no react-native-svg o toque não chega no navegador). */
function WebPicture({ regions, fills, size, onPaint }: { regions: Region[]; fills: Record<string, string>; size: number; onPaint: (id: string) => void }) {
  return createElement(
    'svg',
    { width: size, height: size, viewBox: '0 0 300 300', style: { display: 'block', touchAction: 'manipulation' } },
    regions.map((r) =>
      createElement(r.kind, {
        key: r.id,
        ...geometry(r),
        fill: fills[r.id] ?? WHITE,
        stroke: INK,
        strokeWidth: 3,
        strokeLinejoin: 'round',
        style: { cursor: 'pointer' },
        onClick: () => onPaint(r.id),
      }),
    ),
  );
}

function Shape({ region, fill, onPress }: { region: Region; fill: string; onPress: () => void }) {
  const common = { fill, stroke: INK, strokeWidth: 3, strokeLinejoin: 'round' as const, onPress };
  switch (region.kind) {
    case 'rect':
      return <Rect x={region.x} y={region.y} width={region.w} height={region.h} {...common} />;
    case 'circle':
      return <Circle cx={region.cx} cy={region.cy} r={region.r} {...common} />;
    case 'ellipse':
      return <Ellipse cx={region.cx} cy={region.cy} rx={region.rx} ry={region.ry} {...common} />;
    default:
      return <Path d={region.d} {...common} />;
  }
}

/** Colorir: escolher a cor e tocar nas partes do desenho. */
export default function Coloring() {
  const { t } = useKidsText();
  const { width } = useWindowDimensions();
  const [drawing, setDrawing] = useState<Drawing | null>(null);
  const [fills, setFills] = useState<Record<string, string>>({});
  const [color, setColor] = useState(PALETTE[0]);
  const [finished, setFinished] = useState(false);
  const size = Math.min(width - 40, 520);

  function open(d: Drawing) {
    setDrawing(d);
    setFills(loadFills(d.id));
    setFinished(false);
  }

  function paint(regionId: string) {
    if (!drawing) return;
    const next = { ...fills, [regionId]: color };
    setFills(next);
    saveFills(drawing.id, next);
  }

  if (!drawing) {
    return (
      <GameShell game="coloring">
        <View style={styles.choices}>
          {DRAWINGS.map((d) => (
            <PillButton key={d.id} label={`${d.emoji} ${t(d.name)}`} color={kidsColors.yellow} onPress={() => open(d)} style={{ flexGrow: 1 }} />
          ))}
        </View>
      </GameShell>
    );
  }

  const picture = (
    <View style={[styles.canvas, { width: size, height: size }]}>
      {Platform.OS === 'web' ? (
        <WebPicture regions={drawing.regions} fills={fills} size={size} onPaint={(id) => !finished && paint(id)} />
      ) : (
        <Svg width={size} height={size} viewBox="0 0 300 300">
          {drawing.regions.map((r) => (
            <Shape key={r.id} region={r} fill={fills[r.id] ?? WHITE} onPress={() => !finished && paint(r.id)} />
          ))}
        </Svg>
      )}
    </View>
  );

  if (finished) {
    return (
      <GameShell game="coloring">
        {picture}
        <GameEnd game="coloring" stars={3} onAgain={() => setDrawing(null)} />
      </GameShell>
    );
  }

  return (
    <GameShell game="coloring">
      <Text style={styles.name}>
        {drawing.emoji} {t(drawing.name)}
      </Text>
      {picture}
      <View style={styles.palette}>
        {PALETTE.map((c) => (
          <Pressable
            key={c}
            accessibilityRole="button"
            accessibilityLabel={c}
            accessibilityState={{ selected: color === c }}
            onPress={() => setColor(c)}
            style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchOn]}
          />
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('color_eraser')}
          onPress={() => setColor(WHITE)}
          style={[styles.swatch, styles.eraser, color === WHITE && styles.swatchOn]}>
          <Text style={{ fontSize: 22 }}>🧽</Text>
        </Pressable>
      </View>
      <View style={styles.row}>
        <PillButton
          label={`🗑️ ${t('color_clear')}`}
          color={kidsColors.pink}
          active={false}
          onPress={() => {
            setFills({});
            saveFills(drawing.id, {});
          }}
          style={{ flex: 1 }}
          textSize={17}
        />
        <PillButton label={`✅ ${t('color_done')}`} color={kidsColors.green} onPress={() => setFinished(true)} style={{ flex: 1 }} textSize={17} />
      </View>
    </GameShell>
  );
}

const styles = StyleSheet.create({
  choices: { gap: 10 },
  name: { fontFamily: kidsFonts.bold, fontSize: 20, color: kidsColors.text, textAlign: 'center' },
  canvas: { alignSelf: 'center', backgroundColor: WHITE, borderRadius: kidsRadius.md, borderWidth: 4, borderColor: kidsColors.yellow, overflow: 'hidden' },
  palette: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  swatch: { width: 46, height: 46, borderRadius: 23, borderWidth: 3, borderColor: kidsColors.card },
  swatchOn: { borderColor: INK, transform: [{ scale: 1.15 }] },
  eraser: { backgroundColor: WHITE, alignItems: 'center', justifyContent: 'center', borderColor: kidsColors.border },
  row: { flexDirection: 'row', gap: 12 },
});

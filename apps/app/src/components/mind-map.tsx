// Mapa mental: tema no centro, ramos (ideias principais) em volta e os pontos de cada ramo na ponta.
// Desenhado em SVG: funciona igual no site e nos apps.

import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text as RNText, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';
import { fonts } from '@/theme/tokens';

export type MindMapData = {
  center: string;
  branches: { label: string; children: { label: string; reference: string }[] }[];
};

const COLORS = ['#E9C46A', '#4FC3F7', '#81C784', '#F06292', '#BA68C8', '#FF8A65'];
const SIZE = 1100;

/** Quebra o texto em linhas curtas para caber nos balões. */
function wrap(text: string, max: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

function Bubble({ x, y, text, color, max, size, bold, fill }: { x: number; y: number; text: string; color: string; max: number; size: number; bold?: boolean; fill: string }) {
  const lines = wrap(text, max);
  const w = Math.max(...lines.map((l) => l.length)) * size * 0.56 + 28;
  const h = lines.length * size * 1.25 + 18;
  return (
    <G>
      <Rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={h / 2 > 26 ? 18 : h / 2} fill={fill} stroke={color} strokeWidth={3} />
      {lines.map((l, i) => (
        <SvgText
          key={i}
          x={x}
          y={y - ((lines.length - 1) * size * 1.25) / 2 + i * size * 1.25 + size * 0.35}
          fill={bold ? color : '#F5F0E6'}
          fontSize={size}
          fontWeight={bold ? '700' : '500'}
          textAnchor="middle">
          {l}
        </SvgText>
      ))}
    </G>
  );
}

function Drawing({ data, width }: { data: MindMapData; width: number }) {
  const { colors } = useTheme();
  const c = SIZE / 2;
  const branches = data.branches.slice(0, 6);
  const n = branches.length || 1;
  return (
    <Svg width={width} height={width} viewBox={`0 0 ${SIZE} ${SIZE}`}>
      <Rect x={0} y={0} width={SIZE} height={SIZE} rx={24} fill={colors.surface} />
      {branches.map((b, i) => {
        const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
        const color = COLORS[i % COLORS.length];
        const bx = c + Math.cos(angle) * 235;
        const by = c + Math.sin(angle) * 235;
        const kids = b.children.slice(0, 4);
        const spread = Math.min(1.1, (Math.PI * 2) / n - 0.1);
        return (
          <G key={i}>
            <Path d={`M ${c} ${c} Q ${c + Math.cos(angle) * 120} ${c + Math.sin(angle) * 140} ${bx} ${by}`} stroke={color} strokeWidth={6} fill="none" />
            {kids.map((k, j) => {
              const a = angle + (kids.length === 1 ? 0 : (j / (kids.length - 1) - 0.5) * spread);
              // Com 3 ou mais pontos, um sim e outro não fica mais longe: os balões não se encostam
              const r = kids.length > 2 ? (j % 2 ? 455 : 370) : 410;
              const kx = c + Math.cos(a) * r;
              const ky = c + Math.sin(a) * r;
              return (
                <G key={j}>
                  <Line x1={bx} y1={by} x2={kx} y2={ky} stroke={color} strokeWidth={3} opacity={0.7} />
                  <Bubble x={kx} y={ky} text={k.label} color={color} max={14} size={18} fill="#1d1a16" />
                </G>
              );
            })}
            <Bubble x={bx} y={by} text={b.label} color={color} max={14} size={24} bold fill="#14110d" />
          </G>
        );
      })}
      <Circle cx={c} cy={c} r={105} fill={colors.gold} />
      {wrap(data.center, 12).map((l, i, all) => (
        <SvgText
          key={i}
          x={c}
          y={c - ((all.length - 1) * 34) / 2 + i * 34 + 11}
          fill={colors.onGold}
          fontSize={29}
          fontWeight="800"
          textAnchor="middle">
          {l}
        </SvgText>
      ))}
    </Svg>
  );
}

/** Mapa mental na página, com botão de tela cheia e a lista dos pontos (com referências) logo abaixo. */
export function MindMap({ data }: { data: MindMapData }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [full, setFull] = useState(false);
  const inline = Math.min(width - 64, 640);
  return (
    <View style={{ gap: 10 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('visual.mindMapFull')} onPress={() => setFull(true)} style={{ alignSelf: 'center' }}>
        <Drawing data={data} width={inline} />
        <View style={{ position: 'absolute', right: 8, top: 8, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 16, padding: 6 }}>
          <Ionicons name="expand" size={18} color="#fff" />
        </View>
      </Pressable>
      {data.branches.map((b, i) => (
        <View key={i} style={{ gap: 2 }}>
          <RNText style={{ color: COLORS[i % COLORS.length], fontFamily: fonts.bodyBold, fontSize: 15 }}>{b.label}</RNText>
          {b.children.map((k, j) => (
            <RNText key={j} style={{ color: colors.text, fontFamily: fonts.body, fontSize: 14 }}>
              • {k.label} <RNText style={{ color: colors.textMuted }}>({k.reference})</RNText>
            </RNText>
          ))}
        </View>
      ))}
      {full ? (
        <Modal visible animationType="fade" onRequestClose={() => setFull(false)}>
          <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top, paddingBottom: insets.bottom }}>
            <Pressable accessibilityRole="button" accessibilityLabel={t('bible.close')} onPress={() => setFull(false)} style={{ alignSelf: 'flex-end', padding: 14 }}>
              <Ionicons name="close" size={28} color={colors.text} />
            </Pressable>
            {/* Maior que a tela: arrastar para os lados e para baixo para ler tudo */}
            <ScrollView horizontal contentContainerStyle={{ alignItems: 'center' }}>
              <ScrollView contentContainerStyle={{ padding: 12 }}>
                <Drawing data={data} width={Math.max(Math.min(width, height) * 1.4, 720)} />
              </ScrollView>
            </ScrollView>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

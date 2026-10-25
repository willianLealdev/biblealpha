// Desenhos para colorir (traço simples, área de 300×300). Cada parte pinta com um toque.

import type { KidsKey } from './strings';

export type Region =
  | { id: string; kind: 'rect'; x: number; y: number; w: number; h: number }
  | { id: string; kind: 'circle'; cx: number; cy: number; r: number }
  | { id: string; kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { id: string; kind: 'path'; d: string };

export type Drawing = { id: string; name: KidsKey; emoji: string; regions: Region[] };

function star(cx: number, cy: number, outer: number, inner: number): string {
  const points = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    return `${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`;
  });
  return `M${points.join(' L')} Z`;
}

const band = (outer: number, inner: number) =>
  `M${150 - outer} 200 A${outer} ${outer} 0 0 1 ${150 + outer} 200 L${150 + inner} 200 A${inner} ${inner} 0 0 0 ${150 - inner} 200 Z`;

export const DRAWINGS: Drawing[] = [
  {
    id: 'sheep',
    name: 'draw_sheep',
    emoji: '🐑',
    regions: [
      { id: 'sky', kind: 'rect', x: 0, y: 0, w: 300, h: 200 },
      { id: 'sun', kind: 'circle', cx: 250, cy: 55, r: 28 },
      { id: 'cloud', kind: 'path', d: 'M40 78 q0 -20 22 -20 q8 -16 28 -10 q16 -8 26 8 q20 0 20 18 q0 16 -18 16 h-62 q-16 0 -16 -12 z' },
      { id: 'grass', kind: 'path', d: 'M0 195 Q75 175 150 190 T300 185 L300 300 L0 300 Z' },
      { id: 'leg1', kind: 'rect', x: 108, y: 195, w: 12, h: 42 },
      { id: 'leg2', kind: 'rect', x: 133, y: 195, w: 12, h: 42 },
      { id: 'leg3', kind: 'rect', x: 173, y: 195, w: 12, h: 42 },
      { id: 'leg4', kind: 'rect', x: 198, y: 195, w: 12, h: 42 },
      {
        id: 'body',
        kind: 'path',
        d: 'M100 205 q-28 -2 -26 -28 q-2 -26 24 -30 q6 -26 34 -24 q16 -18 40 -8 q24 -10 36 12 q26 4 24 30 q2 26 -24 30 q-8 16 -32 12 q-20 12 -40 2 q-22 8 -36 4 z',
      },
      { id: 'head', kind: 'ellipse', cx: 238, cy: 150, rx: 24, ry: 28 },
      { id: 'ear', kind: 'ellipse', cx: 254, cy: 128, rx: 13, ry: 6 },
      { id: 'eye', kind: 'circle', cx: 246, cy: 146, r: 4 },
      { id: 'flower1', kind: 'circle', cx: 50, cy: 255, r: 13 },
      { id: 'flower1c', kind: 'circle', cx: 50, cy: 255, r: 5 },
      { id: 'flower2', kind: 'circle', cx: 92, cy: 275, r: 11 },
      { id: 'flower2c', kind: 'circle', cx: 92, cy: 275, r: 4 },
    ],
  },
  {
    id: 'ark',
    name: 'draw_ark',
    emoji: '🌈',
    regions: [
      { id: 'sky', kind: 'rect', x: 0, y: 0, w: 300, h: 235 },
      { id: 'band1', kind: 'path', d: band(130, 112) },
      { id: 'band2', kind: 'path', d: band(112, 94) },
      { id: 'band3', kind: 'path', d: band(94, 76) },
      { id: 'band4', kind: 'path', d: band(76, 58) },
      { id: 'dove', kind: 'path', d: 'M232 62 q10 -14 24 -6 q-6 3 -8 9 q12 -1 16 7 q-16 5 -27 1 q-9 -3 -5 -11 z' },
      { id: 'sea', kind: 'path', d: 'M0 235 Q37 220 75 235 T150 235 T225 235 T300 235 L300 300 L0 300 Z' },
      { id: 'roof', kind: 'path', d: 'M90 167 L150 137 L210 167 Z' },
      { id: 'cabin', kind: 'rect', x: 100, y: 167, w: 100, h: 40 },
      { id: 'window1', kind: 'rect', x: 115, y: 179, w: 22, h: 16 },
      { id: 'window2', kind: 'rect', x: 163, y: 179, w: 22, h: 16 },
      { id: 'hull', kind: 'path', d: 'M48 207 L252 207 L226 254 L74 254 Z' },
    ],
  },
  {
    id: 'whale',
    name: 'draw_whale',
    emoji: '🐋',
    regions: [
      { id: 'sky', kind: 'rect', x: 0, y: 0, w: 300, h: 140 },
      { id: 'sun', kind: 'circle', cx: 255, cy: 45, r: 25 },
      { id: 'sea', kind: 'rect', x: 0, y: 140, w: 300, h: 160 },
      { id: 'sail', kind: 'path', d: 'M70 60 L70 124 L108 124 Z' },
      { id: 'boat', kind: 'path', d: 'M25 128 L115 128 L100 146 L40 146 Z' },
      { id: 'tail', kind: 'path', d: 'M238 215 L290 175 L286 257 Z' },
      { id: 'fish', kind: 'ellipse', cx: 150, cy: 215, rx: 100, ry: 48 },
      { id: 'belly', kind: 'path', d: 'M72 232 Q150 270 230 230 Q150 252 72 232 Z' },
      { id: 'fin', kind: 'path', d: 'M150 222 q22 30 48 8 q-26 4 -48 -8 z' },
      { id: 'eye', kind: 'circle', cx: 92, cy: 200, r: 9 },
    ],
  },
  {
    id: 'star',
    name: 'draw_star',
    emoji: '⭐',
    regions: [
      { id: 'sky', kind: 'rect', x: 0, y: 0, w: 300, h: 300 },
      { id: 'star', kind: 'path', d: star(150, 62, 32, 13) },
      { id: 'small1', kind: 'path', d: star(45, 45, 10, 4) },
      { id: 'small2', kind: 'path', d: star(95, 95, 8, 3) },
      { id: 'small3', kind: 'path', d: star(250, 100, 10, 4) },
      { id: 'hill', kind: 'path', d: 'M0 235 Q150 185 300 235 L300 300 L0 300 Z' },
      { id: 'roof', kind: 'path', d: 'M75 170 L150 125 L225 170 Z' },
      { id: 'wall', kind: 'rect', x: 90, y: 170, w: 120, h: 78 },
      { id: 'door', kind: 'rect', x: 128, y: 198, w: 44, h: 50 },
      { id: 'manger', kind: 'path', d: 'M112 262 L188 262 L176 282 L124 282 Z' },
    ],
  },
];

export const PALETTE = [
  '#E53935', '#FF8A3D', '#FFC233', '#2FBF84', '#1B8A5A', '#3D9BFF',
  '#1A4FB5', '#9B6BFF', '#FF5FA2', '#8D5A3B', '#F5D6B8', '#2B2140',
];

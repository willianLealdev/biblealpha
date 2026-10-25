// Lugares do Mundo Bíblico. Posições em % do mapa ilustrativo (sem escala, só para a criança
// ter uma ideia de onde ficam), com o jogo ligado a cada lugar.

import type { KidsKey } from './strings';

export type Place = { id: string; emoji: string; x: number; y: number; game: string };

export const PLACES: Place[] = [
  { id: 'rome', emoji: '🏛️', x: 6, y: 18, game: 'paul' },
  { id: 'nineveh', emoji: '🏙️', x: 80, y: 14, game: 'jonah' },
  { id: 'babylon', emoji: '🦁', x: 86, y: 38, game: 'daniel' },
  { id: 'ur', emoji: '⛺', x: 92, y: 58, game: 'timemachine' },
  { id: 'galilee', emoji: '🎣', x: 58, y: 24, game: 'whoami' },
  { id: 'nazareth', emoji: '🏡', x: 46, y: 30, game: 'detective' },
  { id: 'jericho', emoji: '🎺', x: 63, y: 43, game: 'jericho' },
  { id: 'jerusalem', emoji: '🧱', x: 51, y: 43, game: 'nehemiah' },
  { id: 'bethlehem', emoji: '⭐', x: 48, y: 56, game: 'maze' },
  { id: 'egypt', emoji: '🌾', x: 24, y: 64, game: 'joseph' },
  { id: 'redsea', emoji: '🌊', x: 37, y: 76, game: 'redsea' },
  { id: 'sinai', emoji: '⛰️', x: 53, y: 86, game: 'commandments' },
];

export const placeName = (id: string) => `wp_${id}` as KidsKey;
export const placeFact = (id: string) => `wp_${id}_f` as KidsKey;
export const placeRef = (id: string) => `wp_${id}_r` as KidsKey;

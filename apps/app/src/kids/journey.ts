// Jornada Bíblica: os jogos, o nível da criança e as conquistas. Tudo calculado do progresso
// guardado no aparelho (sem conta, sem compras, sem comparar crianças).

import type { Href } from 'expo-router';

import { HEROES } from './heroes';
import type { KidsKey } from './strings';
import { kidsColors } from './theme';

export type GameInfo = {
  id: string;
  emoji: string;
  route: Href;
  category: 'adventure' | 'challenge' | 'discovery' | 'creativity' | 'memory' | 'words' | 'reasoning' | 'choices' | 'music' | 'strategy' | 'building' | 'map';
  section: 'adventure' | 'reasoning' | 'creativity' | 'older';
  ages: [number, number];
  color: string;
};

const C = kidsColors;
const game = (
  id: string,
  emoji: string,
  category: GameInfo['category'],
  section: GameInfo['section'],
  ages: [number, number],
  color: string,
  route?: Href,
): GameInfo => ({ id, emoji, category, section, ages, color, route: route ?? (`/kids/games/${id}` as Href) });

// Seções da tela Jogos. Dentro de cada uma, mais ou menos na ordem da Bíblia
export const GAMES: GameInfo[] = [
  game('creation', '🌍', 'discovery', 'adventure', [3, 8], C.green),
  game('ark', '🚢', 'adventure', 'adventure', [3, 7], C.blue),
  game('joseph', '🌾', 'strategy', 'adventure', [7, 12], C.yellow),
  game('redsea', '🌊', 'adventure', 'adventure', [5, 10], C.blue),
  game('jericho', '🎺', 'adventure', 'adventure', [4, 10], C.orange),
  game('david', '🎯', 'challenge', 'adventure', [5, 12], C.orange),
  game('daniel', '🦁', 'adventure', 'adventure', [5, 10], C.yellow),
  game('jonah', '🐋', 'adventure', 'adventure', [5, 10], C.blue),
  game('nehemiah', '🧱', 'building', 'adventure', [6, 12], C.orange),
  game('paul', '⛵', 'map', 'adventure', [7, 12], C.purple),
  game('sheep', '🐑', 'discovery', 'reasoning', [3, 7], C.green),
  game('maze', '🌀', 'reasoning', 'reasoning', [4, 12], C.purple),
  game('differences', '👀', 'reasoning', 'reasoning', [4, 12], C.pink),
  game('puzzle', '🧩', 'reasoning', 'reasoning', [4, 12], C.pink),
  game('treasure', '💎', 'reasoning', 'reasoning', [6, 12], C.yellow),
  game('wordsearch', '🔎', 'words', 'reasoning', [6, 12], C.purple),
  game('versebuilder', '🧱', 'words', 'reasoning', [6, 12], C.orange),
  game('memory', '🃏', 'memory', 'reasoning', [3, 12], C.blue, '/kids/memory'),
  game('wwjd', '💛', 'choices', 'creativity', [5, 12], C.yellow),
  game('coloring', '🖍️', 'creativity', 'creativity', [3, 10], C.pink),
  game('garden', '🌷', 'creativity', 'creativity', [3, 10], C.green),
  game('city', '🏘️', 'building', 'creativity', [5, 12], C.orange),
  game('missions', '🙌', 'choices', 'creativity', [4, 12], C.blue),
  game('worship', '🎵', 'music', 'creativity', [3, 12], C.purple),
  game('detective', '🕵️', 'reasoning', 'older', [8, 12], C.purple),
  game('heroes', '🏅', 'memory', 'older', [5, 12], C.yellow),
  game('show', '🎤', 'challenge', 'older', [7, 12], C.pink),
  game('timemachine', '⏳', 'reasoning', 'older', [7, 12], C.blue),
  game('fruits', '🍇', 'choices', 'older', [6, 12], C.green),
  game('commandments', '📜', 'challenge', 'older', [7, 12], C.purple),
  game('whoami', '🤔', 'challenge', 'older', [6, 12], C.pink),
];

export const SECTIONS: GameInfo['section'][] = ['adventure', 'reasoning', 'creativity', 'older'];
export const sectionKey = (s: GameInfo['section']) => `sec_${s}` as KidsKey;

export const gameName = (id: string) => `g_${id}_name` as KidsKey;
export const gameDesc = (id: string) => `g_${id}_desc` as KidsKey;
export const gameLesson = (id: string) => `g_${id}_lesson` as KidsKey;
export const gameRef = (id: string) => `g_${id}_ref` as KidsKey;
export const categoryKey = (c: GameInfo['category']) => `cat_${c}` as KidsKey;

/** A cada 100 pontos sobe um nível. */
export const XP_PER_LEVEL = 100;

export function levelOf(xp: number) {
  return { level: Math.floor(xp / XP_PER_LEVEL) + 1, inLevel: xp % XP_PER_LEVEL, next: XP_PER_LEVEL };
}

type ProgressLike = { xp: number; stars: number; seen: string[]; played: Record<string, number> };

export const BADGES: { id: string; emoji: string; label: KidsKey; done: (p: ProgressLike) => boolean }[] = [
  { id: 'first', emoji: '🎈', label: 'badge_first', done: (p) => Object.keys(p.played).length >= 1 },
  { id: 'explorer', emoji: '🧭', label: 'badge_explorer', done: (p) => Object.keys(p.played).length >= 5 },
  { id: 'reader', emoji: '📖', label: 'badge_reader', done: (p) => p.seen.length >= 5 },
  { id: 'stars', emoji: '🌟', label: 'badge_stars', done: (p) => p.stars >= 30 },
  { id: 'level5', emoji: '🏆', label: 'badge_level5', done: (p) => levelOf(p.xp).level >= 5 },
  { id: 'all', emoji: '👑', label: 'badge_all', done: (p) => GAMES.every((g) => g.id === 'heroes' || (p.played[g.id] ?? 0) > 0) },
  { id: 'heroes', emoji: '🏅', label: 'badge_heroes', done: (p) => HEROES.every((h) => (p.played[h.game] ?? 0) > 0) },
];

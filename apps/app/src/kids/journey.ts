// Jornada Bíblica: os jogos, o nível da criança e as conquistas. Tudo calculado do progresso
// guardado no aparelho (sem conta, sem compras, sem comparar crianças).

import type { Href } from 'expo-router';

import type { KidsKey } from './strings';
import { kidsColors } from './theme';

export type GameInfo = {
  id: string;
  emoji: string;
  route: Href;
  category: 'adventure' | 'challenge' | 'discovery' | 'creativity' | 'memory' | 'words';
  ages: [number, number];
  color: string;
};

// Ordem da Jornada: do Antigo ao Novo Testamento, depois os de palavras e criatividade
export const GAMES: GameInfo[] = [
  { id: 'creation', emoji: '🌍', route: '/kids/games/creation', category: 'discovery', ages: [3, 8], color: kidsColors.green },
  { id: 'ark', emoji: '🚢', route: '/kids/games/ark', category: 'adventure', ages: [3, 7], color: kidsColors.blue },
  { id: 'commandments', emoji: '📜', route: '/kids/games/commandments', category: 'challenge', ages: [7, 12], color: kidsColors.purple },
  { id: 'david', emoji: '🎯', route: '/kids/games/david', category: 'challenge', ages: [5, 12], color: kidsColors.orange },
  { id: 'daniel', emoji: '🦁', route: '/kids/games/daniel', category: 'adventure', ages: [5, 10], color: kidsColors.yellow },
  { id: 'jonah', emoji: '🐋', route: '/kids/games/jonah', category: 'adventure', ages: [5, 10], color: kidsColors.blue },
  { id: 'sheep', emoji: '🐑', route: '/kids/games/sheep', category: 'discovery', ages: [3, 7], color: kidsColors.green },
  { id: 'whoami', emoji: '🤔', route: '/kids/games/whoami', category: 'challenge', ages: [6, 12], color: kidsColors.pink },
  { id: 'versebuilder', emoji: '🧱', route: '/kids/games/versebuilder', category: 'words', ages: [6, 12], color: kidsColors.orange },
  { id: 'wordsearch', emoji: '🔎', route: '/kids/games/wordsearch', category: 'words', ages: [6, 12], color: kidsColors.purple },
  { id: 'puzzle', emoji: '🧩', route: '/kids/games/puzzle', category: 'discovery', ages: [4, 12], color: kidsColors.pink },
  { id: 'coloring', emoji: '🖍️', route: '/kids/games/coloring', category: 'creativity', ages: [3, 10], color: kidsColors.yellow },
  { id: 'memory', emoji: '🃏', route: '/kids/memory', category: 'memory', ages: [3, 12], color: kidsColors.blue },
];

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
  { id: 'all', emoji: '👑', label: 'badge_all', done: (p) => GAMES.every((g) => (p.played[g.id] ?? 0) > 0) },
];

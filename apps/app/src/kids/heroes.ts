// Cartas dos Heróis da Fé: cada carta se ganha jogando o jogo da história daquele herói.

import type { KidsKey } from './strings';

export type Hero = { id: string; emoji: string; game: string };

export const HEROES: Hero[] = [
  { id: 'noah', emoji: '🚢', game: 'ark' },
  { id: 'abraham', emoji: '⭐', game: 'timemachine' },
  { id: 'joseph', emoji: '🌾', game: 'joseph' },
  { id: 'moses', emoji: '🌊', game: 'redsea' },
  { id: 'joshua', emoji: '🎺', game: 'jericho' },
  { id: 'ruth', emoji: '🌾', game: 'whoami' },
  { id: 'david', emoji: '🎯', game: 'david' },
  { id: 'esther', emoji: '👑', game: 'show' },
  { id: 'daniel', emoji: '🦁', game: 'daniel' },
  { id: 'nehemiah', emoji: '🧱', game: 'nehemiah' },
  { id: 'jonah', emoji: '🐋', game: 'jonah' },
  { id: 'mary', emoji: '💙', game: 'detective' },
  { id: 'peter', emoji: '🎣', game: 'wwjd' },
  { id: 'paul', emoji: '⛵', game: 'paul' },
];

export const heroName = (id: string) => `who_${id}_name` as KidsKey;
export const heroQuality = (id: string) => `hero_${id}_q` as KidsKey;
export const heroStory = (id: string) => `hero_${id}_s` as KidsKey;
export const heroRef = (id: string) => `hero_${id}_r` as KidsKey;

export const unlockedHeroes = (played: Record<string, number>) => HEROES.filter((h) => (played[h.game] ?? 0) > 0);

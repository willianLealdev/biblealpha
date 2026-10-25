// Cartas do jogo da memória: coisas e animais das histórias bíblicas (com a passagem de onde vêm).
// Quando as ilustrações dos personagens existirem (Etapa 2), as cartas podem usar os desenhos.

// O nome de cada carta está nos textos do Kids (chave card_<id>), traduzido como o resto.
export type MemoryCard = { id: string; emoji: string; reference: string };

export const MEMORY_CARDS: MemoryCard[] = [
  { id: 'ark', emoji: '🚢', reference: 'Gn 6:14' },
  { id: 'dove', emoji: '🕊️', reference: 'Gn 8:11' },
  { id: 'rainbow', emoji: '🌈', reference: 'Gn 9:13' },
  { id: 'lion', emoji: '🦁', reference: 'Dn 6:22' },
  { id: 'whale', emoji: '🐋', reference: 'Jn 1:17' },
  { id: 'sheep', emoji: '🐑', reference: 'Lc 15:4' },
  { id: 'star', emoji: '⭐', reference: 'Mt 2:10' },
  { id: 'bread', emoji: '🍞', reference: 'Jo 6:9' },
  { id: 'fish', emoji: '🐟', reference: 'Jo 6:9' },
  { id: 'crown', emoji: '👑', reference: '2 Sm 5:3' },
  // Só emojis antigos (que todo celular desenha): o da pedra, por exemplo, vira um quadrado em aparelhos mais velhos
  { id: 'camel', emoji: '🐪', reference: 'Gn 24:10' },
  { id: 'sea', emoji: '🌊', reference: 'Êx 14:21' },
  { id: 'tree', emoji: '🌳', reference: 'Gn 2:9' },
  { id: 'fire', emoji: '🔥', reference: 'At 2:3' },
  { id: 'harp', emoji: '🎵', reference: '1 Sm 16:23' },
  { id: 'tablet', emoji: '📜', reference: 'Êx 20' },
];

/** Embaralha (Fisher-Yates) sem mexer na lista original. */
export function shuffle<T>(list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

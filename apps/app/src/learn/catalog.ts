// Página Aprender (estilo Netflix): grupos de livros e uma frase curta de cada livro, nos 3 idiomas.

type Tr = { pt: string; en: string; es: string };

export type BookGroup = { id: string; title: Tr; colors: [string, string]; books: string[] };

export const BOOK_GROUPS: BookGroup[] = [
  { id: 'law', title: { pt: 'Pentateuco', en: 'The Law', es: 'Pentateuco' }, colors: ['#2b1606', '#8a4b12'], books: ['GEN', 'EXO', 'LEV', 'NUM', 'DEU'] },
  {
    id: 'history',
    title: { pt: 'Históricos', en: 'History', es: 'Históricos' },
    colors: ['#1d1208', '#6b3a1a'],
    books: ['JOS', 'JDG', 'RUT', '1SA', '2SA', '1KI', '2KI', '1CH', '2CH', 'EZR', 'NEH', 'EST'],
  },
  { id: 'poetry', title: { pt: 'Poéticos', en: 'Poetry and Wisdom', es: 'Poéticos' }, colors: ['#1b0f22', '#5b2a6e'], books: ['JOB', 'PSA', 'PRO', 'ECC', 'SNG'] },
  {
    id: 'major',
    title: { pt: 'Profetas Maiores', en: 'Major Prophets', es: 'Profetas Mayores' },
    colors: ['#200808', '#7a1d12'],
    books: ['ISA', 'JER', 'LAM', 'EZK', 'DAN'],
  },
  {
    id: 'minor',
    title: { pt: 'Profetas Menores', en: 'Minor Prophets', es: 'Profetas Menores' },
    colors: ['#0f1a1f', '#2d5160'],
    books: ['HOS', 'JOL', 'AMO', 'OBA', 'JON', 'MIC', 'NAM', 'HAB', 'ZEP', 'HAG', 'ZEC', 'MAL'],
  },
  { id: 'gospels', title: { pt: 'Evangelhos', en: 'Gospels', es: 'Evangelios' }, colors: ['#221a06', '#9a7a1c'], books: ['MAT', 'MRK', 'LUK', 'JHN'] },
  {
    id: 'paul',
    title: { pt: 'Atos e Cartas de Paulo', en: 'Acts and Letters of Paul', es: 'Hechos y Cartas de Pablo' },
    colors: ['#0b1626', '#1f4a7a'],
    books: ['ACT', 'ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHP', 'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM'],
  },
  {
    id: 'general',
    title: { pt: 'Cartas Gerais e Apocalipse', en: 'General Letters and Revelation', es: 'Cartas Generales y Apocalipsis' },
    colors: ['#14100a', '#5c4a1e'],
    books: ['HEB', 'JAS', '1PE', '2PE', '1JN', '2JN', '3JN', 'JUD', 'REV'],
  },
];

export const TAGLINES: Record<string, Tr> = {
  GEN: { pt: 'O início de tudo', en: 'The beginning of everything', es: 'El inicio de todo' },
  EXO: { pt: 'A saída', en: 'The way out', es: 'La salida' },
  LEV: { pt: 'Sede santos', en: 'Be holy', es: 'Sed santos' },
  NUM: { pt: 'A jornada no deserto', en: 'The desert journey', es: 'El viaje por el desierto' },
  DEU: { pt: 'Lembra-te do Senhor', en: 'Remember the Lord', es: 'Acuérdate del Señor' },
  JOS: { pt: 'Conquista da terra', en: 'Taking the land', es: 'Conquista de la tierra' },
  JDG: { pt: 'Libertadores de Israel', en: 'Deliverers of Israel', es: 'Libertadores de Israel' },
  RUT: { pt: 'Lealdade e redenção', en: 'Loyalty and redemption', es: 'Lealtad y redención' },
  '1SA': { pt: 'O rei segundo o coração', en: 'A king after God’s heart', es: 'El rey conforme al corazón' },
  '2SA': { pt: 'O reino de Davi', en: 'The reign of David', es: 'El reino de David' },
  '1KI': { pt: 'A sucessão ao trono', en: 'The throne passes on', es: 'La sucesión al trono' },
  '2KI': { pt: 'Profetas e reis', en: 'Prophets and kings', es: 'Profetas y reyes' },
  '1CH': { pt: 'A linhagem de Davi', en: 'The line of David', es: 'El linaje de David' },
  '2CH': { pt: 'O templo e a glória', en: 'The temple and the glory', es: 'El templo y la gloria' },
  EZR: { pt: 'A volta do exílio', en: 'Return from exile', es: 'El regreso del exilio' },
  NEH: { pt: 'Reconstruindo os muros', en: 'Rebuilding the walls', es: 'Reconstruyendo los muros' },
  EST: { pt: 'Para um momento como este', en: 'For such a time as this', es: 'Para un momento como este' },
  JOB: { pt: 'Fé na tempestade', en: 'Faith in the storm', es: 'Fe en la tormenta' },
  PSA: { pt: 'Cânticos da alma', en: 'Songs of the soul', es: 'Cánticos del alma' },
  PRO: { pt: 'A sabedoria da vida', en: 'Wisdom for life', es: 'La sabiduría de la vida' },
  ECC: { pt: 'Tudo tem seu tempo', en: 'A time for everything', es: 'Todo tiene su tiempo' },
  SNG: { pt: 'O amor que espera', en: 'Love that waits', es: 'El amor que espera' },
  ISA: { pt: 'O Messias prometido', en: 'The promised Messiah', es: 'El Mesías prometido' },
  JER: { pt: 'O profeta das lágrimas', en: 'The weeping prophet', es: 'El profeta de las lágrimas' },
  LAM: { pt: 'Novas a cada manhã', en: 'New every morning', es: 'Nuevas cada mañana' },
  EZK: { pt: 'O cenário desafiador', en: 'Dry bones live', es: 'Huesos secos que viven' },
  DAN: { pt: 'Fiel na Babilônia', en: 'Faithful in Babylon', es: 'Fiel en Babilonia' },
  HOS: { pt: 'Amor que não desiste', en: 'Love that never quits', es: 'Amor que no se rinde' },
  JOL: { pt: 'Derramarei o meu Espírito', en: 'I will pour out my Spirit', es: 'Derramaré mi Espíritu' },
  AMO: { pt: 'Corra o juízo como as águas', en: 'Let justice roll', es: 'Corra el juicio como las aguas' },
  OBA: { pt: 'O orgulho cai', en: 'Pride falls', es: 'El orgullo cae' },
  JON: { pt: 'Fugindo de Deus', en: 'Running from God', es: 'Huyendo de Dios' },
  MIC: { pt: 'Belém, a pequena', en: 'Little Bethlehem', es: 'Belén, la pequeña' },
  NAM: { pt: 'O Senhor é bom', en: 'The Lord is good', es: 'El Señor es bueno' },
  HAB: { pt: 'O justo viverá pela fé', en: 'The just shall live by faith', es: 'El justo vivirá por la fe' },
  ZEP: { pt: 'O grande dia', en: 'The great day', es: 'El gran día' },
  HAG: { pt: 'Reconstruí a casa', en: 'Build the house', es: 'Reconstruid la casa' },
  ZEC: { pt: 'Eis o teu Rei', en: 'Behold your King', es: 'He aquí tu Rey' },
  MAL: { pt: 'O sol da justiça', en: 'The sun of righteousness', es: 'El sol de justicia' },
  MAT: { pt: 'O Rei prometido', en: 'The promised King', es: 'El Rey prometido' },
  MRK: { pt: 'O Servo em ação', en: 'The Servant in action', es: 'El Siervo en acción' },
  LUK: { pt: 'O Salvador de todos', en: 'Savior of all', es: 'El Salvador de todos' },
  JHN: { pt: 'Para que creiais', en: 'That you may believe', es: 'Para que creáis' },
  ACT: { pt: 'O fogo do Espírito', en: 'Fire of the Spirit', es: 'El fuego del Espíritu' },
  ROM: { pt: 'Justificados pela fé', en: 'Justified by faith', es: 'Justificados por la fe' },
  '1CO': { pt: 'A igreja e os dons', en: 'The church and its gifts', es: 'La iglesia y los dones' },
  '2CO': { pt: 'Força na fraqueza', en: 'Strength in weakness', es: 'Fuerza en la debilidad' },
  GAL: { pt: 'Livres em Cristo', en: 'Free in Christ', es: 'Libres en Cristo' },
  EPH: { pt: 'A armadura de Deus', en: 'The armor of God', es: 'La armadura de Dios' },
  PHP: { pt: 'Alegria em tudo', en: 'Joy in everything', es: 'Gozo en todo' },
  COL: { pt: 'Cristo acima de tudo', en: 'Christ above all', es: 'Cristo sobre todo' },
  '1TH': { pt: 'Ele voltará', en: 'He is coming back', es: 'Él volverá' },
  '2TH': { pt: 'Firmes até o fim', en: 'Firm to the end', es: 'Firmes hasta el fin' },
  '1TI': { pt: 'Conselhos ao pastor', en: 'Counsel to a pastor', es: 'Consejos al pastor' },
  '2TI': { pt: 'Combati o bom combate', en: 'I have fought the good fight', es: 'He peleado la buena batalla' },
  TIT: { pt: 'A sã doutrina', en: 'Sound teaching', es: 'La sana doctrina' },
  PHM: { pt: 'O perdão que restaura', en: 'Forgiveness that restores', es: 'El perdón que restaura' },
  HEB: { pt: 'Cristo, o melhor caminho', en: 'Christ, the better way', es: 'Cristo, el mejor camino' },
  JAS: { pt: 'Fé que age', en: 'Faith that works', es: 'Fe que actúa' },
  '1PE': { pt: 'Esperança na prova', en: 'Hope in trials', es: 'Esperanza en la prueba' },
  '2PE': { pt: 'Cresça na graça', en: 'Grow in grace', es: 'Crece en la gracia' },
  '1JN': { pt: 'Deus é amor', en: 'God is love', es: 'Dios es amor' },
  '2JN': { pt: 'Andar na verdade', en: 'Walk in truth', es: 'Andar en la verdad' },
  '3JN': { pt: 'Acolher os irmãos', en: 'Welcome the brethren', es: 'Acoger a los hermanos' },
  JUD: { pt: 'Batalhai pela fé', en: 'Contend for the faith', es: 'Contended por la fe' },
  REV: { pt: 'As últimas coisas', en: 'The last things', es: 'Las últimas cosas' },
};

export function tr(t: Tr, locale: string): string {
  return locale.startsWith('en') ? t.en : locale.startsWith('es') ? t.es : t.pt;
}

const PALETTE: [string, string][] = [
  ['#2b1606', '#8a4b12'],
  ['#0f1a1f', '#2d5160'],
  ['#1b0f22', '#5b2a6e'],
  ['#200808', '#7a1d12'],
  ['#0b1626', '#1f4a7a'],
  ['#0b2016', '#1e6b52'],
  ['#221a06', '#9a7a1c'],
  ['#1d0b14', '#7a1f4e'],
];

/** Degradê de um pôster sem capa: muda de um item para o outro, sempre o mesmo para o mesmo item. */
export function posterColors(key: string): [string, string] {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// Textos fixos do BibleAlpha Kids (português primeiro; inglês e espanhol já com a mesma estrutura).

import { getLocales } from 'expo-localization';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { kidsFetch, kidsPost } from './api';
import { GAME_EN, GAME_ES, GAME_PT } from './game-content';
import { GAME2_EN, GAME2_ES, GAME2_PT } from './game-content-2';
import { useChosenLanguage } from './progress';

/** Qualquer idioma do BibleAlpha (pt-BR, en e es vêm prontos; os outros a DeepSeek traduz). */
export type KidsLanguage = string;
type Builtin = 'pt-BR' | 'en' | 'es';

const pt = {
  ...GAME_PT,
  ...GAME2_PT,
  appName: 'BibleAlpha Kids',
  hello: 'Olá! Vamos aprender a Palavra de Deus?',
  hello2: 'Deus ama você!',
  hello3: 'Escolha uma atividade!',
  soon: 'Em breve!',
  small: 'Pequenos',
  big: 'Grandes',
  stories: 'Histórias',
  games: 'Jogos',
  quiz: 'Quiz',
  verse: 'Versículo',
  bible: 'Bíblia',
  videos: 'Vídeos',
  parents: 'Área dos pais',
  back: 'Voltar',
  storiesTitle: 'Histórias da Bíblia',
  noStories: 'Novas histórias estão chegando!',
  pages: '{n} páginas',
  seen: 'Já vi',
  loadError: 'Não deu para carregar agora. Tente de novo.',
  tryAgain: 'Tentar de novo',
  previous: 'Voltar página',
  next: 'Próxima página',
  pageOf: 'Página {n} de {total}',
  theEnd: 'Você terminou a história!',
  lesson: 'O que aprendemos',
  talk: 'Para conversar em família',
  inTheBible: 'Esta história está na Bíblia em {reference}.',
  readAgain: 'Ler de novo',
  moreStories: 'Mais histórias',
  gateTitle: 'Só para adultos',
  gateQuestion: 'Quanto é {a} × {b}?',
  gateHint: 'Digite a resposta para entrar.',
  gateWrong: 'Resposta errada. Tente outra conta.',
  enter: 'Entrar',
  parentsTitle: 'Para pais e responsáveis',
  parentsIntro:
    'O BibleAlpha Kids ensina a Palavra de Deus às crianças com histórias, jogos e versículos, num lugar seguro.',
  rule1: 'Sem anúncios, sem compras e sem links para fora.',
  rule2: 'A criança não cria conta e não conversa com inteligência artificial.',
  rule3: 'Todo conteúdo é revisado por um adulto antes de aparecer.',
  rule4: 'Cada história mostra a passagem da Bíblia de onde veio, para você conferir.',
  rule5: 'O progresso (histórias vistas, nível) fica só neste aparelho. Não coletamos dados da criança.',
  resetProgress: 'Apagar o progresso deste aparelho',
  resetDone: 'Progresso apagado.',
  contact: 'Dúvidas: contato@biblealpha.com',
  listen: '🔊 Ouvir',
  stopListen: '⏹️ Parar',
  doQuiz: '❓ Fazer o quiz',
  quizTitle: 'Quiz da Bíblia',
  quizPick: 'Escolha uma história:',
  noQuiz: 'Os quizzes estão chegando!',
  questions: '{n} perguntas',
  questionOf: 'Pergunta {n} de {total}',
  right: 'Muito bem! 🎉',
  wrong: 'Quase! Tente de novo. 💪',
  nextQuestion: 'Próxima ▶',
  quizDone: 'Você acertou {n} de {total}!',
  playAgain: '🔁 Jogar de novo',
  memoryTitle: 'Jogo da memória',
  memoryPick: 'Quantas cartas?',
  easy: 'Fácil',
  medium: 'Médio',
  hard: 'Difícil',
  memoryWin: 'Você achou todos os pares!',
  moves: '{n} jogadas',
  pairFound: 'Achou: {name}!',
  versesTitle: 'Versículos',
  noVerses: 'Os versículos estão chegando!',
  verseOfDay: '⭐ Versículo do dia',
  fillGame: '🧠 Completar as palavras',
  fillHint: 'Toque na palavra que falta:',
  fillDone: 'Você completou o versículo! 🎉',
  otherVerse: 'Outro versículo',
  allVerses: 'Todos os versículos',
  bibleTitle: 'Bíblia',
  oldTestament: 'Antigo Testamento',
  newTestament: 'Novo Testamento',
  chapter: 'Capítulo {n}',
  chooseChapter: 'Escolha o capítulo:',
  nextChapter: 'Próximo ▶',
  prevChapter: '◀ Anterior',
  translation: 'Tradução:',
  languageLabel: 'Idioma do Kids:',
  deviceLanguage: 'Do aparelho',
  preparingLanguage: 'Estou preparando tudo no seu idioma… volte em um minutinho! ⏳',
  searchLanguage: 'Procurar idioma',
  card_ark: 'Arca de Noé',
  card_dove: 'Pomba',
  card_rainbow: 'Arco-íris',
  card_lion: 'Leão',
  card_whale: 'Grande peixe',
  card_sheep: 'Ovelha',
  card_star: 'Estrela',
  card_bread: 'Pão',
  card_fish: 'Peixinho',
  card_crown: 'Coroa do rei',
  card_camel: 'Camelo',
  card_sea: 'Mar Vermelho',
  card_tree: 'Árvore',
  card_fire: 'Línguas de fogo',
  card_harp: 'Harpa de Davi',
  card_tablet: 'Os Dez Mandamentos',
  chooseLanguage: 'Escolha o idioma',
  otherLanguages: 'Outros idiomas (traduzidos automaticamente):',
  videosTitle: 'Vídeos da Bíblia',
  noVideos: 'Os vídeos estão chegando!',
  videosWebOnly: 'Por enquanto os vídeos tocam no site biblealpha.com/kids.',
};

type Dict = typeof pt;

const en: Dict = {
  ...GAME_EN,
  ...GAME2_EN,
  appName: 'BibleAlpha Kids',
  hello: "Hi! Let's learn God's Word?",
  hello2: 'God loves you!',
  hello3: 'Pick an activity!',
  soon: 'Coming soon!',
  small: 'Little ones',
  big: 'Big kids',
  stories: 'Stories',
  games: 'Games',
  quiz: 'Quiz',
  verse: 'Verse',
  bible: 'Bible',
  videos: 'Videos',
  parents: 'Parents',
  back: 'Back',
  storiesTitle: 'Bible stories',
  noStories: 'New stories are on the way!',
  pages: '{n} pages',
  seen: 'Seen',
  loadError: "Couldn't load right now. Try again.",
  tryAgain: 'Try again',
  previous: 'Previous page',
  next: 'Next page',
  pageOf: 'Page {n} of {total}',
  theEnd: 'You finished the story!',
  lesson: 'What we learned',
  talk: 'Talk about it as a family',
  inTheBible: 'This story is in the Bible in {reference}.',
  readAgain: 'Read again',
  moreStories: 'More stories',
  gateTitle: 'Grown-ups only',
  gateQuestion: 'What is {a} × {b}?',
  gateHint: 'Type the answer to enter.',
  gateWrong: 'Wrong answer. Try another one.',
  enter: 'Enter',
  parentsTitle: 'For parents and guardians',
  parentsIntro: "BibleAlpha Kids teaches children God's Word with stories, games and verses, in a safe place.",
  rule1: 'No ads, no purchases and no outside links.',
  rule2: 'Children do not create accounts and do not chat with artificial intelligence.',
  rule3: 'All content is reviewed by an adult before it appears.',
  rule4: 'Each story shows the Bible passage it comes from, so you can check it.',
  rule5: 'Progress (stories seen, level) stays only on this device. We do not collect any data from children.',
  resetProgress: "Erase this device's progress",
  resetDone: 'Progress erased.',
  contact: 'Questions: contato@biblealpha.com',
  listen: '🔊 Listen',
  stopListen: '⏹️ Stop',
  doQuiz: '❓ Take the quiz',
  quizTitle: 'Bible quiz',
  quizPick: 'Pick a story:',
  noQuiz: 'Quizzes are on the way!',
  questions: '{n} questions',
  questionOf: 'Question {n} of {total}',
  right: 'Well done! 🎉',
  wrong: 'Almost! Try again. 💪',
  nextQuestion: 'Next ▶',
  quizDone: 'You got {n} of {total} right!',
  playAgain: '🔁 Play again',
  memoryTitle: 'Memory game',
  memoryPick: 'How many cards?',
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  memoryWin: 'You found all the pairs!',
  moves: '{n} moves',
  pairFound: 'Found: {name}!',
  versesTitle: 'Verses',
  noVerses: 'Verses are on the way!',
  verseOfDay: '⭐ Verse of the day',
  fillGame: '🧠 Fill in the words',
  fillHint: 'Tap the missing word:',
  fillDone: 'You completed the verse! 🎉',
  otherVerse: 'Another verse',
  allVerses: 'All verses',
  bibleTitle: 'Bible',
  oldTestament: 'Old Testament',
  newTestament: 'New Testament',
  chapter: 'Chapter {n}',
  chooseChapter: 'Pick a chapter:',
  nextChapter: 'Next ▶',
  prevChapter: '◀ Previous',
  translation: 'Translation:',
  languageLabel: 'Kids language:',
  deviceLanguage: 'Device',
  preparingLanguage: 'I\'m getting everything ready in your language… come back in a minute! ⏳',
  searchLanguage: 'Search language',
  card_ark: 'Noah\'s ark',
  card_dove: 'Dove',
  card_rainbow: 'Rainbow',
  card_lion: 'Lion',
  card_whale: 'Great fish',
  card_sheep: 'Sheep',
  card_star: 'Star',
  card_bread: 'Bread',
  card_fish: 'Little fish',
  card_crown: 'King\'s crown',
  card_camel: 'Camel',
  card_sea: 'Red Sea',
  card_tree: 'Tree',
  card_fire: 'Tongues of fire',
  card_harp: 'David\'s harp',
  card_tablet: 'Ten Commandments',
  chooseLanguage: 'Choose the language',
  otherLanguages: 'Other languages (translated automatically):',
  videosTitle: 'Bible videos',
  noVideos: 'Videos are on the way!',
  videosWebOnly: 'For now, videos play on the website biblealpha.com/kids.',
};

const es: Dict = {
  ...GAME_ES,
  ...GAME2_ES,
  appName: 'BibleAlpha Kids',
  hello: '¡Hola! ¿Aprendemos la Palabra de Dios?',
  hello2: '¡Dios te ama!',
  hello3: '¡Elige una actividad!',
  soon: '¡Muy pronto!',
  small: 'Pequeños',
  big: 'Grandes',
  stories: 'Historias',
  games: 'Juegos',
  quiz: 'Quiz',
  verse: 'Versículo',
  bible: 'Biblia',
  videos: 'Videos',
  parents: 'Padres',
  back: 'Volver',
  storiesTitle: 'Historias de la Biblia',
  noStories: '¡Nuevas historias están llegando!',
  pages: '{n} páginas',
  seen: 'Ya la vi',
  loadError: 'No se pudo cargar ahora. Inténtalo de nuevo.',
  tryAgain: 'Intentar de nuevo',
  previous: 'Página anterior',
  next: 'Página siguiente',
  pageOf: 'Página {n} de {total}',
  theEnd: '¡Terminaste la historia!',
  lesson: 'Lo que aprendimos',
  talk: 'Para conversar en familia',
  inTheBible: 'Esta historia está en la Biblia en {reference}.',
  readAgain: 'Leer de nuevo',
  moreStories: 'Más historias',
  gateTitle: 'Solo para adultos',
  gateQuestion: '¿Cuánto es {a} × {b}?',
  gateHint: 'Escribe la respuesta para entrar.',
  gateWrong: 'Respuesta incorrecta. Prueba otra.',
  enter: 'Entrar',
  parentsTitle: 'Para padres y responsables',
  parentsIntro:
    'BibleAlpha Kids enseña la Palabra de Dios a los niños con historias, juegos y versículos, en un lugar seguro.',
  rule1: 'Sin anuncios, sin compras y sin enlaces externos.',
  rule2: 'El niño no crea cuenta y no conversa con inteligencia artificial.',
  rule3: 'Todo el contenido es revisado por un adulto antes de aparecer.',
  rule4: 'Cada historia muestra el pasaje de la Biblia de donde viene, para que puedas comprobarlo.',
  rule5: 'El progreso (historias vistas, nivel) queda solo en este dispositivo. No recopilamos datos del niño.',
  resetProgress: 'Borrar el progreso de este dispositivo',
  resetDone: 'Progreso borrado.',
  contact: 'Dudas: contato@biblealpha.com',
  listen: '🔊 Escuchar',
  stopListen: '⏹️ Parar',
  doQuiz: '❓ Hacer el quiz',
  quizTitle: 'Quiz de la Biblia',
  quizPick: 'Elige una historia:',
  noQuiz: '¡Los quizzes están llegando!',
  questions: '{n} preguntas',
  questionOf: 'Pregunta {n} de {total}',
  right: '¡Muy bien! 🎉',
  wrong: '¡Casi! Inténtalo de nuevo. 💪',
  nextQuestion: 'Siguiente ▶',
  quizDone: '¡Acertaste {n} de {total}!',
  playAgain: '🔁 Jugar de nuevo',
  memoryTitle: 'Juego de memoria',
  memoryPick: '¿Cuántas cartas?',
  easy: 'Fácil',
  medium: 'Medio',
  hard: 'Difícil',
  memoryWin: '¡Encontraste todos los pares!',
  moves: '{n} jugadas',
  pairFound: '¡Encontraste: {name}!',
  versesTitle: 'Versículos',
  noVerses: '¡Los versículos están llegando!',
  verseOfDay: '⭐ Versículo del día',
  fillGame: '🧠 Completar las palabras',
  fillHint: 'Toca la palabra que falta:',
  fillDone: '¡Completaste el versículo! 🎉',
  otherVerse: 'Otro versículo',
  allVerses: 'Todos los versículos',
  bibleTitle: 'Biblia',
  oldTestament: 'Antiguo Testamento',
  newTestament: 'Nuevo Testamento',
  chapter: 'Capítulo {n}',
  chooseChapter: 'Elige el capítulo:',
  nextChapter: 'Siguiente ▶',
  prevChapter: '◀ Anterior',
  translation: 'Traducción:',
  languageLabel: 'Idioma de Kids:',
  deviceLanguage: 'Del dispositivo',
  preparingLanguage: 'Estoy preparando todo en tu idioma… ¡vuelve en un minutito! ⏳',
  searchLanguage: 'Buscar idioma',
  card_ark: 'Arca de Noé',
  card_dove: 'Paloma',
  card_rainbow: 'Arcoíris',
  card_lion: 'León',
  card_whale: 'Gran pez',
  card_sheep: 'Oveja',
  card_star: 'Estrella',
  card_bread: 'Pan',
  card_fish: 'Pececito',
  card_crown: 'Corona del rey',
  card_camel: 'Camello',
  card_sea: 'Mar Rojo',
  card_tree: 'Árbol',
  card_fire: 'Lenguas de fuego',
  card_harp: 'Arpa de David',
  card_tablet: 'Diez Mandamientos',
  chooseLanguage: 'Elige el idioma',
  otherLanguages: 'Otros idiomas (traducidos automáticamente):',
  videosTitle: 'Videos de la Biblia',
  noVideos: '¡Los videos están llegando!',
  videosWebOnly: 'Por ahora los videos se ven en el sitio biblealpha.com/kids.',
};

const DICTS: Record<Builtin, Dict> = { 'pt-BR': pt, en, es };

export type KidsKey = keyof Dict;

/** Textos em inglês do Kids: vão junto com os do app para a DeepSeek traduzir os outros idiomas. */
export const kidsEnglish: Dict = en;

const isBuiltin = (code: string): code is Builtin => code in DICTS;

/** Idioma do aparelho (o primeiro da lista dele): qualquer português vira pt-BR. */
export function kidsLanguage(): KidsLanguage {
  const first = getLocales()[0];
  const code = (first?.languageCode ?? 'pt').toLowerCase();
  if (code === 'pt') return 'pt-BR';
  return code;
}

type Pack = { version: number; texts: Partial<Dict>; books: Record<string, { name: string; abbr: string }> };
const cacheKey = (code: string) => `bakids.ui.${code}`;

function readCache(code: string): Pack | null {
  if (Platform.OS !== 'web') return null;
  try {
    const raw = globalThis.localStorage?.getItem(cacheKey(code));
    return raw ? (JSON.parse(raw) as Pack) : null;
  } catch {
    return null;
  }
}

function writeCache(code: string, pack: Pack) {
  if (Platform.OS !== 'web') return;
  try {
    globalThis.localStorage?.setItem(cacheKey(code), JSON.stringify(pack));
  } catch {
    // sem espaço ou navegação privada
  }
}

type Remote = { version: number; dictionary?: { kidsUi?: Partial<Dict> }; books?: Pack['books'] };

type TextCtx = { language: KidsLanguage; pack: Pack | null; preparing: boolean };
const TextContext = createContext<TextCtx>({ language: 'pt-BR', pack: null, preparing: false });

/** Baixa os textos traduzidos do idioma (salvos para todos no servidor). Enquanto um idioma novo
 * é preparado pela primeira vez, mostra em inglês e tenta de novo a cada 20 segundos. */
export function KidsTextProvider({ children }: { children: ReactNode }) {
  const chosen = useChosenLanguage();
  const language = chosen ?? kidsLanguage();
  // Pacote baixado, guardado junto com o idioma dele (trocar de idioma mostra a cópia do aparelho até chegar o novo)
  const [loaded, setLoaded] = useState<{ code: string; pack: Pack } | null>(null);
  const [preparing, setPreparing] = useState(false);

  useEffect(() => {
    if (isBuiltin(language)) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    async function load(tries: number) {
      try {
        const remote = await kidsFetch<Remote>(`/languages/${encodeURIComponent(language)}`);
        const texts = remote.dictionary?.kidsUi ?? {};
        const fresh: Pack = { version: remote.version, texts, books: remote.books ?? {} };
        if (!alive) return;
        setLoaded({ code: language, pack: fresh });
        writeCache(language, fresh);
        // Idioma pronto, mas ainda sem os textos do Kids: pede para completar
        const complete = Object.keys(texts).length >= Object.keys(en).length * 0.9;
        setPreparing(!complete);
        if (!complete) {
          await kidsPost(`/kids/languages/${encodeURIComponent(language)}/prepare`).catch(() => {});
          if (tries < 45) timer = setTimeout(() => load(tries + 1), 20_000);
        }
      } catch {
        if (!alive) return;
        setPreparing(true);
        await kidsPost(`/kids/languages/${encodeURIComponent(language)}/prepare`).catch(() => {});
        if (tries < 45) timer = setTimeout(() => load(tries + 1), 20_000);
      }
    }

    load(0);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [language]);

  const pack = isBuiltin(language) ? null : loaded?.code === language ? loaded.pack : readCache(language);
  const value = useMemo(() => ({ language, pack, preparing }), [language, pack, preparing]);
  return <TextContext.Provider value={value}>{children}</TextContext.Provider>;
}

export function useKidsText() {
  const { language, pack, preparing } = useContext(TextContext);
  const dict = isBuiltin(language) ? DICTS[language] : null;
  const t = (key: KidsKey, vars?: Record<string, string | number>) =>
    (dict?.[key] ?? pack?.texts[key] ?? en[key]).replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? `{${k}}`));
  return { t, language, books: pack?.books ?? {}, preparing };
}

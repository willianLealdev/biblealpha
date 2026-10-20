// Leitura em voz alta do capítulo, com as vozes do próprio aparelho (grátis e sem internet).

import * as Speech from 'expo-speech';
import { useCallback, useEffect, useRef, useState } from 'react';

import { kvGet, kvSet } from '@/lib/kv';

import type { Verse } from './text';

/** Idioma da voz a partir do idioma da tradução (pt-BR, en, es, fr, …). */
export function voiceLanguage(language: string) {
  const map: Record<string, string> = { 'pt-BR': 'pt-BR', pt: 'pt-BR', en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', it: 'it-IT' };
  return map[language] ?? map[language.split('-')[0]] ?? language;
}

// ---------- Escolha da voz (preferência pela voz masculina) ----------

export type VoiceOption = { identifier: string; name: string; quality: string; male: boolean };

const normLang = (l: string) => l.toLowerCase().replace('_', '-');
// O aparelho não informa o gênero da voz: reconhecemos pelos nomes conhecidos (iPhone, Google, Samsung)
const FEMALE = /female|feminin|mulher|woman|luciana|joana|m[oó]nica|paulina|samantha|karen|victoria|fiona|moira/i;
const MALE_WORD = /(^|[^a-z])male([^a-z]|$)|masculin/i;
const MALE_NAMES = /(felipe|eddy|reed|rocko|jorge|diego|juan|carlos|aaron|alex|fred|daniel|evan|gordon|nathan|arthur|oliver|rishi|tom|thomas)/i;
const GOOGLE_MALE = /(pt-br-x-ptd|en-us-x-(iom|iol|tpd)|en-gb-x-(rjs|gbd))/i;

function isMale(v: { name: string; identifier: string }) {
  const text = `${v.name} ${v.identifier}`;
  if (FEMALE.test(text)) return false;
  return MALE_WORD.test(text) || MALE_NAMES.test(text) || GOOGLE_MALE.test(text);
}

let voicesCache: Promise<Speech.Voice[]> | null = null;
const allVoices = () => (voicesCache ??= Speech.getAvailableVoicesAsync().catch(() => []));

/** Vozes do aparelho no idioma pedido; as masculinas (prováveis) primeiro, depois as de melhor qualidade. */
export async function listVoices(language: string): Promise<VoiceOption[]> {
  const lang = normLang(language);
  const voices = await allVoices();
  const exact = voices.filter((v) => normLang(v.language) === lang);
  const list = exact.length ? exact : voices.filter((v) => normLang(v.language).split('-')[0] === lang.split('-')[0]);
  return list
    .map((v) => ({ identifier: v.identifier, name: v.name, quality: String(v.quality ?? ''), male: isMale(v) }))
    .sort((a, b) => Number(b.male) - Number(a.male) || Number(b.quality === 'Enhanced') - Number(a.quality === 'Enhanced') || a.name.localeCompare(b.name));
}

const voiceKey = (language: string) => `voice:${normLang(language)}`;
export const savedVoice = (language: string) => kvGet<string>(voiceKey(language));
/** Guarda a voz escolhida (null volta para a automática, que prefere voz masculina). */
export const saveVoice = (language: string, identifier: string | null) => kvSet(voiceKey(language), identifier);

/** Voz usada na leitura: a que a pessoa escolheu; sem escolha, a masculina melhor que o aparelho tiver. */
export async function chooseVoice(language: string): Promise<string | undefined> {
  const options = await listVoices(language);
  const saved = await savedVoice(language);
  if (saved && options.some((o) => o.identifier === saved)) return saved;
  return options.find((o) => o.male)?.identifier;
}

const SAMPLE: Record<string, string> = {
  pt: 'No princípio, Deus criou os céus e a terra.',
  en: 'In the beginning, God created the heavens and the earth.',
  es: 'En el principio, Dios creó los cielos y la tierra.',
};
/** Toca uma frase curta para a pessoa ouvir a voz antes de escolher. */
export function sampleVoice(language: string, identifier: string) {
  Speech.stop();
  Speech.speak(SAMPLE[normLang(language).split('-')[0]] ?? SAMPLE.en, { language, voice: identifier });
}

export type ReadAloud = {
  playing: boolean;
  /** Versículo que está sendo lido agora */
  current: number | null;
  rate: number;
  play: (verses: Verse[], language: string, fromVerse?: number) => void;
  stop: () => void;
  setRate: (rate: number) => void;
  /** Idioma da voz da leitura atual (para escolher a voz) */
  language: string | null;
  /** A voz mudou (escolhida na lista): recomeça o versículo atual com ela */
  reloadVoice: () => void;
};

type Runner = {
  // Cada leitura tem um número: um "terminou" de uma leitura antiga não continua a nova
  session: number;
  queue: { verses: Verse[]; language: string; index: number } | null;
  rate: number;
  voice: string | undefined;
  onVerse: (verse: number | null) => void;
  onEnd: () => void;
};

function speakNext(r: Runner, id: number) {
  const q = r.queue;
  if (!q || id !== r.session) return;
  const v = q.verses[q.index];
  if (!v) {
    r.onEnd();
    return;
  }
  r.onVerse(v.verse);
  Speech.speak(v.text, {
    language: voiceLanguage(q.language),
    voice: r.voice,
    rate: r.rate,
    onDone: () => {
      if (id !== r.session || !r.queue) return;
      r.queue.index += 1;
      speakNext(r, id);
    },
    onError: r.onEnd,
  });
}

export function useReadAloud(): ReadAloud {
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState<number | null>(null);
  const [rate, setRateState] = useState(1);
  const [language, setLanguage] = useState<string | null>(null);
  const runner = useRef<Runner | null>(null);

  const get = useCallback(() => {
    if (!runner.current) {
      runner.current = {
        session: 0,
        queue: null,
        rate: 1,
        voice: undefined,
        onVerse: setCurrent,
        onEnd: () => {
          setPlaying(false);
          setCurrent(null);
        },
      };
    }
    return runner.current;
  }, []);

  const stop = useCallback(() => {
    const r = get();
    r.session += 1;
    r.queue = null;
    Speech.stop();
    setPlaying(false);
    setCurrent(null);
  }, [get]);

  const play = useCallback(
    (verses: Verse[], language: string, fromVerse?: number) => {
      const r = get();
      Speech.stop();
      r.session += 1;
      const start = Math.max(0, fromVerse ? verses.findIndex((v) => v.verse === fromVerse) : 0);
      r.queue = { verses, language, index: start };
      setPlaying(true);
      setLanguage(voiceLanguage(language));
      // Escolhe a voz (preferindo a masculina) antes de começar a ler
      const id = r.session;
      chooseVoice(voiceLanguage(language)).then((voice) => {
        if (id !== r.session) return;
        r.voice = voice;
        speakNext(r, id);
      });
    },
    [get],
  );

  const setRate = useCallback(
    (next: number) => {
      const r = get();
      r.rate = next;
      setRateState(next);
      // Recomeça o versículo atual na nova velocidade
      if (r.queue) {
        Speech.stop();
        r.session += 1;
        speakNext(r, r.session);
      }
    },
    [get],
  );

  const reloadVoice = useCallback(() => {
    const r = get();
    const q = r.queue;
    if (!q) return;
    Speech.stop();
    r.session += 1;
    const id = r.session;
    chooseVoice(voiceLanguage(q.language)).then((voice) => {
      if (id !== r.session) return;
      r.voice = voice;
      speakNext(r, id);
    });
  }, [get]);

  // Sai da tela: para de ler
  useEffect(
    () => () => {
      if (runner.current) runner.current.session += 1;
      Speech.stop();
    },
    [],
  );

  return { playing, current, rate, play, stop, setRate, language, reloadVoice };
}

// Leitura em voz alta do capítulo, com as vozes do próprio aparelho (grátis e sem internet).

import * as Speech from 'expo-speech';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Verse } from './text';

/** Idioma da voz a partir do idioma da tradução (pt-BR, en, es, fr, …). */
export function voiceLanguage(language: string) {
  const map: Record<string, string> = { 'pt-BR': 'pt-BR', pt: 'pt-BR', en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', it: 'it-IT' };
  return map[language] ?? map[language.split('-')[0]] ?? language;
}

export type ReadAloud = {
  playing: boolean;
  /** Versículo que está sendo lido agora */
  current: number | null;
  rate: number;
  play: (verses: Verse[], language: string, fromVerse?: number) => void;
  stop: () => void;
  setRate: (rate: number) => void;
};

type Runner = {
  // Cada leitura tem um número: um "terminou" de uma leitura antiga não continua a nova
  session: number;
  queue: { verses: Verse[]; language: string; index: number } | null;
  rate: number;
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
  const runner = useRef<Runner | null>(null);

  const get = useCallback(() => {
    if (!runner.current) {
      runner.current = {
        session: 0,
        queue: null,
        rate: 1,
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
      speakNext(r, r.session);
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

  // Sai da tela: para de ler
  useEffect(
    () => () => {
      if (runner.current) runner.current.session += 1;
      Speech.stop();
    },
    [],
  );

  return { playing, current, rate, play, stop, setRate };
}

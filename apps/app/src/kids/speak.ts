// Leitura em voz alta com a voz do próprio aparelho (grátis, sem internet, nada é enviado).

import * as Speech from 'expo-speech';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import type { KidsLanguage } from './strings';

const VOICE: Record<string, string> = { 'pt-BR': 'pt-BR', en: 'en-US', es: 'es-ES' };

// Navegador sem voz (alguns navegadores embutidos): os botões só não falam, sem erro
const SUPPORTED = Platform.OS !== 'web' || (typeof window !== 'undefined' && 'speechSynthesis' in window);

function quietStop() {
  if (SUPPORTED) Speech.stop().catch(() => {});
}

/** Fala um texto; tocar de novo enquanto fala faz parar. */
export function useSpeaker(language: KidsLanguage) {
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => () => quietStop(), []);

  const stop = useCallback(() => {
    quietStop();
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!SUPPORTED) return;
      quietStop();
      setSpeaking(true);
      Speech.speak(text, {
        language: VOICE[language] ?? language,
        // Um pouco mais devagar e alegre para crianças
        rate: 0.9,
        pitch: 1.1,
        onDone: () => setSpeaking(false),
        onStopped: () => setSpeaking(false),
        onError: () => setSpeaking(false),
      });
    },
    [language],
  );

  const toggle = useCallback((text: string) => (speaking ? stop() : speak(text)), [speaking, speak, stop]);

  return { speaking, speak, stop, toggle };
}

// Ditado por voz: reconhecimento de fala do navegador (Chrome, Edge, Safari). No app nativo
// entra no build das lojas com o reconhecimento do próprio aparelho.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

function recognitionClass(): any {
  if (Platform.OS !== 'web') return null;
  const w = globalThis as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function useDictation(locale: string) {
  const Recognition = recognitionClass();
  const [listening, setListening] = useState(false);
  const recognizer = useRef<any>(null);

  const stop = useCallback(() => recognizer.current?.stop(), []);

  /** Começa a ouvir; cada frase reconhecida chega em `onText`. Tocar de novo para. */
  const toggle = useCallback(
    (onText: (text: string) => void) => {
      if (!Recognition) return;
      if (recognizer.current) {
        recognizer.current.stop();
        return;
      }
      const r = new Recognition();
      r.lang = locale;
      r.continuous = true;
      r.interimResults = false;
      r.onresult = (e: any) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) onText(String(e.results[i][0].transcript).trim());
        }
      };
      r.onend = () => {
        recognizer.current = null;
        setListening(false);
      };
      r.onerror = r.onend;
      recognizer.current = r;
      setListening(true);
      r.start();
    },
    [Recognition, locale],
  );

  useEffect(() => () => recognizer.current?.stop(), []);

  return { supported: !!Recognition, listening, toggle, stop };
}

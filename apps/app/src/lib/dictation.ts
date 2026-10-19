// Ditado por voz: reconhecimento de fala do navegador (Chrome, Edge, Safari) ou, nos apps,
// do próprio aparelho (Android e iPhone).

import { useCallback, useEffect, useRef, useState } from 'react';

import { ensureSpeechPermission, speechRecognitionClass as recognitionClass } from './speech';

export function useDictation(locale: string) {
  const Recognition = recognitionClass();
  const [listening, setListening] = useState(false);
  const recognizer = useRef<any>(null);

  const stop = useCallback(() => recognizer.current?.stop(), []);

  /** Começa a ouvir; cada frase reconhecida chega em `onText`. Tocar de novo para. */
  const toggle = useCallback(
    async (onText: (text: string) => void) => {
      if (!Recognition) return;
      if (recognizer.current) {
        recognizer.current.stop();
        return;
      }
      if (!(await ensureSpeechPermission())) return;
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

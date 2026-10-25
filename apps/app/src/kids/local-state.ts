// Estado de um jogo guardado só neste aparelho (jardim, cidade, missões, desenhos).
// No site usa o localStorage; sem ele (navegação privada), o jogo funciona sem guardar.

import { useCallback, useState } from 'react';
import { Platform } from 'react-native';

function read<T>(key: string, fallback: T): T {
  if (Platform.OS !== 'web') return fallback;
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  if (Platform.OS !== 'web') return;
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // sem espaço: segue sem guardar
  }
}

/** Como o useState, mas lembra o valor neste aparelho (chave `bakids.<nome>`). */
export function useStoredState<T>(name: string, initial: T): [T, (next: T | ((old: T) => T)) => void] {
  const key = `bakids.${name}`;
  const [value, setValue] = useState<T>(() => read(key, initial));
  const set = useCallback(
    (next: T | ((old: T) => T)) =>
      setValue((old) => {
        const v = typeof next === 'function' ? (next as (o: T) => T)(old) : next;
        write(key, v);
        return v;
      }),
    [key],
  );
  return [value, set];
}

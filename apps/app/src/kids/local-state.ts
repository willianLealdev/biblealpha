// Estado de um jogo guardado só neste aparelho (jardim, cidade, missões, desenhos).
// Site: localStorage; apps: arquivo no aparelho. Sem espaço, o jogo funciona sem guardar.

import { useCallback, useState } from 'react';

import { readStored, writeStored } from './device-store';

const read = <T,>(key: string, fallback: T): T => readStored<T>(key) ?? fallback;
const write = writeStored;

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

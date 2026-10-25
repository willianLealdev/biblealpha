// Progresso da criança: só neste aparelho (localStorage no site). Nada vai para o servidor.

import * as SecureStore from 'expo-secure-store';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import type { KidsLevel } from './api';
import type { KidsLanguage } from './strings';

const KEY = 'bakids.progress';

// stars: estrelas ganhas no quiz e nos jogos (só para comemorar; nada é cobrado nem comparado)
// language: idioma escolhido na área dos pais (null = o do aparelho)
// xp e played: Jornada Bíblica (nível e conquistas), também só no aparelho
type Progress = {
  level: KidsLevel;
  seen: string[];
  stars: number;
  language: KidsLanguage | null;
  xp: number;
  played: Record<string, number>;
};
const EMPTY: Progress = { level: 'small', seen: [], stars: 0, language: null, xp: 0, played: {} };
const count = (v: unknown) => (Number.isFinite(v) ? Math.max(0, Math.min(999999, Math.floor(v as number))) : 0);
const LANGUAGE = /^[a-z]{2,3}(-[A-Z]{2})?$/;

async function load(): Promise<Progress> {
  try {
    const raw = Platform.OS === 'web' ? globalThis.localStorage?.getItem(KEY) : await SecureStore.getItemAsync(KEY);
    const data = raw ? JSON.parse(raw) : null;
    return {
      level: data?.level === 'big' ? 'big' : 'small',
      seen: Array.isArray(data?.seen) ? data.seen.filter((s: unknown) => typeof s === 'string').slice(-300) : [],
      stars: count(data?.stars),
      xp: count(data?.xp),
      played:
        data?.played && typeof data.played === 'object'
          ? Object.fromEntries(Object.entries(data.played as Record<string, unknown>).slice(0, 100).map(([k, v]) => [k, count(v)]))
          : {},
      language: typeof data?.language === 'string' && LANGUAGE.test(data.language) ? data.language : null,
    };
  } catch {
    return EMPTY;
  }
}

async function store(p: Progress | null) {
  try {
    if (Platform.OS === 'web') {
      if (p) globalThis.localStorage?.setItem(KEY, JSON.stringify(p));
      else globalThis.localStorage?.removeItem(KEY);
    } else if (p) await SecureStore.setItemAsync(KEY, JSON.stringify(p));
    else await SecureStore.deleteItemAsync(KEY);
  } catch {
    // navegação privada ou armazenamento bloqueado: segue sem guardar
  }
}

type Ctx = Progress & {
  ready: boolean;
  setLevel: (level: KidsLevel) => void;
  markSeen: (slug: string) => void;
  addStars: (n: number) => void;
  /** Terminou um jogo: estrelas (0 a 3) e pontos da jornada. */
  finishGame: (game: string, stars: number) => void;
  setLanguage: (language: KidsLanguage | null) => void;
  reset: () => void;
};

const ProgressContext = createContext<Ctx | null>(null);

export function KidsProgressProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<Progress>(EMPTY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    load().then((p) => {
      setProgress(p);
      setReady(true);
    });
  }, []);

  const update = useCallback((change: (p: Progress) => Progress) => {
    setProgress((p) => {
      const next = change(p);
      store(next);
      return next;
    });
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      ...progress,
      ready,
      setLevel: (level) => update((p) => ({ ...p, level })),
      // Ler uma história até o fim pela primeira vez vale 20 pontos da jornada
      markSeen: (slug) => update((p) => (p.seen.includes(slug) ? p : { ...p, seen: [...p.seen, slug], xp: p.xp + 20 })),
      addStars: (n) => update((p) => ({ ...p, stars: p.stars + Math.max(0, n), xp: p.xp + Math.max(0, n) * 10 })),
      finishGame: (game, stars) =>
        update((p) => {
          const won = Math.max(0, Math.min(3, Math.round(stars)));
          return {
            ...p,
            stars: p.stars + won,
            xp: p.xp + 10 + won * 10,
            played: { ...p.played, [game]: (p.played[game] ?? 0) + 1 },
          };
        }),
      setLanguage: (language) => update((p) => ({ ...p, language })),
      reset: () => {
        store(null);
        setProgress(EMPTY);
      },
    }),
    [progress, ready, update],
  );
  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

/** Idioma escolhido pelos pais, ou null (também fora do Kids, sem erro). */
export function useChosenLanguage(): KidsLanguage | null {
  return useContext(ProgressContext)?.language ?? null;
}

export function useKidsProgress(): Ctx {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error('useKidsProgress fora do KidsProgressProvider');
  return ctx;
}

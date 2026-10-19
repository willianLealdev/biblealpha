import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { getItem, setItem } from '@/lib/storage';

import { palettes, type Palette, type ThemeMode, type ThemeName } from './tokens';

const STORAGE_KEY = 'ba.theme';

type ThemeContextValue = {
  mode: ThemeMode;
  name: ThemeName;
  colors: Palette;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  // O escuro é o padrão da marca
  const [mode, setModeState] = useState<ThemeMode>('dark');

  useEffect(() => {
    getItem(STORAGE_KEY).then((stored) => {
      if (stored === 'dark' || stored === 'light' || stored === 'system') setModeState(stored);
    });
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    setItem(STORAGE_KEY, next);
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const name: ThemeName = mode === 'system' ? (system === 'light' ? 'light' : 'dark') : mode;
    return { mode, name, colors: palettes[name], setMode };
  }, [mode, system, setMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}

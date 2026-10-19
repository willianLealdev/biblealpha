// Idiomas e países (vêm do servidor, para dar para ajustar sem atualizar o app).

import { api } from './api';
import { kvGet, kvSet } from './kv';

export type WorldLanguage = {
  code: string;
  /** Nome no próprio idioma (ex.: "Deutsch") */
  name: string;
  name_en: string;
  rtl: boolean;
  /** ready: o app já está nesse idioma · new/preparing: será traduzido na primeira escolha */
  status: 'ready' | 'preparing' | 'new';
  /** Bíblia padrão desse idioma (null: não há Bíblia livre nesse idioma ainda) */
  bible: string | null;
};
export type WorldCountry = { code: string; name_en: string; languages: string[] };
export type World = { languages: WorldLanguage[]; countries: WorldCountry[] };

const KEY = 'world:v1';
let memory: World | null = null;

export async function loadWorld(): Promise<World> {
  if (memory) return memory;
  try {
    memory = await api<World>('/languages/world', { auth: false });
    await kvSet(KEY, memory);
  } catch (e) {
    memory = await kvGet<World>(KEY);
    if (!memory) throw e;
  }
  return memory;
}

/** Bandeira do país a partir do código (ex.: BR → 🇧🇷). */
export function flag(code: string) {
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** Nome do país no idioma do app, quando o aparelho souber; senão em inglês. */
export function countryName(country: WorldCountry, locale: string) {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(country.code) ?? country.name_en;
  } catch {
    return country.name_en;
  }
}

/** País provável pelo aparelho (ex.: pt-BR → BR). */
export function guessCountry(regionCode: string | null | undefined, countries: WorldCountry[]) {
  const code = (regionCode ?? '').toUpperCase();
  return countries.some((c) => c.code === code) ? code : null;
}

import { getLocales } from 'expo-localization';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { registerBookNames } from '@/bible/reference';
import { kidsEnglish } from '@/kids/strings';
import { ApiError, api, type Locale } from '@/lib/api';
import { kvGet, kvSet } from '@/lib/kv';
import { getItem, setItem } from '@/lib/storage';

import en from './en';
import es from './es';
import ptBR, { type Dictionary } from './pt-BR';
import type { DeepPartial } from './types';

// Português, inglês e espanhol vêm no app. Outros idiomas são criados no painel do
// administrador e baixados aqui quando o usuário escolhe (sem atualizar o app).
const builtin: Record<string, DeepPartial<Dictionary>> = { 'pt-BR': ptBR, en, es };
const remote: Record<string, DeepPartial<Dictionary>> = {};
const STORAGE_KEY = 'ba.locale';
const LANGUAGES_KEY = 'i18n:languages';

export type Language = { code: string; name: string; builtin: boolean; version: number };
type RemotePack = { code: string; version: number; dictionary: DeepPartial<Dictionary>; books: Record<string, { name: string; abbr: string }> };

const BUILTIN_LANGUAGES: Language[] = [
  { code: 'pt-BR', name: 'Português', builtin: true, version: 0 },
  { code: 'en', name: 'English', builtin: true, version: 0 },
  { code: 'es', name: 'Español', builtin: true, version: 0 },
];

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];
export type TranslationKey = Leaves<Dictionary>;

export function isBuiltin(locale: string) {
  return locale in builtin;
}

export function deviceLocale(): Locale {
  const tag = (getLocales()[0]?.languageTag ?? 'pt-BR').toLowerCase();
  if (tag.startsWith('pt')) return 'pt-BR';
  if (tag.startsWith('es')) return 'es';
  return 'en';
}

function lookup(dict: DeepPartial<Dictionary> | undefined, key: string): string | undefined {
  const value = key.split('.').reduce<any>((node, part) => node?.[part], dict);
  return typeof value === 'string' ? value : undefined;
}

/** Texto no idioma pedido; o que faltar sai em inglês (e, por fim, a própria chave). */
export function translate(locale: Locale, key: string, params?: Record<string, string | number>): string {
  const text = lookup(builtin[locale] ?? remote[locale], key) ?? lookup(en, key) ?? key;
  return params ? text.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? `{${name}}`)) : text;
}

function installPack(pack: RemotePack) {
  remote[pack.code] = pack.dictionary;
  registerBookNames(pack.code, pack.books);
}

/** Dicionário de um idioma do painel: usa a cópia do aparelho e atualiza se houver versão nova. */
async function loadRemote(code: string): Promise<boolean> {
  const cached = await kvGet<RemotePack>(`i18n:pack:${code}`);
  if (cached) installPack(cached);
  try {
    const fresh = await api<RemotePack>(`/languages/${encodeURIComponent(code)}`, { auth: false });
    if (!cached || fresh.version !== cached.version) {
      installPack(fresh);
      await kvSet(`i18n:pack:${code}`, fresh);
    }
    return true;
  } catch {
    return !!cached;
  }
}

/** Hash simples do dicionário em inglês: muda quando a versão do app traz textos novos. */
function hashOf(text: string) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `${text.length}-${(h >>> 0).toString(36)}`;
}

/** App do administrador: envia os textos em inglês desta versão (base das traduções automáticas). */
export async function syncSourceTexts() {
  // Os textos do BibleAlpha Kids vão juntos (bloco kidsUi): a DeepSeek traduz tudo de uma vez
  const source = { ...en, kidsUi: kidsEnglish };
  const json = JSON.stringify(source);
  const hash = hashOf(json);
  if ((await kvGet<string>('i18n:source-hash')) === hash) return;
  await api('/admin/languages/source', { method: 'PUT', body: { hash, source } });
  await kvSet('i18n:source-hash', hash);
}

export async function listLanguages(): Promise<Language[]> {
  try {
    const items = await api<Language[]>('/languages', { auth: false });
    await kvSet(LANGUAGES_KEY, items);
    return items;
  } catch {
    return (await kvGet<Language[]>(LANGUAGES_KEY)) ?? BUILTIN_LANGUAGES;
  }
}

type I18n = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  /** Mensagem amigável para um erro da API, pelo código. */
  errorMessage: (error: unknown) => string;
  /** Idioma sendo traduzido agora (o app troca sozinho quando ficar pronto) */
  preparing: string | null;
};

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(deviceLocale);
  // Muda quando um dicionário baixado chega, para a tela redesenhar
  const [revision, setRevision] = useState(0);
  const [preparing, setPreparing] = useState<string | null>(null);

  const apply = useCallback(async (next: Locale) => {
    if (isBuiltin(next)) {
      setPreparing(null);
      setLocaleState(next);
      return;
    }
    if (await loadRemote(next)) {
      setPreparing(null);
      setLocaleState(next);
      setRevision((r) => r + 1);
      return;
    }
    // Primeira vez nesse idioma: o servidor traduz (uma vez para todos) e o app troca quando ficar pronto
    setPreparing(next);
    try {
      await api(`/languages/${encodeURIComponent(next)}/prepare`, { method: 'POST' });
    } catch {
      // sem sessão (cadastro) ou idioma indisponível: continua no idioma atual
      setPreparing(null);
      return;
    }
    for (let i = 0; i < 60; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      if (await loadRemote(next)) {
        setLocaleState(next);
        setRevision((r) => r + 1);
        break;
      }
    }
    setPreparing(null);
  }, []);

  useEffect(() => {
    getItem(STORAGE_KEY).then((stored) => {
      if (stored) apply(stored);
    });
  }, [apply]);

  const setLocale = useCallback(
    (next: Locale) => {
      setItem(STORAGE_KEY, next);
      apply(next);
    },
    [apply],
  );

  const value = useMemo<I18n>(() => {
    const t = (key: TranslationKey, params?: Record<string, string | number>) => translate(locale, key, params);
    return {
      locale,
      setLocale,
      preparing,
      t,
      errorMessage: (error) => {
        const code = error instanceof ApiError ? error.code : 'unknown_error';
        const key = `errors.${code}`;
        const text = translate(locale, key);
        return text === key ? translate(locale, 'errors.unknown_error') : text;
      },
    };
    // revision: um dicionário novo do mesmo idioma também redesenha
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, setLocale, revision, preparing]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}

// Cópia local de cada ministração: rascunho não enviado (offline) e base para o modo púlpito sem internet.

import { kvDelete, kvGet, kvSet } from '@/lib/kv';
import type { Sermon } from '@/lib/sermons';

import { docFromSermon, type Doc } from './document';

export type LocalSermon = {
  doc: Doc;
  /** Versão do servidor sobre a qual o rascunho foi editado */
  baseVersion: number;
  /** Há alterações ainda não salvas no servidor */
  dirty: boolean;
  savedAt: string;
};

const key = (id: string) => `sermon:${id}`;

export const loadLocal = (id: string) => kvGet<LocalSermon>(key(id));

export const saveLocal = (id: string, value: LocalSermon) => kvSet(key(id), value);

export const dropLocal = (id: string) => kvDelete(key(id));

export function localFromServer(s: Sermon): LocalSermon {
  return { doc: docFromSermon(s), baseVersion: s.version, dirty: false, savedAt: new Date().toISOString() };
}

// Avisos entre telas (ex.: versão restaurada no histórico substitui o que o editor mostra)
type Listener = (s: Sermon) => void;
const listeners = new Map<string, Set<Listener>>();

export function onSermonReplaced(id: string, fn: Listener) {
  if (!listeners.has(id)) listeners.set(id, new Set());
  listeners.get(id)!.add(fn);
  return () => {
    listeners.get(id)?.delete(fn);
  };
}

export function sermonReplaced(s: Sermon) {
  saveLocal(s.id, localFromServer(s));
  listeners.get(s.id)?.forEach((fn) => fn(s));
}

// Notas rápidas do púlpito feitas sem internet, enviadas depois
const notesKey = (id: string) => `sermon:${id}:pending-notes`;

export async function queuePulpitNote(id: string, text: string) {
  const pending = (await kvGet<string[]>(notesKey(id))) ?? [];
  await kvSet(notesKey(id), [...pending, text]);
}

export async function takePendingNotes(id: string): Promise<string[]> {
  const pending = (await kvGet<string[]>(notesKey(id))) ?? [];
  if (pending.length) await kvDelete(notesKey(id));
  return pending;
}

export const pulpitScrollKey = (id: string) => `sermon:${id}:pulpit-scroll`;

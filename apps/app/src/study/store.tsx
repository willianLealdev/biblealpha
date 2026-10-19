// Destaques, categorias, favoritos e anotações do usuário.
// Tudo é salvo primeiro no aparelho (funciona offline) e sincronizado com a API em segundo plano.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';

import { api } from '@/lib/api';
import { kvDelete, kvGet, kvSet } from '@/lib/kv';
import { useSession } from '@/lib/session';

export type Entity = 'category' | 'highlight' | 'bookmark' | 'annotation';
export type HighlightColor = 'yellow' | 'blue' | 'green' | 'red' | 'purple' | 'orange';

type Meta = { id: string; rev: number; client_updated_at: string };
export type Category = Meta & { name: string; color: HighlightColor; position: number };
export type Highlight = Meta & { verse_key: number; category_id: string };
export type Bookmark = Meta & {
  verse_key_start: number;
  verse_key_end: number;
  translation_code: string | null;
  label: string | null;
};
export type Annotation = Meta & {
  scope: 'book' | 'chapter' | 'verse' | 'range';
  verse_key_start: number;
  verse_key_end: number;
  title: string | null;
  body: string;
  tags: string[];
  created_at?: string | null;
};

type Items = {
  category: Record<string, Category>;
  highlight: Record<string, Highlight>;
  bookmark: Record<string, Bookmark>;
  annotation: Record<string, Annotation>;
};

type Change = {
  entity: Entity;
  id: string;
  deleted: boolean;
  client_updated_at: string;
  base_rev: number | null;
  data?: Record<string, unknown>;
};

type Snapshot = { cursor: number; items: Items; outbox: Record<string, Change> };

type ServerChange = {
  entity: Entity;
  id: string;
  rev: number;
  deleted: boolean;
  client_updated_at: string;
  data?: Record<string, unknown>;
};
type Notice = { entity: Entity; id: string; conflict?: string; copy_id?: string; error?: string };

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

const EMPTY: Snapshot = {
  cursor: 0,
  items: { category: {}, highlight: {}, bookmark: {}, annotation: {} },
  outbox: {},
};

export const HIGHLIGHT_COLORS: Record<HighlightColor, { light: string; dark: string; swatch: string }> = {
  yellow: { light: '#FFF1A8', dark: 'rgba(250, 214, 70, 0.32)', swatch: '#F2C94C' },
  blue: { light: '#CFE6FF', dark: 'rgba(86, 160, 255, 0.32)', swatch: '#5AA0FF' },
  green: { light: '#D4F2D2', dark: 'rgba(98, 196, 110, 0.32)', swatch: '#62C46E' },
  red: { light: '#FFD3CF', dark: 'rgba(240, 98, 88, 0.34)', swatch: '#F06258' },
  purple: { light: '#E6D8FF', dark: 'rgba(168, 120, 255, 0.34)', swatch: '#A878FF' },
  orange: { light: '#FFE0C2', dark: 'rgba(255, 150, 60, 0.32)', swatch: '#FF963C' },
};

function uuid(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

type StudyContextValue = {
  ready: boolean;
  status: SyncStatus;
  pending: number;
  conflicts: Notice[];
  dismissConflicts: () => void;
  categories: Category[];
  highlightByKey: Map<number, Highlight>;
  bookmarks: Bookmark[];
  annotations: Annotation[];
  setHighlight: (keys: number[], categoryId: string | null) => void;
  addBookmark: (start: number, end: number, translation: string | null) => void;
  removeBookmark: (id: string) => void;
  saveAnnotation: (a: Omit<Annotation, keyof Meta> & { id?: string }) => string;
  deleteAnnotation: (id: string) => void;
  renameCategory: (id: string, name: string) => void;
  syncNow: () => Promise<void>;
};

const StudyContext = createContext<StudyContextValue | null>(null);

export function StudyProvider({ children }: { children: ReactNode }) {
  const { user, status: sessionStatus } = useSession();
  const userId = sessionStatus === 'signedIn' ? user?.id : undefined;
  const storageKey = userId ? `study:${userId}` : null;

  const [snap, setSnap] = useState<Snapshot>(EMPTY);
  // Para qual usuário a cópia local já foi carregada
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const ready = !!storageKey && loadedKey === storageKey;
  const syncRef = useRef<() => Promise<void>>(async () => {});
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [conflicts, setConflicts] = useState<Notice[]>([]);
  const snapRef = useRef(snap);
  const syncing = useRef(false);
  const again = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commit = useCallback(
    (next: Snapshot) => {
      snapRef.current = next;
      setSnap(next);
      if (storageKey) kvSet(storageKey, next);
    },
    [storageKey],
  );

  const syncNow = useCallback(async () => {
    if (!storageKey) return;
    if (syncing.current) {
      again.current = true;
      return;
    }
    syncing.current = true;
    setStatus('syncing');
    const sent = { ...snapRef.current.outbox };
    try {
      const res = await api<{ cursor: number; changes: ServerChange[]; notices: Notice[] }>('/sync', {
        method: 'POST',
        body: { cursor: snapRef.current.cursor, changes: Object.values(sent) },
      });
      const current = snapRef.current;
      const outbox = { ...current.outbox };
      for (const [k, change] of Object.entries(sent)) {
        // Só sai da fila o que não foi editado de novo enquanto a sincronização acontecia
        if (outbox[k]?.client_updated_at === change.client_updated_at) delete outbox[k];
      }
      const items: Items = {
        category: { ...current.items.category },
        highlight: { ...current.items.highlight },
        bookmark: { ...current.items.bookmark },
        annotation: { ...current.items.annotation },
      };
      for (const c of res.changes) {
        if (outbox[`${c.entity}:${c.id}`]) continue; // edição local mais nova ainda na fila
        const table = items[c.entity] as Record<string, Meta>;
        if (c.deleted) delete table[c.id];
        else table[c.id] = { ...(c.data ?? {}), id: c.id, rev: c.rev, client_updated_at: c.client_updated_at } as Meta;
      }
      commit({ cursor: res.cursor, items, outbox });
      const found = res.notices.filter((n) => n.conflict === 'copied');
      if (found.length) setConflicts((prev) => [...prev, ...found]);
      setStatus('idle');
    } catch (e: any) {
      setStatus(e?.code === 'network_error' ? 'offline' : 'error');
    } finally {
      syncing.current = false;
      if (again.current) {
        again.current = false;
        setTimeout(() => syncRef.current(), 0);
      }
    }
  }, [storageKey, commit]);

  useEffect(() => {
    syncRef.current = syncNow;
  }, [syncNow]);

  const scheduleSync = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => syncNow(), 800);
  }, [syncNow]);

  // Carrega a cópia local do usuário e sincroniza
  useEffect(() => {
    let active = true;
    if (!storageKey) {
      snapRef.current = EMPTY;
      return;
    }
    kvGet<Snapshot>(storageKey).then((saved) => {
      if (!active) return;
      const initial = saved ?? EMPTY;
      snapRef.current = initial;
      setSnap(initial);
      setLoadedKey(storageKey);
      syncNow();
    });
    return () => {
      active = false;
    };
  }, [storageKey, syncNow]);

  // Sincroniza ao voltar para o app e quando a internet volta
  useEffect(() => {
    if (!storageKey) return;
    const sub = AppState.addEventListener('change', (s) => s === 'active' && syncNow());
    const online = () => syncNow();
    if (Platform.OS === 'web') globalThis.addEventListener?.('online', online);
    const interval = setInterval(() => syncNow(), 60_000);
    return () => {
      sub.remove();
      if (Platform.OS === 'web') globalThis.removeEventListener?.('online', online);
      clearInterval(interval);
    };
  }, [storageKey, syncNow]);

  // Ao sair da conta, a cópia local é apagada (aparelho compartilhado)
  const previousKey = useRef<string | null>(null);
  useEffect(() => {
    if (previousKey.current && previousKey.current !== storageKey) kvDelete(previousKey.current);
    previousKey.current = storageKey;
  }, [storageKey]);

  const mutate = useCallback(
    (entity: Entity, id: string, change: { deleted?: boolean; data?: Record<string, unknown> }) => {
      const current = snapRef.current;
      const now = new Date().toISOString();
      const table = { ...(current.items[entity] as Record<string, Meta>) };
      const existing = table[id];
      if (change.deleted) delete table[id];
      else table[id] = { ...(existing ?? {}), ...change.data, id, rev: existing?.rev ?? 0, client_updated_at: now } as Meta;
      const outbox = {
        ...current.outbox,
        [`${entity}:${id}`]: {
          entity,
          id,
          deleted: !!change.deleted,
          client_updated_at: now,
          base_rev: existing?.rev || null,
          data: change.data,
        },
      };
      commit({ ...current, items: { ...current.items, [entity]: table }, outbox });
      scheduleSync();
    },
    [commit, scheduleSync],
  );

  const value = useMemo<StudyContextValue>(() => {
    // Sem usuário (ou ainda carregando outro), nada de dados de estudo na tela
    const view = ready ? snap : EMPTY;
    const categories = Object.values(view.items.category).sort((a, b) => a.position - b.position);
    const highlightByKey = new Map<number, Highlight>();
    for (const h of Object.values(view.items.highlight)) highlightByKey.set(h.verse_key, h);
    const bookmarks = Object.values(view.items.bookmark).sort((a, b) => a.verse_key_start - b.verse_key_start);
    const annotations = Object.values(view.items.annotation).sort((a, b) =>
      (b.client_updated_at ?? '').localeCompare(a.client_updated_at ?? ''),
    );
    return {
      ready,
      status,
      pending: Object.keys(view.outbox).length,
      conflicts,
      dismissConflicts: () => setConflicts([]),
      categories,
      highlightByKey,
      bookmarks,
      annotations,
      setHighlight(keys, categoryId) {
        for (const key of keys) {
          const existing = highlightByKey.get(key);
          if (categoryId === null) {
            if (existing) mutate('highlight', existing.id, { deleted: true });
          } else {
            mutate('highlight', existing?.id ?? uuid(), { data: { verse_key: key, category_id: categoryId } });
          }
        }
      },
      addBookmark(start, end, translation) {
        mutate('bookmark', uuid(), {
          data: { verse_key_start: start, verse_key_end: end, translation_code: translation, label: null },
        });
      },
      removeBookmark(id) {
        mutate('bookmark', id, { deleted: true });
      },
      saveAnnotation({ id, ...data }) {
        const finalId = id ?? uuid();
        mutate('annotation', finalId, { data: { ...data, tags: data.tags ?? [] } });
        return finalId;
      },
      deleteAnnotation(id) {
        mutate('annotation', id, { deleted: true });
      },
      renameCategory(id, name) {
        const c = view.items.category[id];
        if (c) mutate('category', id, { data: { name, color: c.color, position: c.position } });
      },
      syncNow,
    };
  }, [snap, ready, status, conflicts, mutate, syncNow]);

  return <StudyContext.Provider value={value}>{children}</StudyContext.Provider>;
}

export function useStudy() {
  const ctx = useContext(StudyContext);
  if (!ctx) throw new Error('useStudy must be used inside StudyProvider');
  return ctx;
}

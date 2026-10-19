import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text as RNText, View } from 'react-native';

import { bookName } from '@/bible/reference';
import { Button, Card, Divider, Notice, Screen, Segmented, Text, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';
import { fonts } from '@/theme/tokens';

type Result = { book: string; chapter: number; verse: number; verse_key: number; text: string };
type Response =
  | { type: 'reference'; references: { book: string; chapter: number; verse_start: number | null }[]; total: 0; results: [] }
  | { type: 'text'; total: number; results: Result[] };

const PAGE = 30;

function stripAccents(s: string) {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Marca no texto as palavras buscadas (ignorando acentos). */
function Marked({ text, terms, color }: { text: string; terms: string[]; color: string }) {
  if (!terms.length) return <>{text}</>;
  const plain = stripAccents(text);
  const marks: [number, number][] = [];
  for (const term of terms) {
    let i = plain.indexOf(term);
    while (i >= 0) {
      marks.push([i, i + term.length]);
      i = plain.indexOf(term, i + term.length);
    }
  }
  marks.sort((a, b) => a[0] - b[0]);
  const parts: React.ReactNode[] = [];
  let pos = 0;
  for (const [s, e] of marks) {
    if (s < pos) continue;
    parts.push(text.slice(pos, s));
    parts.push(
      <RNText key={s} style={{ color, fontFamily: fonts.bodyBold }}>
        {text.slice(s, e)}
      </RNText>,
    );
    pos = e;
  }
  parts.push(text.slice(pos));
  return <>{parts}</>;
}

export default function Search() {
  const { t: translationParam } = useLocalSearchParams<{ t?: string }>();
  const translation = translationParam || 'blivre';
  const { t, locale, errorMessage } = useI18n();
  const { colors } = useTheme();
  const [q, setQ] = useState('');
  const [scope, setScope] = useState<'all' | 'OT' | 'NT'>('all');
  const [results, setResults] = useState<Result[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [terms, setTerms] = useState<string[]>([]);

  async function run(offset = 0, nextScope = scope) {
    const query = q.trim();
    if (query.length < 2) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q: query, limit: String(PAGE), offset: String(offset) });
      if (nextScope !== 'all') params.set('testament', nextScope);
      const res = await api<Response>(`/bible/${translation}/search?${params}`, { auth: false });
      if (res.type === 'reference') {
        const r = res.references[0];
        router.navigate({
          pathname: '/',
          params: { book: r.book, chapter: String(r.chapter), ...(r.verse_start ? { verse: String(r.verse_start) } : {}) },
        });
        return;
      }
      setTerms(
        stripAccents(query.replace(/"/g, ''))
          .split(/\s+/)
          .filter((w) => w.length > 2),
      );
      setTotal(res.total);
      setResults((prev) => (offset ? [...prev, ...res.results] : res.results));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <TextField
        label={t('bible.search')}
        placeholder={t('bible.searchPlaceholder')}
        value={q}
        onChangeText={setQ}
        autoFocus
        returnKeyType="search"
        onSubmitEditing={() => run(0)}
      />
      <Segmented
        value={scope}
        onChange={(v) => {
          setScope(v);
          if (total !== null) run(0, v);
        }}
        options={[
          { value: 'all', label: t('bible.searchAll') },
          { value: 'OT', label: t('bible.oldTestament') },
          { value: 'NT', label: t('bible.newTestament') },
        ]}
      />
      <Button title={t('bible.search')} icon="search" onPress={() => run(0)} loading={loading && !results.length} />
      {error ? <Notice kind="error">{error}</Notice> : null}
      {total !== null ? <Text variant="muted">{total ? t('bible.results', { n: total }) : t('bible.noResults')}</Text> : null}
      {results.length ? (
        <Card style={{ paddingVertical: 4 }}>
          {results.map((r, i) => (
            <View key={r.verse_key}>
              {i > 0 ? <Divider /> : null}
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.navigate({
                    pathname: '/',
                    params: { book: r.book, chapter: String(r.chapter), verse: String(r.verse) },
                  })
                }
                style={({ pressed }) => ({ paddingVertical: 12, opacity: pressed ? 0.7 : 1, gap: 4 })}>
                <RNText style={{ color: colors.gold, fontFamily: fonts.bodyBold, fontSize: 14 }}>
                  {bookName(r.book, locale)} {r.chapter}:{r.verse}
                </RNText>
                <RNText style={{ color: colors.text, fontFamily: 'Literata_400Regular', fontSize: 16, lineHeight: 24 }}>
                  <Marked text={r.text} terms={terms} color={colors.gold} />
                </RNText>
              </Pressable>
            </View>
          ))}
        </Card>
      ) : null}
      {loading && results.length ? <ActivityIndicator color={colors.gold} /> : null}
      {total !== null && results.length < total && !loading ? (
        <Button kind="secondary" title={t('bible.loadMore')} onPress={() => run(results.length)} />
      ) : null}
    </Screen>
  );
}

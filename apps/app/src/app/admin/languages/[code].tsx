import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Button, Card, Notice, Screen, Text, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import en from '@/i18n/en';
import { languagesApi } from '@/lib/admin-content';
import { useTheme } from '@/theme';

function flatten(node: object, prefix = ''): Record<string, string> {
  return Object.fromEntries(
    Object.entries(node).flatMap(([k, v]) =>
      typeof v === 'string' ? [[`${prefix}${k}`, v]] : Object.entries(flatten(v, `${prefix}${k}.`)),
    ),
  );
}

const SOURCE = flatten(en);
const PAGE = 40;

/** Revisão dos textos de um idioma do painel: inglês ao lado da tradução, editável. */
export default function AdminLanguageTexts() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { t, errorMessage } = useI18n();
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const [texts, setTexts] = useState<Record<string, string> | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    languagesApi
      .get(code)
      .then((r) => {
        setName(r.name);
        setTexts(r.texts);
      })
      .catch((e) => setMessage({ kind: 'error', text: errorMessage(e) }));
  }, [code, errorMessage]);

  const keys = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return Object.keys(SOURCE).filter(
      (k) => !needle || k.toLowerCase().includes(needle) || SOURCE[k].toLowerCase().includes(needle) || (texts?.[k] ?? '').toLowerCase().includes(needle),
    );
  }, [q, texts]);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      await languagesApi.update(code, { texts: edits });
      setTexts((cur) => ({ ...cur, ...edits }));
      setEdits({});
      setMessage({ kind: 'success', text: t('admin.textsSaved') });
    } catch (e) {
      setMessage({ kind: 'error', text: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  }

  if (!texts) {
    return <Screen center>{message ? <Notice kind="error">{message.text}</Notice> : <ActivityIndicator color={colors.gold} />}</Screen>;
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: `${name} (${code})` }} />
      {message ? <Notice kind={message.kind}>{message.text}</Notice> : null}
      <TextField label={t('admin.searchTexts')} value={q} onChangeText={(v) => (setQ(v), setLimit(PAGE))} />
      {Object.keys(edits).length ? <Button icon="save-outline" title={t('admin.saveTexts')} onPress={save} loading={saving} /> : null}
      {keys.slice(0, limit).map((k) => (
        <Card key={k}>
          <Text variant="small">{k}</Text>
          <Text variant="muted">
            {t('admin.english')}: {SOURCE[k]}
          </Text>
          <TextField
            label={name}
            value={edits[k] ?? texts[k] ?? ''}
            onChangeText={(v) => setEdits((cur) => ({ ...cur, [k]: v }))}
            multiline
          />
        </Card>
      ))}
      {keys.length > limit ? (
        <View>
          <Button kind="secondary" title={t('bible.loadMore')} onPress={() => setLimit((l) => l + PAGE)} />
        </View>
      ) : null}
    </Screen>
  );
}

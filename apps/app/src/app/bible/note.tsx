import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { formatKeyRange, splitKey } from '@/bible/reference';
import { Button, Notice, Screen, Text, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { useStudy } from '@/study/store';

/** Editor de anotação ligada a um versículo ou trecho. Abre com ?start=&end= (nova) ou ?id= (editar). */
export default function NoteEditor() {
  const params = useLocalSearchParams<{ id?: string; start?: string; end?: string }>();
  const { t, locale } = useI18n();
  const study = useStudy();
  const navigation = useNavigation();
  const existing = params.id ? study.annotations.find((a) => a.id === params.id) : undefined;

  const start = existing?.verse_key_start ?? Number(params.start);
  const end = existing?.verse_key_end ?? Number(params.end ?? params.start);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [body, setBody] = useState(existing?.body ?? '');
  const [tags, setTags] = useState((existing?.tags ?? []).join(', '));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: existing ? t('note.editTitle') : t('note.newTitle') });
  }, [navigation, existing, t]);

  if (!start) return <Screen><Notice kind="error">{t('errors.unknown_error')}</Notice></Screen>;
  const label = formatKeyRange(start, end, locale);

  function back() {
    const { book, chapter, verse } = splitKey(start);
    if (router.canGoBack()) router.back();
    else router.navigate({ pathname: '/', params: { book, chapter: String(chapter), verse: String(verse) } });
  }

  function save() {
    if (!body.trim() && !title.trim()) {
      setError(t('note.empty'));
      return;
    }
    study.saveAnnotation({
      id: existing?.id,
      scope: start === end ? 'verse' : 'range',
      verse_key_start: start,
      verse_key_end: end,
      title: title.trim() || null,
      body: body.trim(),
      tags: tags
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 20),
    });
    back();
  }

  return (
    <Screen>
      <Text variant="title">{label}</Text>
      {error ? <Notice kind="error">{error}</Notice> : null}
      <TextField label={t('note.title')} value={title} onChangeText={setTitle} maxLength={200} />
      <TextField
        label={t('note.body')}
        placeholder={t('note.bodyPlaceholder')}
        value={body}
        onChangeText={setBody}
        multiline
        textAlignVertical="top"
        style={{ minHeight: 180 }}
        maxLength={20000}
      />
      <TextField label={t('note.tags')} value={tags} onChangeText={setTags} autoCapitalize="none" />
      <Button title={t('common.save')} onPress={save} />
      {existing ? (
        <View style={{ marginTop: 8 }}>
          <Button
            kind="ghost"
            title={t('note.delete')}
            onPress={() => {
              study.deleteAnnotation(existing.id);
              back();
            }}
          />
        </View>
      ) : null}
    </Screen>
  );
}

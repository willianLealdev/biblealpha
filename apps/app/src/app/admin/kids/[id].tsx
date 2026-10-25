import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text as RNText, View } from 'react-native';

import { Button, Card, Notice, Screen, Segmented, Text, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { kidsAdminApi, type KidsLevel, type KidsPage, type KidsQuiz, type KidsStatus, type KidsStoryDetail } from '@/lib/admin-kids';
import { useTheme } from '@/theme';
import { fonts } from '@/theme/tokens';

/** Revisão de uma história do Kids: texto bíblico de um lado, texto da história do outro. */
export default function AdminKidsStory() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, errorMessage } = useI18n();
  const { colors } = useTheme();
  const [story, setStory] = useState<KidsStoryDetail | null>(null);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [level, setLevel] = useState<KidsLevel>('both');
  const [lesson, setLesson] = useState('');
  const [question, setQuestion] = useState('');
  const [pages, setPages] = useState<KidsPage[]>([]);
  const [quiz, setQuiz] = useState<KidsQuiz[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  function fill(s: KidsStoryDetail) {
    setStory(s);
    setTitle(s.title);
    setSummary(s.summary);
    setLevel(s.level);
    setLesson(s.lesson);
    setQuestion(s.family_question);
    setPages(s.page_list);
    setQuiz(s.quiz);
    setDirty(false);
  }

  useEffect(() => {
    kidsAdminApi
      .get(id)
      .then(fill)
      .catch((e) => setMessage({ kind: 'error', text: errorMessage(e) }));
  }, [id, errorMessage]);

  async function run(name: string, action: () => Promise<KidsStoryDetail>, success: string) {
    setBusy(name);
    setMessage(null);
    try {
      fill(await action());
      setMessage({ kind: 'success', text: success });
    } catch (e) {
      setMessage({ kind: 'error', text: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  }

  const edit = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setDirty(true);
  };
  const editPage = (i: number, patch: Partial<KidsPage>) =>
    edit(setPages)(pages.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const editQuestion = (i: number, patch: Partial<KidsQuiz>) =>
    edit(setQuiz)(quiz.map((q, j) => (j === i ? { ...q, ...patch } : q)));

  const save = () =>
    run(
      'save',
      () =>
        kidsAdminApi.save(id, {
          title: title.trim(),
          summary,
          level,
          lesson,
          family_question: question,
          pages: pages.filter((p) => p.text.trim()),
          // Perguntas incompletas (sem texto ou com menos de 2 alternativas) não vão
          quiz: quiz
            .map((q) => {
              const options = q.options.map((o) => o.trim());
              const kept = options.map((o, i) => [o, i] as const).filter(([o]) => o);
              return {
                question: q.question.trim(),
                options: kept.map(([o]) => o),
                answer: Math.max(0, kept.findIndex(([, i]) => i === q.answer)),
                explanation: q.explanation.trim(),
              };
            })
            .filter((q) => q.question && q.options.length >= 2),
        }),
      t('adminKids.saved'),
    );

  const setStatus = (status: KidsStatus) =>
    run(
      status,
      () => kidsAdminApi.setStatus(id, status),
      status === 'published' ? t('adminKids.publishedOk') : status === 'review' ? t('adminKids.reviewOk') : t('adminKids.unpublishedOk'),
    );

  async function remove() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy('delete');
    try {
      await kidsAdminApi.remove(id);
      router.back();
    } catch (e) {
      setMessage({ kind: 'error', text: errorMessage(e) });
      setBusy(null);
    }
  }

  if (!story) {
    return (
      <Screen center>
        {message ? <Notice kind={message.kind}>{message.text}</Notice> : <ActivityIndicator color={colors.gold} />}
      </Screen>
    );
  }

  const statusLabel =
    story.status === 'published'
      ? t('adminKids.statusPublished')
      : story.status === 'review'
        ? t('adminKids.statusReview')
        : t('adminKids.statusDraft');

  return (
    // Tela larga no computador: a passagem fica ao lado do texto da história
    <Screen style={{ maxWidth: 1100 }}>
      <Stack.Screen options={{ title: story.title }} />
      <Text variant="muted">
        {story.reference} · {story.language} · {statusLabel}
      </Text>
      {story.ai_meta.model ? <Notice>{t('adminKids.aiDraft', { model: story.ai_meta.model })}</Notice> : null}
      {message ? <Notice kind={message.kind}>{message.text}</Notice> : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
        <Card style={{ flex: 1, minWidth: 300 }}>
          <Text variant="heading">{t('adminKids.bibleText', { translation: story.translation })}</Text>
          <Text variant="small">{story.reference}</Text>
          {story.passage.map((v) => (
            <RNText key={`${v.chapter}:${v.verse}`} style={{ color: colors.text, fontFamily: fonts.body, fontSize: 15, lineHeight: 23 }}>
              <RNText style={{ color: colors.gold, fontFamily: fonts.bodyBold, fontSize: 12 }}>{v.verse} </RNText>
              {v.text}
            </RNText>
          ))}
          {story.ai_meta.characters?.length ? (
            <>
              <Text variant="heading" style={{ marginTop: 8 }}>
                {t('adminKids.characters')}
              </Text>
              {story.ai_meta.characters.map((c) => (
                <Text key={c.name} variant="small">
                  {c.name}: {c.description}
                </Text>
              ))}
            </>
          ) : null}
        </Card>

        <View style={{ flex: 1, minWidth: 300, gap: 12 }}>
          <Card>
            <Text variant="heading">{t('adminKids.storyText')}</Text>
            <TextField label={t('adminKids.storyTitle')} value={title} onChangeText={edit(setTitle)} />
            <TextField label={t('adminKids.summary')} value={summary} onChangeText={edit(setSummary)} multiline />
            <Text variant="label">{t('adminKids.level')}</Text>
            <Segmented
              value={level}
              onChange={edit(setLevel)}
              options={[
                { value: 'small', label: t('adminKids.levelSmall') },
                { value: 'big', label: t('adminKids.levelBig') },
                { value: 'both', label: t('adminKids.levelBoth') },
              ]}
            />
          </Card>
          {pages.map((p, i) => (
            <Card key={i}>
              <TextField
                label={t('adminKids.page', { n: i + 1 })}
                value={p.text}
                onChangeText={(text) => editPage(i, { text })}
                multiline
                style={{ minHeight: 90 }}
              />
              <TextField
                label={t('adminKids.imagePrompt')}
                value={p.image_prompt}
                onChangeText={(image_prompt) => editPage(i, { image_prompt })}
                multiline
              />
              {pages.length > 1 ? (
                <Button kind="ghost" icon="trash-outline" title={t('adminKids.removePage')} onPress={() => edit(setPages)(pages.filter((_, j) => j !== i))} />
              ) : null}
            </Card>
          ))}
          <Button
            kind="secondary"
            icon="add"
            title={t('adminKids.addPage')}
            onPress={() => edit(setPages)([...pages, { text: '', image_prompt: '' }])}
          />
          <Text variant="heading">{t('adminKids.quizTitle')}</Text>
          {quiz.map((q, i) => (
            <Card key={`q${i}`}>
              <TextField
                label={t('adminKids.question', { n: i + 1 })}
                value={q.question}
                onChangeText={(question) => editQuestion(i, { question })}
                multiline
              />
              {[0, 1, 2, 3].map((o) => (
                <View key={o} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <TextField
                      label={t('adminKids.option', { n: o + 1 })}
                      value={q.options[o] ?? ''}
                      onChangeText={(text) => {
                        const options = [...q.options];
                        while (options.length <= o) options.push('');
                        options[o] = text;
                        editQuestion(i, { options });
                      }}
                    />
                  </View>
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ selected: q.answer === o }}
                    accessibilityLabel={t('adminKids.correct')}
                    onPress={() => editQuestion(i, { answer: o })}
                    style={{
                      minHeight: 50,
                      paddingHorizontal: 12,
                      borderRadius: 12,
                      borderWidth: 1,
                      justifyContent: 'center',
                      borderColor: q.answer === o ? colors.success : colors.border,
                      backgroundColor: q.answer === o ? colors.success : 'transparent',
                    }}>
                    <RNText style={{ color: q.answer === o ? '#FFFFFF' : colors.textMuted, fontFamily: fonts.bodyBold }}>
                      ✓ {t('adminKids.correct')}
                    </RNText>
                  </Pressable>
                </View>
              ))}
              <TextField
                label={t('adminKids.explanation')}
                value={q.explanation}
                onChangeText={(explanation) => editQuestion(i, { explanation })}
                multiline
              />
              <Button kind="ghost" icon="trash-outline" title={t('adminKids.removeQuestion')} onPress={() => edit(setQuiz)(quiz.filter((_, j) => j !== i))} />
            </Card>
          ))}
          {quiz.length < 10 ? (
            <Button
              kind="secondary"
              icon="add"
              title={t('adminKids.addQuestion')}
              onPress={() => edit(setQuiz)([...quiz, { question: '', options: ['', '', ''], answer: 0, explanation: '' }])}
            />
          ) : null}
          <Card>
            <TextField label={t('adminKids.lesson')} value={lesson} onChangeText={edit(setLesson)} multiline />
            <TextField label={t('adminKids.familyQuestion')} value={question} onChangeText={edit(setQuestion)} multiline />
          </Card>
        </View>
      </View>

      <View style={{ width: '100%', maxWidth: 560, alignSelf: 'center', gap: 10 }}>
        <Button
          icon="save-outline"
          title={t('adminKids.save')}
          onPress={save}
          loading={busy === 'save'}
          disabled={!dirty || !title.trim() || !pages.some((p) => p.text.trim()) || !!busy}
        />
        {dirty ? <Text variant="small" style={{ textAlign: 'center' }}>{t('adminKids.unsaved')}</Text> : null}
        {story.status === 'draft' ? (
          <Button
            kind="secondary"
            icon="eye-outline"
            title={t('adminKids.sendReview')}
            onPress={() => setStatus('review')}
            loading={busy === 'review'}
            disabled={dirty || !!busy}
          />
        ) : null}
        {story.status !== 'published' ? (
          <Button
            icon="megaphone-outline"
            title={t('adminKids.publish')}
            onPress={() => setStatus('published')}
            loading={busy === 'published'}
            disabled={dirty || !!busy}
          />
        ) : (
          <Button
            kind="secondary"
            icon="eye-off-outline"
            title={t('adminKids.unpublish')}
            onPress={() => setStatus('draft')}
            loading={busy === 'draft'}
            disabled={dirty || !!busy}
          />
        )}
        <Button
          kind={confirmDelete ? 'danger' : 'ghost'}
          icon="trash-outline"
          title={confirmDelete ? t('adminKids.removeAgain') : t('adminKids.remove')}
          onPress={remove}
          loading={busy === 'delete'}
          disabled={!!busy && busy !== 'delete'}
        />
      </View>
    </Screen>
  );
}

import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text as RNText, View } from 'react-native';

import { Button, Card, Notice, Screen, Segmented, Text, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { devotionalAdminApi, type AgendaDay } from '@/lib/admin-content';
import { useTheme } from '@/theme';
import { fonts, radius } from '@/theme/tokens';

type Lang = 'pt-BR' | 'en' | 'es';

/** Um dia da agenda: passagem, tema e texto do devocional que todos verão naquele dia. */
export default function AdminDevotionalDay() {
  const { day, lang: initialLang } = useLocalSearchParams<{
    day: string;
    lang?: Lang;
  }>();
  const { t, locale, errorMessage } = useI18n();
  const { colors } = useTheme();
  const [lang, setLang] = useState<Lang>(initialLang ?? 'pt-BR');
  const [themes, setThemes] = useState<{ code: string; label: string }[]>([]);
  const [item, setItem] = useState<AgendaDay | null>(null);
  const [theme, setTheme] = useState('');
  const [reference, setReference] = useState('');
  const [title, setTitle] = useState('');
  const [context, setContext] = useState('');
  const [reflection, setReflection] = useState('');
  const [application, setApplication] = useState('');
  const [questions, setQuestions] = useState('');
  const [prayer, setPrayer] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    kind: 'success' | 'error';
    text: string;
  } | null>(null);

  function fill(d: AgendaDay) {
    setItem(d);
    setTheme(d.theme);
    setReference(d.reference);
    setTitle(d.content?.title ?? '');
    setContext(d.content?.context ?? '');
    setReflection(d.content?.reflection ?? '');
    setApplication(d.content?.application ?? '');
    setQuestions((d.content?.questions ?? []).join('\n'));
    setPrayer(d.content?.prayer ?? '');
  }

  useEffect(() => {
    devotionalAdminApi
      .agenda(lang, day, 1)
      .then((r) => {
        setThemes(r.themes);
        fill(r.days[0]);
      })
      .catch((e) => setMessage({ kind: 'error', text: errorMessage(e) }));
  }, [day, lang, errorMessage]);

  async function run(name: string, action: () => Promise<AgendaDay | undefined>, success?: string) {
    setBusy(name);
    setMessage(null);
    try {
      const d = await action();
      if (d) fill(d);
      if (success) setMessage({ kind: 'success', text: success });
    } catch (e) {
      setMessage({ kind: 'error', text: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  }

  const generate = (locales: Lang[]) =>
    run('generate', async () => {
      const r = await devotionalAdminApi.generate({
        day,
        locales,
        theme,
        reference: reference.trim() || undefined,
      });
      return r.days.find((d) => d.locale === lang) ?? r.days[0];
    });

  const save = () =>
    run(
      'save',
      () =>
        devotionalAdminApi.save({
          day,
          locale: lang,
          theme,
          reference: reference.trim(),
          content: {
            title: title.trim(),
            context,
            reflection,
            application,
            questions: questions
              .split('\n')
              .map((q) => q.trim())
              .filter(Boolean),
            prayer,
          },
        }),
      t('admin.devotionalSaved'),
    );

  const isPast = day < new Date().toISOString().slice(0, 10);

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: new Date(`${day}T12:00:00`).toLocaleDateString(locale, {
            dateStyle: 'full',
          }),
        }}
      />
      <Segmented
        value={lang}
        onChange={setLang}
        options={[
          { value: 'pt-BR', label: 'Português' },
          { value: 'en', label: 'English' },
          { value: 'es', label: 'Español' },
        ]}
      />
      {message ? <Notice kind={message.kind}>{message.text}</Notice> : null}
      {!item ? (
        <ActivityIndicator color={colors.gold} />
      ) : (
        <>
          <TextField label={t('admin.passage')} value={reference} onChangeText={setReference} />
          <Text variant="label">{t('devotional.theme')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {themes.map((th) => {
              const active = th.code === theme;
              return (
                <Pressable
                  key={th.code}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  onPress={() => setTheme(th.code)}
                  style={{
                    borderWidth: 1,
                    borderColor: active ? colors.gold : colors.border,
                    backgroundColor: active ? colors.gold : 'transparent',
                    borderRadius: radius.pill,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                  }}>
                  <RNText
                    style={{
                      color: active ? colors.onGold : colors.text,
                      fontFamily: fonts.body,
                      fontSize: 13,
                    }}>
                    {th.label}
                  </RNText>
                </Pressable>
              );
            })}
          </View>

          {busy === 'generate' ? (
            <View style={{ alignItems: 'center', gap: 8 }}>
              <ActivityIndicator color={colors.gold} />
              <Text variant="muted">{t('admin.generatingDevotional')}</Text>
            </View>
          ) : !isPast ? (
            <View style={{ gap: 8 }}>
              <Button icon="sparkles" title={t('admin.generateAll')} onPress={() => generate(['pt-BR', 'en', 'es'])} disabled={!!busy} />
              <Button
                kind="secondary"
                icon="sparkles-outline"
                title={t('admin.generateThis')}
                onPress={() => generate([lang])}
                disabled={!!busy}
              />
            </View>
          ) : null}

          <Card>
            <TextField label={t('admin.titleField')} value={title} onChangeText={setTitle} />
            <TextField label={t('devotional.context')} value={context} onChangeText={setContext} multiline style={{ minHeight: 80 }} />
            <TextField
              label={t('devotional.reflection')}
              value={reflection}
              onChangeText={setReflection}
              multiline
              style={{ minHeight: 160 }}
            />
            <TextField
              label={t('devotional.application')}
              value={application}
              onChangeText={setApplication}
              multiline
              style={{ minHeight: 80 }}
            />
            <TextField
              label={t('admin.questionsField')}
              value={questions}
              onChangeText={setQuestions}
              multiline
              style={{ minHeight: 80 }}
            />
            <TextField label={t('devotional.prayer')} value={prayer} onChangeText={setPrayer} multiline style={{ minHeight: 80 }} />
          </Card>
          <Button
            icon="megaphone-outline"
            title={t('admin.saveDevotional')}
            onPress={save}
            loading={busy === 'save'}
            disabled={!title.trim() || !reference.trim()}
          />
          {item.status === 'edited' ? (
            <Button
              kind="ghost"
              title={t('admin.resetAuto')}
              onPress={() => run('reset', () => devotionalAdminApi.reset(day, lang))}
              disabled={!!busy}
            />
          ) : null}
        </>
      )}
    </Screen>
  );
}

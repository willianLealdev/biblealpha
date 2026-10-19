import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { DevotionalView } from '@/components/devotional-view';
import { Button, Divider, Notice, Screen, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { devotionalApi, type Devotional } from '@/lib/devotional';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme';

/** Devocional do dia: o texto e, no fim, Gostei, Concluí e Copiar para enviar. Nada mais. */
export default function DevotionalTab() {
  const { t, locale, errorMessage } = useI18n();
  const { colors } = useTheme();
  // Ferramentas de preparo e publicação: só o administrador vê
  const isAdmin = !!useSession().user?.roles.includes('admin');
  const [today, setToday] = useState<Devotional | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    devotionalApi
      .today()
      .then(setToday)
      .catch((e) => setError(errorMessage(e)));
  }, [errorMessage]);

  useFocusEffect(load);

  async function mark(body: { completed?: boolean; favorite?: boolean }) {
    const r = await devotionalApi.markToday(body);
    setToday((d) => (d ? { ...d, mine: { ...r.mine!, id: d.mine?.id ?? '' } } : d));
  }

  async function copy() {
    if (!today) return;
    const c = today.content;
    const parts = [
      c.title,
      `${today.reference} (${today.translation})\n${today.verses.map((v) => v.text).join(' ')}`,
      c.reflection,
      c.application,
      c.prayer,
      'BibleAlpha',
    ];
    await Clipboard.setStringAsync(parts.filter(Boolean).join('\n\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const done = !!today?.mine?.completed_on;
  const liked = !!today?.mine?.favorite;

  return (
    <Screen>
      <Text variant="title">{t('devotional.title')}</Text>
      {error ? <Notice kind="error">{error}</Notice> : null}
      {!today && !error ? <ActivityIndicator color={colors.gold} /> : null}

      {today ? (
        <>
          <Text variant="small">{new Date(`${today.day}T12:00:00`).toLocaleDateString(locale, { dateStyle: 'long' })}</Text>
          <DevotionalView d={today} review={isAdmin} />
          <View style={{ gap: 8 }}>
            <Button
              kind={liked ? 'primary' : 'secondary'}
              icon={liked ? 'heart' : 'heart-outline'}
              title={liked ? t('devotional.liked') : t('devotional.like')}
              onPress={() => mark({ favorite: !liked })}
            />
            <Button
              kind={done ? 'primary' : 'secondary'}
              icon={done ? 'checkmark-circle' : 'checkmark-circle-outline'}
              title={done ? t('devotional.done') : t('devotional.markDone')}
              onPress={() => mark({ completed: !done })}
            />
            <Button
              kind="secondary"
              icon={copied ? 'checkmark' : 'copy-outline'}
              title={copied ? t('devotional.copiedShare') : t('devotional.copyShare')}
              onPress={copy}
            />
          </View>
        </>
      ) : null}

      <Button kind="ghost" icon="book-outline" title={t('devotional.history')} onPress={() => router.push('/devotionals/history')} />

      {isAdmin ? (
        <>
          <Divider />
          <Button kind="secondary" icon="calendar-outline" title={t('devotional.explorePlans')} onPress={() => router.push('/devotionals/plans')} />
          <Button kind="secondary" icon="calendar-number-outline" title={t('admin.devotionals')} onPress={() => router.push('/admin/devotionals')} />
          <Button kind="ghost" icon="sparkles-outline" title={t('devotional.createPersonal')} onPress={() => router.push('/devotionals/new')} />
        </>
      ) : null}
    </Screen>
  );
}

import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text as RNText, View } from 'react-native';

import { Button, Card, Divider, Notice, Screen, Segmented, Text, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { kidsAdminApi, type KidsGenerate, type KidsStatus, type KidsStoryRow } from '@/lib/admin-kids';
import { useTheme } from '@/theme';
import { fonts } from '@/theme/tokens';

type Filter = KidsStatus | 'all';

/** Histórias do BibleAlpha Kids: gerar com a IA (sempre rascunho) e acompanhar o que está publicado. */
export default function AdminKids() {
  const { t, errorMessage } = useI18n();
  const { colors } = useTheme();
  const [filter, setFilter] = useState<Filter>('all');
  const [stories, setStories] = useState<KidsStoryRow[] | null>(null);
  const [totals, setTotals] = useState<Record<KidsStatus, number> | null>(null);
  const [form, setForm] = useState<KidsGenerate>({
    reference: '',
    language: 'pt-BR',
    level: 'both',
    tone: 'joyful',
    length: 'medium',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setStories(null);
      kidsAdminApi
        .list(filter === 'all' ? undefined : filter)
        .then((r) => {
          setStories(r.stories);
          setTotals(r.totals);
        })
        .catch((e) => setError(errorMessage(e)));
    }, [filter, errorMessage]),
  );

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const story = await kidsAdminApi.generate({ ...form, reference: form.reference.trim() });
      router.push({ pathname: '/admin/kids/[id]', params: { id: story.id } });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function importStarter() {
    setImporting(true);
    setError(null);
    setNotice(null);
    try {
      const { created } = await kidsAdminApi.importStarter('pt-BR');
      setNotice(created ? t('adminKids.imported', { n: created }) : t('adminKids.importedNone'));
      const r = await kidsAdminApi.list(filter === 'all' ? undefined : filter);
      setStories(r.stories);
      setTotals(r.totals);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setImporting(false);
    }
  }

  const set = <K extends keyof KidsGenerate>(key: K) => (value: KidsGenerate[K]) => setForm((f) => ({ ...f, [key]: value }));
  const statusLabel = (s: KidsStatus) =>
    s === 'published' ? t('adminKids.statusPublished') : s === 'review' ? t('adminKids.statusReview') : t('adminKids.statusDraft');
  const statusColor = (s: KidsStatus) => (s === 'published' ? colors.success : s === 'review' ? colors.gold : colors.textMuted);
  const count = (s: KidsStatus) => (totals ? ` (${totals[s]})` : '');

  return (
    <Screen>
      <Text variant="muted">{t('adminKids.hint')}</Text>
      {Platform.OS === 'web' ? (
        <Button kind="secondary" icon="happy-outline" title={t('adminKids.openSite')} onPress={() => router.push('/kids')} />
      ) : null}
      <Button kind="secondary" icon="star-outline" title={t('adminKids.versesOpen')} onPress={() => router.push('/admin/kids/verses')} />
      <Button kind="secondary" icon="film-outline" title={t('adminKids.videosOpen')} onPress={() => router.push('/admin/kids/videos')} />
      <Card>
        <Text variant="small">{t('adminKids.importHint')}</Text>
        <Button kind="secondary" icon="download-outline" title={t('adminKids.importStarter')} onPress={importStarter} loading={importing} />
      </Card>
      {notice ? <Notice kind="success">{notice}</Notice> : null}
      {error ? <Notice kind="error">{error}</Notice> : null}

      <Card>
        <Text variant="heading">{t('adminKids.generate')}</Text>
        <TextField
          label={t('adminKids.passage')}
          hint={t('adminKids.passageHint')}
          value={form.reference}
          onChangeText={set('reference')}
          placeholder="1 Samuel 17:38-50"
          editable={!busy}
        />
        <Text variant="label">{t('adminKids.language')}</Text>
        <Segmented
          value={form.language}
          onChange={set('language')}
          options={[
            { value: 'pt-BR', label: 'Português' },
            { value: 'en', label: 'English' },
            { value: 'es', label: 'Español' },
          ]}
        />
        <Text variant="label">{t('adminKids.level')}</Text>
        <Segmented
          value={form.level}
          onChange={set('level')}
          options={[
            { value: 'small', label: t('adminKids.levelSmall') },
            { value: 'big', label: t('adminKids.levelBig') },
            { value: 'both', label: t('adminKids.levelBoth') },
          ]}
        />
        <Text variant="label">{t('adminKids.tone')}</Text>
        <Segmented
          value={form.tone}
          onChange={set('tone')}
          options={[
            { value: 'joyful', label: t('adminKids.toneJoyful') },
            { value: 'calm', label: t('adminKids.toneCalm') },
            { value: 'adventure', label: t('adminKids.toneAdventure') },
          ]}
        />
        <Text variant="label">{t('adminKids.length')}</Text>
        <Segmented
          value={form.length}
          onChange={set('length')}
          options={[
            { value: 'short', label: t('adminKids.lengthShort') },
            { value: 'medium', label: t('adminKids.lengthMedium') },
            { value: 'long', label: t('adminKids.lengthLong') },
          ]}
        />
        {busy ? (
          <View style={{ alignItems: 'center', gap: 8, paddingVertical: 8 }}>
            <ActivityIndicator color={colors.gold} />
            <Text variant="muted">{t('adminKids.generating')}</Text>
          </View>
        ) : (
          <Button icon="sparkles" title={t('adminKids.generate')} onPress={generate} disabled={form.reference.trim().length < 2} />
        )}
      </Card>

      <Segmented
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: t('adminKids.all') },
          { value: 'draft', label: t('adminKids.statusDraft') + count('draft') },
          { value: 'review', label: t('adminKids.statusReview') + count('review') },
          { value: 'published', label: t('adminKids.statusPublished') + count('published') },
        ]}
      />
      {stories === null ? <ActivityIndicator color={colors.gold} /> : null}
      {stories && !stories.length ? <Text variant="muted">{t('adminKids.empty')}</Text> : null}
      {stories?.length ? (
        <Card style={{ paddingVertical: 4 }}>
          {stories.map((s, i) => (
            <View key={s.id}>
              {i > 0 ? <Divider /> : null}
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/admin/kids/[id]', params: { id: s.id } })}
                style={{ paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <RNText style={{ color: colors.text, fontFamily: fonts.bodyMedium }} numberOfLines={1}>
                    {s.title}
                  </RNText>
                  <Text variant="small" numberOfLines={1}>
                    {s.reference} · {s.language} · {t('adminKids.pagesCount', { n: s.pages })}
                  </Text>
                </View>
                <RNText style={{ color: statusColor(s.status), fontFamily: fonts.bodyBold, fontSize: 13 }}>{statusLabel(s.status)}</RNText>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

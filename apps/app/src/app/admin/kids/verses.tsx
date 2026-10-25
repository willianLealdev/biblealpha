import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text as RNText, View } from 'react-native';

import { Button, Card, Divider, Notice, Screen, Segmented, Text, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { kidsAdminApi, type KidsLanguage, type KidsLevel, type KidsVerse } from '@/lib/admin-kids';
import { useTheme } from '@/theme';
import { fonts } from '@/theme/tokens';

/** Versículos para decorar do Kids: o texto vem da Bíblia cadastrada; publicar libera em /kids. */
export default function AdminKidsVerses() {
  const { t, errorMessage } = useI18n();
  const { colors } = useTheme();
  const [language, setLanguage] = useState<KidsLanguage>('pt-BR');
  const [verses, setVerses] = useState<KidsVerse[] | null>(null);
  const [reference, setReference] = useState('');
  const [level, setLevel] = useState<KidsLevel>('both');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(
    () =>
      kidsAdminApi
        .verses(language)
        .then((r) => setVerses(r.verses))
        .catch((e) => setMessage({ kind: 'error', text: errorMessage(e) })),
    [language, errorMessage],
  );

  useEffect(() => {
    load();
  }, [load]);

  async function run(name: string, action: () => Promise<string | void>) {
    setBusy(name);
    setMessage(null);
    try {
      const text = await action();
      if (text) setMessage({ kind: 'success', text });
      await load();
    } catch (e) {
      setMessage({ kind: 'error', text: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  }

  const statusLabel = (s: KidsVerse['status']) =>
    s === 'published' ? t('adminKids.statusPublished') : s === 'review' ? t('adminKids.statusReview') : t('adminKids.statusDraft');
  const levelLabel = (l: KidsLevel) => (l === 'small' ? t('adminKids.levelSmall') : l === 'big' ? t('adminKids.levelBig') : t('adminKids.levelBoth'));

  return (
    <Screen>
      <Text variant="muted">{t('adminKids.versesHint')}</Text>
      <Segmented
        value={language}
        onChange={setLanguage}
        options={[
          { value: 'pt-BR', label: 'Português' },
          { value: 'en', label: 'English' },
          { value: 'es', label: 'Español' },
        ]}
      />
      {message ? <Notice kind={message.kind}>{message.text}</Notice> : null}
      <Button
        icon="sparkles-outline"
        title={t('adminKids.addSuggested')}
        loading={busy === 'suggested'}
        disabled={!!busy}
        onPress={() =>
          run('suggested', async () => t('adminKids.suggestedAdded', { n: (await kidsAdminApi.addSuggested(language)).created }))
        }
      />
      <Card>
        <TextField label={t('adminKids.verseRef')} value={reference} onChangeText={setReference} placeholder="Salmos 23:1" />
        <Segmented
          value={level}
          onChange={setLevel}
          options={[
            { value: 'small', label: t('adminKids.levelSmall') },
            { value: 'big', label: t('adminKids.levelBig') },
            { value: 'both', label: t('adminKids.levelBoth') },
          ]}
        />
        <Button
          kind="secondary"
          icon="add"
          title={t('adminKids.addVerse')}
          loading={busy === 'add'}
          disabled={!!busy || reference.trim().length < 3}
          onPress={() =>
            run('add', async () => {
              await kidsAdminApi.addVerse({ reference: reference.trim(), language, level });
              setReference('');
            })
          }
        />
      </Card>
      {verses?.some((v) => v.status !== 'published') ? (
        <Button
          kind="secondary"
          icon="megaphone-outline"
          title={t('adminKids.publishAll')}
          loading={busy === 'publishAll'}
          disabled={!!busy}
          onPress={() =>
            run('publishAll', async () => t('adminKids.publishedAll', { n: (await kidsAdminApi.publishAllVerses(language)).published }))
          }
        />
      ) : null}
      {verses === null ? <ActivityIndicator color={colors.gold} /> : null}
      {verses && !verses.length ? <Text variant="muted">{t('adminKids.noVerses')}</Text> : null}
      {verses?.length ? (
        <Card style={{ paddingVertical: 4 }}>
          {verses.map((v, i) => (
            <View key={v.id}>
              {i > 0 ? <Divider /> : null}
              <View style={{ paddingVertical: 10, gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <RNText style={{ flex: 1, color: colors.text, fontFamily: fonts.bodyBold }}>{v.reference}</RNText>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={v.status === 'published' ? t('adminKids.unpublish') : t('adminKids.publish')}
                    disabled={!!busy}
                    onPress={() => run(v.id, async () => void (await kidsAdminApi.updateVerse(v.id, { status: v.status === 'published' ? 'draft' : 'published' })))}
                    hitSlop={8}>
                    <RNText style={{ color: v.status === 'published' ? colors.success : colors.gold, fontFamily: fonts.bodyBold, fontSize: 13 }}>
                      {statusLabel(v.status)} · {v.status === 'published' ? t('adminKids.unpublish') : t('adminKids.publish')}
                    </RNText>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('adminKids.remove')}
                    disabled={!!busy}
                    onPress={() => run(v.id, async () => void (await kidsAdminApi.removeVerse(v.id)))}
                    hitSlop={8}>
                    <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
                  </Pressable>
                </View>
                <Text variant="small">
                  {levelLabel(v.level)} · {v.text}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

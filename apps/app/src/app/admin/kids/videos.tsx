import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text as RNText, View } from 'react-native';

import { Button, Card, Divider, Notice, Screen, Segmented, Text, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { kidsVideosApi, type KidsLevel, type KidsVideo } from '@/lib/admin-kids';
import { useTheme } from '@/theme';
import { fonts, radius } from '@/theme/tokens';

/** Abre o seletor de arquivos do navegador (o painel envia vídeos pelo computador). */
function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);

/** Vídeos do Kids: enviar (em pedaços), publicar, despublicar e apagar. */
export default function AdminKidsVideos() {
  const { t, errorMessage } = useI18n();
  const { colors } = useTheme();
  const [videos, setVideos] = useState<KidsVideo[] | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [poster, setPoster] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [language, setLanguage] = useState<'pt-BR' | 'en' | 'es'>('pt-BR');
  const [level, setLevel] = useState<KidsLevel>('both');
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(
    () =>
      kidsVideosApi
        .list()
        .then((r) => setVideos(r.videos))
        .catch((e) => setMessage({ kind: 'error', text: errorMessage(e) })),
    [errorMessage],
  );

  useEffect(() => {
    load();
  }, [load]);

  async function upload() {
    if (!file) return;
    setMessage(null);
    setProgress(0);
    try {
      await kidsVideosApi.upload(file, { title: title.trim(), description, language, level }, setProgress, poster);
      setMessage({ kind: 'success', text: t('adminKids.uploaded') });
      setFile(null);
      setPoster(null);
      setTitle('');
      setDescription('');
      await load();
    } catch (e) {
      setMessage({ kind: 'error', text: errorMessage(e) });
      await load();
    } finally {
      setProgress(null);
    }
  }

  async function run(id: string, action: () => Promise<unknown>) {
    setBusy(id);
    setMessage(null);
    try {
      await action();
      await load();
    } catch (e) {
      setMessage({ kind: 'error', text: errorMessage(e) });
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  }

  const statusLabel = (s: KidsVideo['status']) =>
    s === 'published'
      ? t('adminKids.statusPublished')
      : s === 'uploading'
        ? t('adminKids.incomplete')
        : s === 'review'
          ? t('adminKids.statusReview')
          : t('adminKids.statusDraft');

  if (Platform.OS !== 'web') {
    return (
      <Screen>
        <Notice>{t('adminKids.webOnly')}</Notice>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text variant="muted">{t('adminKids.videosHint')}</Text>
      {message ? <Notice kind={message.kind}>{message.text}</Notice> : null}

      <Card>
        <Button
          kind="secondary"
          icon="film-outline"
          title={file ? `${file.name} · ${t('adminKids.megabytes', { mb: mb(file.size) })}` : t('adminKids.pickVideo')}
          disabled={progress !== null}
          onPress={async () => {
            const picked = await pickFile('video/mp4,video/webm,video/quicktime');
            if (picked) {
              setFile(picked);
              if (!title.trim()) setTitle(picked.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '));
            }
          }}
        />
        <Button
          kind="ghost"
          icon="image-outline"
          title={poster ? poster.name : t('adminKids.pickPoster')}
          disabled={progress !== null}
          onPress={async () => setPoster(await pickFile('image/jpeg,image/png,image/webp'))}
        />
        <TextField label={t('adminKids.videoTitle')} value={title} onChangeText={setTitle} editable={progress === null} />
        <TextField label={t('adminKids.videoDescription')} value={description} onChangeText={setDescription} multiline editable={progress === null} />
        <Text variant="label">{t('adminKids.videoLanguage')}</Text>
        <Segmented
          value={language}
          onChange={setLanguage}
          options={[
            { value: 'pt-BR', label: 'Português' },
            { value: 'en', label: 'English' },
            { value: 'es', label: 'Español' },
          ]}
        />
        <Text variant="label">{t('adminKids.level')}</Text>
        <Segmented
          value={level}
          onChange={setLevel}
          options={[
            { value: 'small', label: t('adminKids.levelSmall') },
            { value: 'big', label: t('adminKids.levelBig') },
            { value: 'both', label: t('adminKids.levelBoth') },
          ]}
        />
        {progress !== null ? (
          <View style={{ gap: 6 }}>
            <View style={{ height: 12, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
              <View style={{ width: `${Math.round(progress * 100)}%`, height: '100%', backgroundColor: colors.gold }} />
            </View>
            <Text variant="small">{t('adminKids.uploading', { pct: Math.round(progress * 100) })}</Text>
          </View>
        ) : (
          <Button icon="cloud-upload-outline" title={t('adminKids.upload')} onPress={upload} disabled={!file || !title.trim()} />
        )}
      </Card>

      {videos === null ? <ActivityIndicator color={colors.gold} /> : null}
      {videos && !videos.length ? <Text variant="muted">{t('adminKids.noVideos')}</Text> : null}
      {videos?.length ? (
        <Card style={{ paddingVertical: 4 }}>
          {videos.map((v, i) => (
            <View key={v.id}>
              {i > 0 ? <Divider /> : null}
              <View style={{ paddingVertical: 10, gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name={v.has_poster ? 'image' : 'film'} size={18} color={colors.gold} />
                  <RNText style={{ flex: 1, color: colors.text, fontFamily: fonts.bodyBold }} numberOfLines={1}>
                    {v.title}
                  </RNText>
                  <RNText
                    style={{
                      color: v.status === 'published' ? colors.success : v.status === 'uploading' ? colors.danger : colors.textMuted,
                      fontFamily: fonts.bodyBold,
                      fontSize: 13,
                    }}>
                    {statusLabel(v.status)}
                  </RNText>
                </View>
                <Text variant="small">
                  {t('adminKids.megabytes', { mb: mb(v.size) })} · {v.language} · {v.level === 'small' ? t('adminKids.levelSmall') : v.level === 'big' ? t('adminKids.levelBig') : t('adminKids.levelBoth')}
                </Text>
                <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap' }}>
                  {v.status !== 'uploading' ? (
                    <Pressable
                      accessibilityRole="button"
                      disabled={!!busy}
                      onPress={() => run(v.id, () => kidsVideosApi.update(v.id, { status: v.status === 'published' ? 'draft' : 'published' }))}>
                      <RNText style={{ color: colors.gold, fontFamily: fonts.bodyBold }}>
                        {v.status === 'published' ? t('adminKids.unpublish') : t('adminKids.publish')}
                      </RNText>
                    </Pressable>
                  ) : null}
                  {v.status !== 'uploading' ? (
                    <Pressable
                      accessibilityRole="button"
                      disabled={!!busy}
                      onPress={async () => {
                        const picked = await pickFile('image/jpeg,image/png,image/webp');
                        if (picked) run(v.id, () => kidsVideosApi.setPoster(v.id, picked));
                      }}>
                      <RNText style={{ color: colors.gold, fontFamily: fonts.bodyBold }}>{t('adminKids.changePoster')}</RNText>
                    </Pressable>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    disabled={!!busy}
                    onPress={() => (confirm === v.id ? run(v.id, () => kidsVideosApi.remove(v.id)) : setConfirm(v.id))}>
                    <RNText style={{ color: colors.danger, fontFamily: fonts.bodyBold }}>
                      {confirm === v.id ? t('adminKids.removeAgain') : t('adminKids.removeVideo')}
                    </RNText>
                  </Pressable>
                  {busy === v.id ? <ActivityIndicator size="small" color={colors.gold} /> : null}
                </View>
              </View>
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Text as RNText, View } from 'react-native';

import { Button, Card, Divider, ListItem, Notice, Screen, Segmented, Text, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { useSession } from '@/lib/session';
import { KINDS, sermonApi, type Kind, type SermonSummary } from '@/lib/sermons';
import { useTheme } from '@/theme';
import { fonts, radius } from '@/theme/tokens';

export default function SermonsTab() {
  const { t, locale, errorMessage } = useI18n();
  const { colors } = useTheme();
  // Gerar ministração com IA é exclusivo do administrador
  const isAdmin = !!useSession().user?.roles.includes('admin');
  const [view, setView] = useState<'all' | 'trash'>('all');
  const [q, setQ] = useState('');
  const [folder, setFolder] = useState<string | null>(null);
  // Filtro por tipo de ministração (expositiva, temática...): vários podem ficar marcados
  const [kinds, setKinds] = useState<Kind[]>([]);
  const [items, setItems] = useState<SermonSummary[] | null>(null);
  const [folders, setFolders] = useState<string[]>([]);
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    sermonApi
      .list(q, folder, view === 'trash')
      .then((r) => {
        setItems(r.sermons);
        if (view === 'all' && !folder) setFolders(r.folders);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [q, folder, view, errorMessage]);

  useFocusEffect(load);

  async function create(kind: Kind) {
    try {
      const s = await sermonApi.create({ kind, use_template: true });
      setChoosing(false);
      // Ministração nova já abre para escrever
      router.push({ pathname: '/sermon/[id]', params: { id: s.id, edit: '1' } });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const toggleKind = (k: Kind) => setKinds((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
  const shown = items && view === 'all' && kinds.length ? items.filter((s) => kinds.includes(s.kind)) : items;

  return (
    <Screen>
      <Text variant="title">{t('sermons.title')}</Text>
      {error ? <Notice kind="error">{error}</Notice> : null}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button icon="add" title={t('sermons.new')} onPress={() => setChoosing((v) => !v)} />
        </View>
        {isAdmin ? (
          <View style={{ flex: 1 }}>
            <Button kind="secondary" icon="sparkles-outline" title={t('sermons.generate')} onPress={() => router.push('/sermon/generate')} />
          </View>
        ) : null}
      </View>

      {/* Agenda e telão da igreja */}
      <Card style={{ paddingVertical: 4 }}>
        <ListItem icon="calendar-outline" title={t('agenda.title')} subtitle={t('agenda.short')} onPress={() => router.push('/agenda')} />
        <Divider />
        <ListItem icon="tv-outline" title={t('screen.share')} subtitle={t('screen.tabHint')} onPress={() => router.push('/share-screen')} />
      </Card>

      {choosing ? (
        <Card>
          <Text variant="label">{t('sermons.chooseKind')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {KINDS.map((k) => (
              <Pressable
                key={k}
                accessibilityRole="button"
                onPress={() => create(k)}
                style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 }}>
                <RNText style={{ color: colors.text, fontFamily: fonts.bodyMedium }}>{t(`sermons.kinds.${k}`)}</RNText>
              </Pressable>
            ))}
          </View>
        </Card>
      ) : null}

      <Segmented
        value={view}
        onChange={(v) => {
          setItems(null);
          setView(v);
        }}
        options={[
          { value: 'all', label: t('sermons.mine') },
          { value: 'trash', label: t('sermons.trash') },
        ]}
      />
      <TextField label={t('sermons.search')} value={q} onChangeText={setQ} onSubmitEditing={load} returnKeyType="search" />
      {folders.length && view === 'all' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[null, ...folders].map((f) => {
            const active = f === folder;
            return (
              <Pressable
                key={f ?? '__all'}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                onPress={() => setFolder(f)}
                style={{
                  flexDirection: 'row',
                  gap: 4,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: active ? colors.gold : colors.border,
                  backgroundColor: active ? colors.gold : 'transparent',
                  borderRadius: radius.pill,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                }}>
                <Ionicons name="folder-outline" size={14} color={active ? colors.onGold : colors.textMuted} />
                <RNText style={{ color: active ? colors.onGold : colors.text, fontFamily: fonts.body }}>{f ?? t('sermons.allFolders')}</RNText>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {view === 'all' ? (
        <View style={{ gap: 6 }}>
          <Text variant="label">{t('sermons.filterKind')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[null, ...KINDS].map((k) => {
              const active = k === null ? kinds.length === 0 : kinds.includes(k);
              const count = items ? (k === null ? items.length : items.filter((s) => s.kind === k).length) : null;
              return (
                <Pressable
                  key={k ?? '__all'}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: active }}
                  onPress={() => (k === null ? setKinds([]) : toggleKind(k))}
                  style={{
                    flexDirection: 'row',
                    gap: 6,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: active ? colors.gold : colors.border,
                    backgroundColor: active ? colors.gold : 'transparent',
                    borderRadius: radius.pill,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                  }}>
                  <Ionicons name={active ? 'checkbox' : 'square-outline'} size={15} color={active ? colors.onGold : colors.textMuted} />
                  <RNText style={{ color: active ? colors.onGold : colors.text, fontFamily: fonts.body }}>
                    {k === null ? t('sermons.allKinds') : t(`sermons.kinds.${k}`)}
                    {count !== null ? ` (${count})` : ''}
                  </RNText>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {shown === null ? <ActivityIndicator color={colors.gold} /> : null}
      {shown?.length === 0 ? <Text variant="muted">{view === 'trash' ? t('sermons.emptyTrash') : kinds.length ? t('sermons.emptyFilter') : t('sermons.empty')}</Text> : null}
      {shown?.length ? (
        <Card style={{ paddingVertical: 4 }}>
          {shown.map((s, i) => (
            <View key={s.id}>
              {i > 0 ? <Divider /> : null}
              <Pressable
                accessibilityRole="button"
                onPress={() => (view === 'trash' ? undefined : router.push({ pathname: '/sermon/[id]', params: { id: s.id } }))}
                style={{ paddingVertical: 12, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <Ionicons name="document-text-outline" size={22} color={colors.gold} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="heading" numberOfLines={1}>
                    {s.title}
                  </Text>
                  <Text variant="small" numberOfLines={1}>
                    {[s.main_reference, t(`sermons.kinds.${s.kind}`), s.scheduled_for ? new Date(`${s.scheduled_for}T12:00:00`).toLocaleDateString(locale) : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                {view === 'trash' ? (
                  <RNText style={{ color: colors.gold, fontFamily: fonts.bodyMedium }} onPress={() => sermonApi.restore(s.id).then(load)}>
                    {t('sermons.restore')}
                  </RNText>
                ) : (
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                )}
              </Pressable>
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

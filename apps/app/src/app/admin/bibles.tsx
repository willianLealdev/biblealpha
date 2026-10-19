import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text as RNText, View } from 'react-native';

import { Button, Card, Checkbox, Divider, Notice, Screen, Text, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { biblesApi, type AdminBible, type BulkStatus, type CatalogItem } from '@/lib/admin-content';
import { useTheme } from '@/theme';
import { fonts, radius } from '@/theme/tokens';

function confirmAction(message: string) {
  // Navegador: confirmação nativa; no celular a ação é direta (o botão já é explícito)
  return Platform.OS === 'web' ? (globalThis.confirm?.(message) ?? true) : true;
}

export default function AdminBibles() {
  const { t, errorMessage } = useI18n();
  const { colors } = useTheme();
  const [installed, setInstalled] = useState<AdminBible[] | null>(null);
  const [message, setMessage] = useState<{
    kind: 'success' | 'error';
    text: string;
  } | null>(null);
  const [language, setLanguage] = useState('');
  const [q, setQ] = useState('');
  const [fullOnly, setFullOnly] = useState(true);
  const [catalog, setCatalog] = useState<{
    items: CatalogItem[];
    total: number;
  } | null>(null);
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [bulk, setBulk] = useState<BulkStatus | null>(null);

  const load = useCallback(() => {
    biblesApi
      .list()
      .then((r) => setInstalled(r.translations))
      .catch((e) => setMessage({ kind: 'error', text: errorMessage(e) }));
  }, [errorMessage]);

  useEffect(load, [load]);

  // Progresso da importação do catálogo inteiro (atualiza enquanto estiver rodando)
  useEffect(() => {
    let alive = true;
    const tick = () =>
      biblesApi
        .importAllStatus()
        .then((st) => {
          if (!alive) return;
          setBulk(st);
          if (st.running) load();
        })
        .catch(() => {});
    tick();
    const timer = setInterval(tick, 10_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [load]);

  async function search() {
    setSearching(true);
    setMessage(null);
    try {
      setCatalog(await biblesApi.catalog({ q, language, full_only: fullOnly }));
    } catch (e) {
      setMessage({ kind: 'error', text: errorMessage(e) });
    } finally {
      setSearching(false);
    }
  }

  async function run(action: () => Promise<unknown>, success?: string) {
    setMessage(null);
    try {
      await action();
      if (success) setMessage({ kind: 'success', text: success });
      load();
    } catch (e) {
      setMessage({ kind: 'error', text: errorMessage(e) });
    }
  }

  async function importItem(item: CatalogItem) {
    setImporting(item.id);
    await run(
      async () => {
        await biblesApi.import(item.id);
        if (catalog) {
          setCatalog({
            ...catalog,
            items: catalog.items.map((x) => (x.id === item.id ? { ...x, imported_as: item.id.toLowerCase() } : x)),
          });
        }
      },
      t('admin.imported', { name: item.title }),
    );
    setImporting(null);
  }

  const badge = (label: string, tone: 'gold' | 'muted' | 'danger') => (
    <View
      style={{
        borderRadius: radius.pill,
        paddingHorizontal: 8,
        paddingVertical: 2,
        backgroundColor: tone === 'gold' ? colors.gold : 'transparent',
        borderWidth: tone === 'gold' ? 0 : 1,
        borderColor: tone === 'danger' ? colors.danger : colors.border,
      }}>
      <RNText
        style={{
          fontFamily: fonts.bodyMedium,
          fontSize: 12,
          color: tone === 'gold' ? colors.onGold : tone === 'danger' ? colors.danger : colors.textMuted,
        }}>
        {label}
      </RNText>
    </View>
  );

  const link = (label: string, onPress: () => void, danger = false) => (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <RNText
        style={{
          color: danger ? colors.danger : colors.gold,
          fontFamily: fonts.bodyMedium,
          fontSize: 14,
        }}>
        {label}
      </RNText>
    </Pressable>
  );

  return (
    <Screen>
      <Text variant="muted">{t('admin.biblesHint')}</Text>
      {message ? <Notice kind={message.kind}>{message.text}</Notice> : null}

      <Card>
        <Text variant="heading">{t('admin.importAll')}</Text>
        <Text variant="small">{t('admin.importAllHint')}</Text>
        {bulk?.total !== undefined ? (
          <Text variant="body">
            {t(bulk.running ? 'admin.importAllRunning' : 'admin.importAllDone', {
              done: bulk.done ?? 0,
              total: bulk.total ?? 0,
              imported: bulk.imported ?? 0,
              failed: bulk.failed?.length ?? 0,
              current: bulk.current ?? '—',
            })}
          </Text>
        ) : null}
        {bulk?.running ? (
          <ActivityIndicator color={colors.gold} />
        ) : (
          <View style={{ gap: 8 }}>
            <Button
              icon="earth-outline"
              title={t('admin.importAll')}
              onPress={() =>
                run(async () => {
                  await biblesApi.importAll();
                  setBulk((b) => ({ ...b, running: true }));
                })
              }
            />
            <Button
              kind="secondary"
              icon="refresh"
              title={t('admin.updateAll')}
              onPress={() =>
                run(async () => {
                  await biblesApi.importAll(true);
                  setBulk((b) => ({ ...b, running: true }));
                })
              }
            />
          </View>
        )}
      </Card>

      <Text variant="heading">{t('admin.installed')}</Text>
      {installed === null ? <ActivityIndicator color={colors.gold} /> : null}
      {installed?.length ? (
        <Card style={{ paddingVertical: 4 }}>
          {installed.map((b, i) => (
            <View key={b.code} style={{ paddingVertical: 12, gap: 6 }}>
              {i > 0 ? <Divider /> : null}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                }}>
                <RNText
                  style={{
                    color: colors.text,
                    fontFamily: fonts.bodyBold,
                    fontSize: 16,
                  }}>
                  {b.name} ({b.abbreviation})
                </RNText>
                {b.is_default ? badge(t('admin.isDefault'), 'gold') : null}
                {!b.is_active ? badge(t('admin.inactive'), 'danger') : null}
                {b.books ? badge(t('admin.partialBadge', { n: b.books.length }), 'muted') : null}
              </View>
              <Text variant="small">
                {b.language}
                {b.language_name ? ` (${b.language_name})` : ''} · {b.license} · {t('admin.verses', { n: b.verse_count.toLocaleString() })}
              </Text>
              <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap' }}>
                {b.is_active && !b.is_default ? link(t('admin.makeDefault'), () => run(() => biblesApi.setDefault(b.code))) : null}
                {link(b.is_active ? t('admin.deactivate') : t('admin.activate'), () =>
                  run(() => biblesApi.update(b.code, { is_active: !b.is_active })),
                )}
                {b.ebible_id
                  ? link(
                      t('admin.remove'),
                      () => {
                        if (confirmAction(t('admin.removeConfirm', { name: b.name }))) run(() => biblesApi.remove(b.code));
                      },
                      true,
                    )
                  : null}
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      <Text variant="heading">{t('admin.catalog')}</Text>
      <Text variant="small">{t('admin.catalogHint')}</Text>
      <TextField
        label={t('admin.languageFilter')}
        value={language}
        onChangeText={setLanguage}
        autoCapitalize="none"
        onSubmitEditing={search}
      />
      <TextField label={t('admin.searchCatalog')} value={q} onChangeText={setQ} onSubmitEditing={search} returnKeyType="search" />
      <Checkbox checked={fullOnly} onChange={setFullOnly}>
        <Text variant="body">{t('admin.fullOnly')}</Text>
      </Checkbox>
      <Button icon="search" title={t('admin.search')} onPress={search} loading={searching} />

      {catalog ? <Text variant="small">{t('admin.catalogTotal', { n: catalog.total })}</Text> : null}
      {catalog?.items.map((item) => (
        <Card key={item.id}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
            }}>
            <RNText
              style={{
                color: colors.text,
                fontFamily: fonts.bodyBold,
                fontSize: 16,
                flexShrink: 1,
              }}>
              {item.title}
            </RNText>
            {item.public_domain ? badge(t('admin.publicDomain'), 'gold') : null}
          </View>
          <Text variant="small">
            {item.language_name_en} ({item.language_code}) · {item.id} · {t('admin.bookCount', { ot: item.ot_books, nt: item.nt_books })}
          </Text>
          {item.description ? <Text variant="muted">{item.description}</Text> : null}
          {!item.public_domain ? <Text variant="small">{item.copyright}</Text> : null}
          {item.imported_as ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <Text variant="small">{t('admin.alreadyInstalled')}</Text>
            </View>
          ) : importing === item.id ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ActivityIndicator color={colors.gold} />
              <Text variant="small">{t('admin.importing')}</Text>
            </View>
          ) : (
            <Button
              kind="secondary"
              icon="cloud-download-outline"
              title={t('admin.importBible')}
              disabled={!!importing}
              onPress={() => importItem(item)}
            />
          )}
        </Card>
      ))}
    </Screen>
  );
}

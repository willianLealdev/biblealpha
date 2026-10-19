import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text as RNText, View } from 'react-native';

import { Button, Card, Divider, Notice, Screen, Text, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import en from '@/i18n/en';
import { languagesApi, type AdminLanguage } from '@/lib/admin-content';
import { useTheme } from '@/theme';
import { fonts } from '@/theme/tokens';

export default function AdminLanguages() {
  const { t, errorMessage } = useI18n();
  const { colors } = useTheme();
  const [builtin, setBuiltin] = useState<AdminLanguage[]>([]);
  const [items, setItems] = useState<AdminLanguage[] | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(() => {
    languagesApi
      .list()
      .then((r) => {
        setBuiltin(r.builtin);
        setItems(r.items);
      })
      .catch((e) => setMessage({ kind: 'error', text: errorMessage(e) }));
  }, [errorMessage]);

  useEffect(load, [load]);

  async function create() {
    setMessage(null);
    setCreating(true);
    try {
      // O app envia os próprios textos em inglês; a IA traduz no servidor
      const r = await languagesApi.create({ code: code.trim(), name: name.trim(), source: en });
      setMessage({ kind: 'success', text: t('admin.translatedResult', { n: r.translated, total: r.total }) });
      setCode('');
      setName('');
      load();
    } catch (e) {
      setMessage({ kind: 'error', text: errorMessage(e) });
    } finally {
      setCreating(false);
    }
  }

  async function run(action: () => Promise<unknown>) {
    setMessage(null);
    try {
      await action();
      load();
    } catch (e) {
      setMessage({ kind: 'error', text: errorMessage(e) });
    }
  }

  const link = (label: string, onPress: () => void, danger = false) => (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <RNText style={{ color: danger ? colors.danger : colors.gold, fontFamily: fonts.bodyMedium, fontSize: 14 }}>{label}</RNText>
    </Pressable>
  );

  return (
    <Screen>
      <Text variant="muted">{t('admin.languagesHint')}</Text>
      {message ? <Notice kind={message.kind}>{message.text}</Notice> : null}

      <Text variant="heading">{t('admin.builtinLanguages')}</Text>
      <Text variant="body">{builtin.map((l) => `${l.name} (${l.code})`).join(' · ')}</Text>

      <Text variant="heading">{t('admin.customLanguages')}</Text>
      {items === null ? <ActivityIndicator color={colors.gold} /> : null}
      {items?.length === 0 ? <Text variant="muted">{t('admin.noCustom')}</Text> : null}
      {items?.length ? (
        <Card style={{ paddingVertical: 4 }}>
          {items.map((l, i) => (
            <View key={l.code} style={{ paddingVertical: 12, gap: 6 }}>
              {i > 0 ? <Divider /> : null}
              <RNText style={{ color: colors.text, fontFamily: fonts.bodyBold, fontSize: 16 }}>
                {l.name} ({l.code})
              </RNText>
              <Text variant="small">
                {l.enabled ? t('admin.enabled') : t('admin.disabled')} · {t('admin.langKeys', { n: l.keys ?? 0 })} · {t('admin.version', { n: l.version })}
              </Text>
              <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap' }}>
                {link(l.enabled ? t('admin.disable') : t('admin.enable'), () => run(() => languagesApi.update(l.code, { enabled: !l.enabled })))}
                {link(t('admin.reviewTexts'), () => router.push({ pathname: '/admin/languages/[code]', params: { code: l.code } }))}
                {link(
                  t('admin.remove'),
                  () => {
                    const ok = Platform.OS === 'web' ? globalThis.confirm?.(`${t('admin.remove')} ${l.name}?`) ?? true : true;
                    if (ok) run(() => languagesApi.remove(l.code));
                  },
                  true,
                )}
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      <Text variant="heading">{t('admin.addLanguage')}</Text>
      <Card>
        <TextField label={t('admin.langCode')} value={code} onChangeText={setCode} autoCapitalize="none" />
        <TextField label={t('admin.langName')} value={name} onChangeText={setName} />
        {creating ? (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <ActivityIndicator color={colors.gold} />
            <Text variant="small">{t('admin.translating')}</Text>
          </View>
        ) : (
          <Button icon="language-outline" title={t('admin.translateAI')} onPress={create} disabled={code.trim().length < 2 || name.trim().length < 2} />
        )}
      </Card>
    </Screen>
  );
}

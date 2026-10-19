import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';

import { Button, Card, Divider, ListItem, Notice, Screen, Segmented, Text, TextField } from '@/components/ui';
import { CountryField, LanguageField } from '@/components/world-picker';
import { useI18n } from '@/i18n';
import { meApi, type Locale } from '@/lib/api';
import { saveJsonFile } from '@/lib/files';
import { loadWorld, type World } from '@/lib/world';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme';
import type { ThemeMode } from '@/theme/tokens';

export default function Profile() {
  const { user, setUser, signOut } = useSession();
  const { mode, setMode, colors } = useTheme();
  const { t, locale, setLocale, errorMessage, preparing } = useI18n();
  const [name, setName] = useState(user?.name ?? '');
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [world, setWorld] = useState<World | null>(null);

  useEffect(() => {
    loadWorld().then(setWorld).catch(() => {});
  }, []);

  if (!user) return null;

  async function changeTheme(next: ThemeMode) {
    setMode(next);
    try {
      const preferences = await meApi.updatePreferences({ theme: next });
      setUser({ ...user!, preferences });
    } catch (e) {
      setMessage({ kind: 'error', text: errorMessage(e) });
    }
  }

  async function changeCountry(next: string) {
    try {
      setUser(await meApi.update({ country: next }));
    } catch (e) {
      setMessage({ kind: 'error', text: errorMessage(e) });
    }
  }

  async function changeLocale(next: Locale) {
    setLocale(next);
    try {
      setUser(await meApi.update({ locale: next }));
    } catch (e) {
      setMessage({ kind: 'error', text: errorMessage(e) });
    }
  }

  async function saveName() {
    if (!name.trim()) return;
    setSavingName(true);
    try {
      setUser(await meApi.update({ name: name.trim() }));
      setMessage({ kind: 'success', text: t('common.saved') });
    } catch (e) {
      setMessage({ kind: 'error', text: errorMessage(e) });
    } finally {
      setSavingName(false);
    }
  }

  async function exportData() {
    setExporting(true);
    try {
      const data = await meApi.exportData();
      await saveJsonFile('biblealpha-meus-dados.json', data);
      setMessage({ kind: 'success', text: t('profile.exportDone') });
    } catch (e) {
      setMessage({ kind: 'error', text: errorMessage(e) });
    } finally {
      setExporting(false);
    }
  }

  return (
    <Screen>
      <Text variant="title">{t('profile.title')}</Text>
      <Card>
        <Text variant="heading">{user.name}</Text>
        <Text variant="muted">{user.email}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="small">{user.plan === 'pro' ? t('pro.supporterName') : t('pro.freeTitle')}</Text>
          <Text variant="label" style={{ color: colors.gold }} onPress={() => router.push('/pro')} accessibilityRole="link">
            {user.plan === 'pro' ? t('pro.manage') : t('pro.learnMore')}
          </Text>
        </View>
        {user.email_verified ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="checkmark-circle" size={16} color={colors.success} />
            <Text variant="small">{t('profile.verified')}</Text>
          </View>
        ) : null}
      </Card>

      {message ? <Notice kind={message.kind}>{message.text}</Notice> : null}

      <Text variant="heading">{t('profile.appearance')}</Text>
      <Segmented<ThemeMode>
        value={mode}
        onChange={changeTheme}
        options={[
          { value: 'dark', label: t('profile.themeDark') },
          { value: 'light', label: t('profile.themeLight') },
          { value: 'system', label: t('profile.themeSystem') },
        ]}
      />

      <Text variant="heading">{t('profile.language')}</Text>
      {world ? (
        <Card>
          <CountryField world={world} value={user.country ?? null} onChange={changeCountry} />
          <LanguageField world={world} country={user.country ?? null} value={preparing ?? locale} onChange={changeLocale} />
          {preparing ? (
            <Notice>{t('world.preparing', { name: world.languages.find((l) => l.code === preparing)?.name ?? preparing })}</Notice>
          ) : null}
        </Card>
      ) : null}

      <Text variant="heading">{t('profile.account')}</Text>
      <Card>
        <TextField label={t('profile.editName')} value={name} onChangeText={setName} autoComplete="name" />
        {name.trim() && name.trim() !== user.name ? (
          <Button kind="secondary" title={t('common.save')} onPress={saveName} loading={savingName} />
        ) : null}
      </Card>
      <Card style={{ paddingVertical: 4 }}>
        <ListItem icon="phone-portrait-outline" title={t('profile.sessions')} onPress={() => router.push('/profile/sessions')} />
        <Divider />
        <ListItem icon="key-outline" title={t('profile.changePassword')} onPress={() => router.push('/profile/password')} />
        <Divider />
        <ListItem
          icon="download-outline"
          title={t('profile.exportData')}
          subtitle={exporting ? t('common.loading') : undefined}
          onPress={exporting ? undefined : exportData}
        />
        <Divider />
        <ListItem icon="document-text-outline" title={t('profile.legal')} onPress={() => router.push('/legal/terms')} />
        {user.roles.includes('admin') ? (
          <>
            <Divider />
            <ListItem icon="speedometer-outline" title={t('profile.admin')} onPress={() => router.push('/admin')} />
          </>
        ) : null}
        <Divider />
        <ListItem
          icon="trash-outline"
          title={t('profile.deleteAccount')}
          danger
          onPress={() => router.push('/profile/delete-account')}
        />
      </Card>

      <Button kind="secondary" icon="log-out-outline" title={t('profile.signOut')} onPress={signOut} />
      <Text variant="small" style={{ textAlign: 'center' }}>
        BibleAlpha · {Platform.OS === 'web' ? 'Web' : Platform.OS}
      </Text>
    </Screen>
  );
}

import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Share, View } from 'react-native';

import { StatusChips, useAgo } from '@/components/account-bits';
import { Button, Card, Divider, Notice, Screen, Text, TextField } from '@/components/ui';
import { useI18n, type TranslationKey } from '@/i18n';
import { accountsApi, type AccountReport } from '@/lib/admin';
import { useTheme } from '@/theme';


type Pending = 'block' | 'unblock' | 'unlock' | 'email' | 'temporary' | 'revokeAll' | null;

export default function AdminAccount() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale, errorMessage } = useI18n();
  const { colors } = useTheme();
  const ago = useAgo();
  const [data, setData] = useState<AccountReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [temp, setTemp] = useState<string | null>(null);

  const load = useCallback(() => {
    accountsApi
      .report(id)
      .then((r) => {
        setData(r);
        setError(null);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [id, errorMessage]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load]);

  if (!data) return <Screen center>{error ? <Notice kind="error">{error}</Notice> : <ActivityIndicator color={colors.gold} />}</Screen>;

  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleString(locale) : '—');
  const brl = (v: number) => v.toLocaleString(locale, { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
  const { user, status, security, usage } = data;

  async function run() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    setDone(null);
    setTemp(null);
    try {
      if (pending === 'block') await accountsApi.block(id, reason.trim());
      else if (pending === 'unblock') await accountsApi.unblock(id);
      else if (pending === 'unlock') await accountsApi.unlock(id);
      else if (pending === 'revokeAll') await accountsApi.revokeAll(id);
      else {
        const r = await accountsApi.password(id, pending);
        if (r.password) setTemp(r.password);
      }
      setDone(t(`adminUsers.done.${pending}`));
      setPending(null);
      setReason('');
      load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const row = (label: string, value: string) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6 }}>
      <Text variant="small">{label}</Text>
      <Text variant="body" style={{ flexShrink: 1, textAlign: 'right' }}>
        {value}
      </Text>
    </View>
  );

  async function share() {
    const lines = [
      `${user.name ?? ''} <${user.email}>`,
      `${t('adminUsers.r.created')}: ${date(user.created_at)}`,
      `${t('adminUsers.r.lastSeen')}: ${date(user.last_seen_at)}`,
      `${t('adminUsers.r.lastLogin')}: ${date(user.last_login_at)}`,
      `${t('adminUsers.r.logins')}: ${security.logins} · ${t('adminUsers.r.failed')}: ${security.failed_logins}`,
      `${t('adminUsers.r.plan')}: ${data!.plan.toUpperCase()}`,
      `${t('adminUsers.r.ai')}: ${usage.ai_requests} (${brl(usage.ai_cost_brl)})`,
      '',
      ...data!.sessions.map(
        (s) => `${s.open ? '●' : '○'} ${s.device ?? s.client} · ${s.ip ?? '—'} · ${date(s.last_used_at)}`,
      ),
    ];
    const text = lines.join('\n');
    if (Platform.OS === 'web') {
      try {
        await navigator.clipboard.writeText(text);
        setDone(t('adminUsers.copied'));
      } catch {
        setError(text);
      }
    } else {
      Share.share({ message: text }).catch(() => {});
    }
  }

  const confirmTitle = pending ? t(`adminUsers.confirm.${pending}`) : '';

  return (
    <Screen>
      {error ? <Notice kind="error">{error}</Notice> : null}
      {done ? <Notice kind="success">{done}</Notice> : null}
      {temp ? (
        <Card>
          <Text variant="label">{t('adminUsers.tempTitle')}</Text>
          <Text variant="heading" selectable>
            {temp}
          </Text>
          <Text variant="small">{t('adminUsers.tempHint')}</Text>
        </Card>
      ) : null}

      <Card style={{ gap: 6 }}>
        <Text variant="heading">{user.name ?? user.email}</Text>
        <Text variant="muted">{user.email}</Text>
        <StatusChips row={{ online: status.online, blocked: status.blocked, locked: status.locked, verified: !!user.email_verified_at, plan: data.plan }} />
        {user.blocked_at ? (
          <Text variant="small">
            {t('adminUsers.blockedSince', { date: date(user.blocked_at) })}
            {user.blocked_reason ? ` — ${user.blocked_reason}` : ''}
          </Text>
        ) : null}
      </Card>

      <Text variant="heading">{t('adminUsers.actions')}</Text>
      <View style={{ gap: 8 }}>
        {user.roles.includes('admin') ? null : status.blocked ? (
          <Button icon="lock-open-outline" title={t('adminUsers.unblock')} onPress={() => setPending('unblock')} />
        ) : (
          <Button kind="danger" icon="ban-outline" title={t('adminUsers.block')} onPress={() => setPending('block')} />
        )}
        <Button
          kind="secondary"
          icon="key-outline"
          title={t('adminUsers.unlock')}
          disabled={!status.locked && status.attempts === 0}
          onPress={() => setPending('unlock')}
        />
        <Button kind="secondary" icon="mail-outline" title={t('adminUsers.resetEmail')} onPress={() => setPending('email')} />
        <Button kind="secondary" icon="refresh-outline" title={t('adminUsers.resetTemp')} onPress={() => setPending('temporary')} />
        <Button kind="secondary" icon="log-out-outline" title={t('adminUsers.revokeAll')} onPress={() => setPending('revokeAll')} />
        <Button kind="ghost" icon="copy-outline" title={t('adminUsers.copyReport')} onPress={share} />
      </View>

      {pending ? (
        <Card style={{ gap: 10, borderColor: colors.gold, borderWidth: 1.5 }}>
          <Text variant="label">{confirmTitle}</Text>
          {pending === 'block' ? (
            <TextField label={t('adminUsers.reason')} value={reason} onChangeText={setReason} maxLength={300} />
          ) : null}
          <Button kind={pending === 'block' ? 'danger' : 'primary'} title={t('adminUsers.confirmBtn')} loading={busy} onPress={run} />
          <Button kind="ghost" title={t('adminUsers.cancel')} onPress={() => setPending(null)} />
        </Card>
      ) : null}

      <Text variant="heading">{t('adminUsers.r.access')}</Text>
      <Card style={{ paddingVertical: 4 }}>
        {row(t('adminUsers.r.lastSeen'), status.online ? t('adminUsers.online') : `${ago(user.last_seen_at)} (${date(user.last_seen_at)})`)}
        <Divider />
        {row(t('adminUsers.r.lastLogin'), date(user.last_login_at))}
        <Divider />
        {row(t('adminUsers.r.created'), date(user.created_at))}
        <Divider />
        {row(t('adminUsers.r.verified'), user.email_verified_at ? date(user.email_verified_at) : t('adminUsers.no'))}
        <Divider />
        {row(t('adminUsers.r.country'), user.country ?? '—')}
        <Divider />
        {row(t('adminUsers.r.language'), user.locale)}
        <Divider />
        {row(t('adminUsers.r.plan'), `${data.plan.toUpperCase()}${data.subscription ? ` · ${data.subscription.source}` : ''}`)}
      </Card>

      <Text variant="heading">{t('adminUsers.r.security')}</Text>
      <Card style={{ paddingVertical: 4 }}>
        {row(t('adminUsers.r.logins'), String(security.logins))}
        <Divider />
        {row(t('adminUsers.r.failed'), String(security.failed_logins))}
        <Divider />
        {row(t('adminUsers.r.attempts'), `${status.attempts}/${status.attempt_limit} (${t('adminUsers.r.minutes', { n: status.window_minutes })})`)}
        <Divider />
        {row(t('adminUsers.r.lastFailed'), date(security.last_failed_at))}
        <Divider />
        {row(t('adminUsers.r.resets'), String(security.password_resets))}
        {security.terms.map((x) => (
          <View key={`${x.document}-${x.version}`}>
            <Divider />
            {row(`${t('adminUsers.r.accepted')} ${x.document} v${x.version}`, date(x.at))}
          </View>
        ))}
      </Card>

      <Text variant="heading">{t('adminUsers.r.usage')}</Text>
      <Card style={{ paddingVertical: 4 }}>
        {row(t('adminUsers.r.sermons'), String(usage.sermons))}
        <Divider />
        {row(t('adminUsers.r.notes'), String(usage.annotations))}
        <Divider />
        {row(t('adminUsers.r.highlights'), String(usage.highlights))}
        <Divider />
        {row(t('adminUsers.r.bookmarks'), String(usage.bookmarks))}
        <Divider />
        {row(t('adminUsers.r.plans'), String(usage.reading_plans))}
        <Divider />
        {row(t('adminUsers.r.chats'), String(usage.ai_conversations))}
        <Divider />
        {row(t('adminUsers.r.ai'), `${usage.ai_requests} · ${t('adminUsers.r.thisMonth', { n: usage.ai_requests_month })} · ${brl(usage.ai_cost_brl)}`)}
        <Divider />
        {row(t('adminUsers.r.aiLast'), date(usage.ai_last_at))}
      </Card>

      <Text variant="heading">{t('adminUsers.r.devices')}</Text>
      <Card style={{ paddingVertical: 4 }}>
        {data.sessions.length ? (
          data.sessions.map((s, i) => (
            <View key={s.id}>
              {i > 0 ? <Divider /> : null}
              <View style={{ paddingVertical: 10, gap: 3 }}>
                <Text variant="label">
                  {s.open ? '● ' : '○ '}
                  {s.device ?? (s.client === 'web' ? t('adminUsers.r.web') : t('adminUsers.r.app'))}
                  {s.trusted ? ` · ${t('adminUsers.r.trusted')}` : ''}
                </Text>
                <Text variant="small">
                  IP {s.ip ?? '—'} · {t('adminUsers.r.lastSeen')}: {date(s.last_used_at)}
                </Text>
                <Text variant="small">
                  {t('adminUsers.r.since')}: {date(s.created_at)}
                  {s.open ? ` · ${t('adminUsers.r.expires')}: ${date(s.expires_at)}` : s.revoked_reason ? ` · ${s.revoked_reason}` : ''}
                </Text>
                {s.user_agent ? (
                  <Text variant="small" numberOfLines={1}>
                    {s.user_agent}
                  </Text>
                ) : null}
                {s.open ? (
                  <Button
                    kind="ghost"
                    title={t('adminUsers.endSession')}
                    onPress={() =>
                      accountsApi
                        .revokeSession(id, s.id)
                        .then(load)
                        .catch((e) => setError(errorMessage(e)))
                    }
                  />
                ) : null}
              </View>
            </View>
          ))
        ) : (
          <Text variant="small">—</Text>
        )}
      </Card>

      <Text variant="heading">{t('adminUsers.r.events')}</Text>
      <Card style={{ paddingVertical: 4 }}>
        {data.events.length ? (
          data.events.map((e, i) => (
            <View key={i}>
              {i > 0 ? <Divider /> : null}
              <View style={{ paddingVertical: 8 }}>
                <Text variant="label">{eventName(e.action, t)}</Text>
                <Text variant="small">
                  {date(e.at)}
                  {e.ip ? ` · IP ${e.ip}` : ''}
                </Text>
              </View>
            </View>
          ))
        ) : (
          <Text variant="small">—</Text>
        )}
      </Card>
    </Screen>
  );
}

const KNOWN_EVENTS = [
  'auth.login',
  'auth.login_failed',
  'auth.login_blocked',
  'auth.logout',
  'auth.password_reset',
  'auth.password_reset_requested',
  'auth.password_changed',
  'auth.session_revoked',
  'auth.other_sessions_revoked',
  'auth.refresh_reuse_detected',
  'user.email_verified',
  'user.registered',
] as const;

function eventName(action: string, t: (k: TranslationKey) => string): string {
  if (!(KNOWN_EVENTS as readonly string[]).includes(action)) return action;
  return t(`adminUsers.event.${action.replace('.', '_')}` as TranslationKey);
}

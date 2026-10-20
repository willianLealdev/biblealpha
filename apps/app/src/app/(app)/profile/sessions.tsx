import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator } from 'react-native';

import { Button, Card, Divider, ListItem, Notice, Screen, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { meApi, type SessionInfo } from '@/lib/api';
import { useTheme } from '@/theme';

function describeAgent(agent: string | null): string {
  if (!agent) return '';
  const os = /Android/.test(agent) ? 'Android' : /iPhone|iPad|iOS/.test(agent) ? 'iOS' : /Windows/.test(agent) ? 'Windows' : /Mac OS/.test(agent) ? 'macOS' : /Linux/.test(agent) ? 'Linux' : '';
  const browser = /Edg\//.test(agent) ? 'Edge' : /Chrome\//.test(agent) ? 'Chrome' : /Firefox\//.test(agent) ? 'Firefox' : /Safari\//.test(agent) ? 'Safari' : '';
  return [browser, os].filter(Boolean).join(' · ');
}

export default function Sessions() {
  const { t, locale, errorMessage } = useI18n();
  const { colors } = useTheme();
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setSessions(await meApi.sessions());
    } catch (e) {
      setMessage({ kind: 'error', text: errorMessage(e) });
    }
  }, [errorMessage]);

  useEffect(() => {
    let active = true;
    meApi
      .sessions()
      .then((list) => active && setSessions(list))
      .catch((e) => active && setMessage({ kind: 'error', text: errorMessage(e) }));
    return () => {
      active = false;
    };
  }, [errorMessage]);

  async function revoke(id: string) {
    try {
      await meApi.revokeSession(id);
      await load();
    } catch (e) {
      setMessage({ kind: 'error', text: errorMessage(e) });
    }
  }

  async function revokeOthers() {
    try {
      const { revoked } = await meApi.revokeOthers();
      setMessage({ kind: 'success', text: t('sessions.revokedOthers', { n: revoked }) });
      await load();
    } catch (e) {
      setMessage({ kind: 'error', text: errorMessage(e) });
    }
  }

  const format = (iso: string) =>
    new Date(iso).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });

  return (
    <Screen>
      <Text variant="muted">{t('sessions.subtitle')}</Text>
      {message ? <Notice kind={message.kind}>{message.text}</Notice> : null}
      {sessions === null ? (
        <ActivityIndicator color={colors.gold} />
      ) : (
        <Card style={{ paddingVertical: 4 }}>
          {sessions.map((s, i) => (
            <Fragment key={s.id} divider={i > 0}>
              <ListItem
                icon={s.client === 'web' ? 'globe-outline' : 'phone-portrait-outline'}
                title={`${s.current ? t('sessions.current') : t(`sessions.${s.client}`)}${s.device_name ?? describeAgent(s.user_agent) ? ` — ${s.device_name ?? describeAgent(s.user_agent)}` : ''}`}
                subtitle={`${t('sessions.lastUsed', { date: format(s.last_used_at) })}${s.trusted ? ` · ${t('sessions.trusted')}` : ''}`}
                right={
                  s.current ? null : (
                    <Text variant="label" style={{ color: colors.danger }} onPress={() => revoke(s.id)} accessibilityRole="button">
                      {t('sessions.revoke')}
                    </Text>
                  )
                }
              />
            </Fragment>
          ))}
        </Card>
      )}
      {sessions && sessions.length > 1 ? (
        <Button kind="secondary" title={t('sessions.revokeOthers')} onPress={revokeOthers} />
      ) : sessions ? (
        <Text variant="small">{t('sessions.empty')}</Text>
      ) : null}
    </Screen>
  );
}

function Fragment({ children, divider }: { children: ReactNode; divider: boolean }) {
  return (
    <>
      {divider ? <Divider /> : null}
      {children}
    </>
  );
}

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Button, Notice, Screen, Seal, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { authApi } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme';

export default function VerifyEmail() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { t, errorMessage } = useI18n();
  const { colors } = useTheme();
  const { status } = useSession();
  const [state, setState] = useState<'working' | 'done' | 'error'>(token ? 'working' : 'error');
  const [error, setError] = useState<string | null>(token ? null : t('auth.missingToken'));
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    authApi
      .verifyEmail(token)
      .then(() => setState('done'))
      .catch((e) => {
        setError(errorMessage(e));
        setState('error');
      });
  }, [token, errorMessage]);

  return (
    <Screen center>
      <View style={{ alignItems: 'center' }}>
        <Seal size={88} />
      </View>
      <Text variant="title" style={{ textAlign: 'center' }}>
        {t('auth.verifyTitle')}
      </Text>
      {state === 'working' ? (
        <View style={{ alignItems: 'center', gap: 12 }}>
          <ActivityIndicator color={colors.gold} />
          <Text variant="muted">{t('auth.verifying')}</Text>
        </View>
      ) : null}
      {state === 'done' ? <Notice kind="success">{t('auth.verified')}</Notice> : null}
      {state === 'error' && error ? <Notice kind="error">{error}</Notice> : null}
      {state !== 'working' ? (
        <Button
          title={status === 'signedIn' ? t('common.continue') : t('auth.goToSignIn')}
          onPress={() => router.replace(status === 'signedIn' ? '/' : '/sign-in')}
        />
      ) : null}
    </Screen>
  );
}

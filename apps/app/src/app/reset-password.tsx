import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Notice, Screen, Seal, Text, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { authApi } from '@/lib/api';
import { useSession } from '@/lib/session';
import { validatePassword } from '@/lib/validation';

export default function ResetPassword() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { t, errorMessage } = useI18n();
  const { status, forget } = useSession();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: string | null; confirm?: string | null }>({});
  const [error, setError] = useState<string | null>(token ? null : t('auth.missingToken'));
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit() {
    const passwordError = validatePassword(password);
    const next = {
      password: passwordError && t(passwordError),
      confirm: password !== confirm ? t('validation.passwordMismatch') : null,
    };
    setErrors(next);
    if (next.password || next.confirm || !token) return;
    setLoading(true);
    setError(null);
    try {
      await authApi.resetPassword(token, password);
      // O servidor encerrou todas as sessões, inclusive esta
      if (status === 'signedIn') await forget();
      setDone(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen center>
      <View style={{ alignItems: 'center' }}>
        <Seal size={72} />
      </View>
      <Text variant="title">{t('auth.resetTitle')}</Text>
      {error ? <Notice kind="error">{error}</Notice> : null}
      {done ? (
        <>
          <Notice kind="success">{t('auth.resetDone')}</Notice>
          <Button title={t('auth.goToSignIn')} onPress={() => router.replace('/sign-in')} />
        </>
      ) : token ? (
        <>
          <TextField
            label={t('auth.newPassword')}
            value={password}
            onChangeText={setPassword}
            secure
            autoComplete="new-password"
            textContentType="newPassword"
            hint={t('auth.passwordHint')}
            error={errors.password}
          />
          <TextField
            label={t('auth.confirmPassword')}
            value={confirm}
            onChangeText={setConfirm}
            secure
            autoComplete="new-password"
            onSubmitEditing={submit}
            error={errors.confirm}
          />
          <Button title={t('common.save')} onPress={submit} loading={loading} />
        </>
      ) : (
        <Button kind="secondary" title={t('auth.forgotPassword')} onPress={() => router.replace('/forgot-password')} />
      )}
    </Screen>
  );
}

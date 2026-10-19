import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Notice, Screen, Seal, Text, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { authApi } from '@/lib/api';
import { validateEmail } from '@/lib/validation';

export default function ForgotPassword() {
  const { t, errorMessage } = useI18n();
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit() {
    const invalid = validateEmail(email);
    setFieldError(invalid && t(invalid));
    if (invalid) return;
    setLoading(true);
    setError(null);
    try {
      await authApi.forgotPassword(email.trim());
      setSent(true);
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
      <View style={{ gap: 4 }}>
        <Text variant="title">{t('auth.forgotTitle')}</Text>
        <Text variant="muted">{t('auth.forgotSubtitle')}</Text>
      </View>
      {error ? <Notice kind="error">{error}</Notice> : null}
      {sent ? (
        <Notice kind="success">{t('auth.forgotSent')}</Notice>
      ) : (
        <>
          <TextField
            label={t('common.email')}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            onSubmitEditing={submit}
            error={fieldError}
          />
          <Button title={t('auth.sendLink')} onPress={submit} loading={loading} />
        </>
      )}
      <Button kind="ghost" title={t('common.back')} onPress={() => router.replace('/sign-in')} />
    </Screen>
  );
}

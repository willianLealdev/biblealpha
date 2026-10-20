import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { Button, Checkbox, Gap, LinkText, Logo, Notice, Screen, Text, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { ApiError, authApi } from '@/lib/api';
import { useSession } from '@/lib/session';
import { validateEmail } from '@/lib/validation';

export default function SignIn() {
  const { t, errorMessage } = useI18n();
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [resent, setResent] = useState(false);

  // "Confiar neste dispositivo": só nos apps (no site a sessão acaba ao fechar o navegador)
  const [trust, setTrust] = useState(false);

  async function submit() {
    const emailError = validateEmail(email);
    if (emailError || !password) {
      setError(t(emailError ?? 'validation.required'));
      return;
    }
    setLoading(true);
    setError(null);
    setUnverified(false);
    try {
      await signIn(email.trim(), password, trust);
      // A guarda de rota leva para as abas automaticamente
    } catch (e) {
      if (e instanceof ApiError && e.code === 'email_not_verified') setUnverified(true);
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    try {
      await authApi.resendVerification(email.trim());
    } finally {
      setResent(true);
    }
  }

  return (
    <Screen center>
      <Logo size={240} />
      <View style={{ gap: 4 }}>
        <Text variant="title">{t('auth.signInTitle')}</Text>
        <Text variant="muted">{t('auth.signInSubtitle')}</Text>
      </View>
      {error ? <Notice kind="error">{error}</Notice> : null}
      {unverified ? (
        resent ? (
          <Notice kind="success">{t('auth.resent')}</Notice>
        ) : (
          <Button kind="secondary" title={t('auth.resend')} onPress={resend} icon="mail-outline" />
        )
      ) : null}
      <TextField
        label={t('common.email')}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="username"
        returnKeyType="next"
      />
      <TextField
        label={t('common.password')}
        value={password}
        onChangeText={setPassword}
        secure
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      {Platform.OS !== 'web' ? (
        <View style={{ gap: 2 }}>
          <Checkbox checked={trust} onChange={setTrust}>
            {t('auth.trustDevice')}
          </Checkbox>
          <Text variant="small">{t('auth.trustDeviceHint')}</Text>
        </View>
      ) : null}
      <View style={{ alignItems: 'flex-end' }}>
        <LinkText onPress={() => router.push('/forgot-password')}>{t('auth.forgotPassword')}</LinkText>
      </View>
      <Button title={t('auth.signIn')} onPress={submit} loading={loading} />
      <Gap size="sm" />
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
        <Text variant="muted">{t('auth.noAccount')}</Text>
        <LinkText onPress={() => router.push('/sign-up')}>{t('auth.createAccount')}</LinkText>
      </View>
    </Screen>
  );
}

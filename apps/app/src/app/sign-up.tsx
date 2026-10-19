import { router } from 'expo-router';
import { getLocales } from 'expo-localization';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, Checkbox, LinkText, Notice, Screen, Seal, Text, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { CountryField, LanguageField } from '@/components/world-picker';
import { authApi } from '@/lib/api';
import { validateEmail, validatePassword } from '@/lib/validation';
import { guessCountry, loadWorld, type World } from '@/lib/world';

export default function SignUp() {
  const { t, locale, setLocale, errorMessage } = useI18n();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accept, setAccept] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  // País e idioma: o país sugere as línguas oficiais dele
  const [world, setWorld] = useState<World | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [language, setLanguage] = useState<string>(locale);

  useEffect(() => {
    loadWorld()
      .then((w) => {
        setWorld(w);
        setCountry(guessCountry(getLocales()[0]?.regionCode, w.countries));
      })
      .catch(() => {});
  }, []);

  function chooseCountry(code: string) {
    setCountry(code);
    const first = world?.countries.find((c) => c.code === code)?.languages[0];
    if (first) chooseLanguage(first);
  }

  function chooseLanguage(code: string) {
    setLanguage(code);
    // Português, inglês e espanhol mudam a tela na hora; outro idioma é preparado depois do cadastro
    if (code === 'pt-BR' || code === 'en' || code === 'es') setLocale(code);
  }

  async function submit() {
    const nameError = name.trim() ? null : 'validation.required';
    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);
    const termsError = accept ? null : 'validation.terms';
    const next = {
      name: nameError && t(nameError),
      email: emailError && t(emailError),
      password: passwordError && t(passwordError),
      terms: termsError && t(termsError),
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    setLoading(true);
    setError(null);
    try {
      await authApi.register({
        name: name.trim(),
        email: email.trim(),
        password,
        locale: language,
        country: country ?? undefined,
        accept_terms: accept,
      });
      setSentTo(email.trim().toLowerCase());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  if (sentTo) {
    return (
      <Screen center>
        <View style={{ alignItems: 'center' }}>
          <Seal size={88} />
        </View>
        <Text variant="title" style={{ textAlign: 'center' }}>
          {t('auth.checkEmailTitle')}
        </Text>
        <Text variant="muted" style={{ textAlign: 'center' }}>
          {t('auth.checkEmailBody', { email: sentTo })}
        </Text>
        {resent ? <Notice kind="success">{t('auth.resent')}</Notice> : null}
        <Button
          kind="secondary"
          title={t('auth.resend')}
          icon="mail-outline"
          onPress={async () => {
            try {
              await authApi.resendVerification(sentTo);
            } finally {
              setResent(true);
            }
          }}
        />
        <Button title={t('auth.goToSignIn')} onPress={() => router.replace('/sign-in')} />
      </Screen>
    );
  }

  return (
    <Screen center>
      <View style={{ alignItems: 'center' }}>
        <Seal size={72} />
      </View>
      <View style={{ gap: 4 }}>
        <Text variant="title">{t('auth.signUpTitle')}</Text>
        <Text variant="muted">{t('auth.signUpSubtitle')}</Text>
      </View>
      {error ? <Notice kind="error">{error}</Notice> : null}
      {world ? (
        <>
          <CountryField world={world} value={country} onChange={chooseCountry} />
          <LanguageField world={world} country={country} value={language} onChange={chooseLanguage} />
        </>
      ) : null}
      <TextField label={t('common.name')} value={name} onChangeText={setName} autoComplete="name" error={errors.name} />
      <TextField
        label={t('common.email')}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        error={errors.email}
      />
      <TextField
        label={t('common.password')}
        value={password}
        onChangeText={setPassword}
        secure
        autoComplete="new-password"
        textContentType="newPassword"
        hint={t('auth.passwordHint')}
        error={errors.password}
      />
      <Checkbox checked={accept} onChange={setAccept}>
        <Text variant="muted">
          {t('auth.acceptTermsPrefix')}
          <LinkText onPress={() => router.push('/legal/terms')}>{t('auth.terms')}</LinkText>
          {t('auth.and')}
          <LinkText onPress={() => router.push('/legal/privacy')}>{t('auth.privacy')}</LinkText>.
        </Text>
      </Checkbox>
      {errors.terms ? <Notice kind="error">{errors.terms}</Notice> : null}
      <Button title={t('auth.createAccount')} onPress={submit} loading={loading} />
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
        <Text variant="muted">{t('auth.haveAccount')}</Text>
        <LinkText onPress={() => router.replace('/sign-in')}>{t('auth.signIn')}</LinkText>
      </View>
    </Screen>
  );
}

import { useState } from 'react';

import { Button, Notice, Screen, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { meApi } from '@/lib/api';
import { useSession } from '@/lib/session';

export default function DeleteAccount() {
  const { t, errorMessage } = useI18n();
  const { forget } = useSession();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!password) {
      setError(t('validation.required'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await meApi.deleteAccount(password);
      await forget();
    } catch (e) {
      setError(errorMessage(e));
      setLoading(false);
    }
  }

  return (
    <Screen>
      <Notice kind="error">{t('deleteAccount.warning')}</Notice>
      <TextField
        label={t('deleteAccount.confirmLabel')}
        value={password}
        onChangeText={setPassword}
        secure
        autoComplete="current-password"
        error={error}
      />
      <Button kind="danger" title={t('deleteAccount.confirm')} onPress={submit} loading={loading} />
    </Screen>
  );
}

import { useState } from 'react';

import { Button, Notice, Screen, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { meApi } from '@/lib/api';
import { validatePassword } from '@/lib/validation';

export default function ChangePassword() {
  const { t, errorMessage } = useI18n();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    const nextError = validatePassword(next);
    const found = {
      current: current ? null : t('validation.required'),
      next: nextError && t(nextError),
      confirm: next !== confirm ? t('validation.passwordMismatch') : null,
    };
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;
    setLoading(true);
    setMessage(null);
    try {
      await meApi.changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      setMessage({ kind: 'success', text: t('password.done') });
    } catch (e) {
      setMessage({ kind: 'error', text: errorMessage(e) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      {message ? <Notice kind={message.kind}>{message.text}</Notice> : null}
      <TextField
        label={t('password.current')}
        value={current}
        onChangeText={setCurrent}
        secure
        autoComplete="current-password"
        error={errors.current}
      />
      <TextField
        label={t('auth.newPassword')}
        value={next}
        onChangeText={setNext}
        secure
        autoComplete="new-password"
        hint={t('auth.passwordHint')}
        error={errors.next}
      />
      <TextField
        label={t('auth.confirmPassword')}
        value={confirm}
        onChangeText={setConfirm}
        secure
        autoComplete="new-password"
        error={errors.confirm}
      />
      <Button title={t('common.save')} onPress={submit} loading={loading} />
    </Screen>
  );
}

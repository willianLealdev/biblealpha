import en from '@/i18n/en';
import es from '@/i18n/es';
import ptBR from '@/i18n/pt-BR';
import { translate } from '@/i18n';
import { validateEmail, validatePassword } from '@/lib/validation';

function keys(node: object, prefix = ''): string[] {
  return Object.entries(node).flatMap(([k, v]) =>
    typeof v === 'string' ? [`${prefix}${k}`] : keys(v, `${prefix}${k}.`),
  );
}

test('pt-BR e en têm exatamente as mesmas chaves', () => {
  expect(keys(en).sort()).toEqual(keys(ptBR).sort());
});

test('es não tem chaves que não existem no pt-BR, e o que faltar sai em inglês', () => {
  const base = new Set(keys(ptBR));
  expect(keys(es).filter((k) => !base.has(k))).toEqual([]);
  expect(translate('es', 'common.phase', { n: 2 })).toBe('Fase 2');
  expect(translate('es', 'tabs.sermons')).toBe('Predicaciones');
  expect(translate('fr', 'tabs.bible')).toBe(translate('en', 'tabs.bible'));
});

test('nenhum texto vazio', () => {
  for (const dict of [ptBR, en]) {
    for (const key of keys(dict)) expect(translate(dict === en ? 'en' : 'pt-BR', key).trim()).not.toBe('');
  }
});

test('interpola parâmetros e devolve a chave quando falta tradução', () => {
  expect(translate('pt-BR', 'common.phase', { n: 2 })).toBe('Fase 2');
  expect(translate('en', 'sessions.revokedOthers', { n: 3 })).toBe('3 session(s) signed out.');
  expect(translate('en', 'does.not.exist')).toBe('does.not.exist');
});

test('todo código de erro da API tem mensagem nos dois idiomas', () => {
  const codes = [
    'invalid_credentials',
    'email_not_verified',
    'email_taken',
    'terms_not_accepted',
    'invalid_or_expired_token',
    'wrong_password',
    'rate_limited',
    'validation_error',
    'session_not_found',
  ];
  for (const code of codes) {
    expect(translate('pt-BR', `errors.${code}`)).not.toBe(`errors.${code}`);
    expect(translate('en', `errors.${code}`)).not.toBe(`errors.${code}`);
  }
});

test('validação local segue as regras do backend', () => {
  expect(validateEmail('')).toBe('validation.required');
  expect(validateEmail('ana@')).toBe('validation.email');
  expect(validateEmail('ana@example.com')).toBeNull();
  expect(validatePassword('1234567')).toBe('validation.passwordShort');
  expect(validatePassword('12345678')).toBe('validation.passwordWeak');
  expect(validatePassword('somenteletras')).toBe('validation.passwordWeak');
  expect(validatePassword('Graça&Paz123')).toBeNull();
});

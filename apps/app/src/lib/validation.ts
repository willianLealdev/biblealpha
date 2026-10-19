import type { TranslationKey } from '@/i18n';

// Mesmas regras do backend (app/schemas/auth.py), para avisar antes de enviar

export function validateEmail(email: string): TranslationKey | null {
  if (!email.trim()) return 'validation.required';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? null : 'validation.email';
}

export function validatePassword(password: string): TranslationKey | null {
  if (!password) return 'validation.required';
  if (password.length < 8) return 'validation.passwordShort';
  if (/^\d+$/.test(password) || /^\p{L}+$/u.test(password)) return 'validation.passwordWeak';
  return null;
}

// Documentos legais por idioma (os demais idiomas veem a versão em inglês).
// A versão é a mesma registrada no aceite do cadastro (BA_TERMS_VERSION / BA_PRIVACY_VERSION no servidor).

import * as en from './en';
import * as es from './es';
import * as pt from './pt-BR';

export const VERSION = '2026-10-20';

export function legalText(doc: 'terms' | 'privacy', locale: string): string {
  const lang = locale.toLowerCase().slice(0, 2);
  const source = lang === 'pt' ? pt : lang === 'es' ? es : en;
  return doc === 'privacy' ? source.privacy : source.terms;
}

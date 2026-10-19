// Agenda do pregador: compromissos com igreja, endereço, mensagem anexada e observações.

import { api } from './api';

export type AgendaEvent = {
  id: string;
  local_date: string; // AAAA-MM-DD
  local_time: string; // HH:MM
  timezone: string | null;
  starts_at: string;
  church_name: string;
  country: string | null;
  postal_code: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  region: string | null;
  address: string;
  sermon_id: string | null;
  sermon_title: string | null;
  notes: string;
  reminder_sent: boolean;
};

export type AgendaInput = Omit<AgendaEvent, 'id' | 'starts_at' | 'address' | 'sermon_title' | 'reminder_sent' | 'timezone'>;

function withZone(body: AgendaInput) {
  // Fuso do aparelho e o deslocamento naquela data (reserva, se o fuso não for reconhecido)
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  const offset = -new Date(`${body.local_date}T${body.local_time}:00`).getTimezoneOffset();
  return { ...body, timezone, utc_offset_minutes: Number.isFinite(offset) ? offset : 0 };
}

export const agendaApi = {
  list: (past = false) => api<{ items: AgendaEvent[] }>(`/agenda?past=${past}`),
  get: (id: string) => api<AgendaEvent>(`/agenda/${id}`),
  create: (body: AgendaInput) => api<AgendaEvent>('/agenda', { method: 'POST', body: withZone(body) }),
  update: (id: string, body: AgendaInput) => api<AgendaEvent>(`/agenda/${id}`, { method: 'PUT', body: withZone(body) }),
  remove: (id: string) => api<void>(`/agenda/${id}`, { method: 'DELETE' }),
};

export type AddressField = 'postal_code' | 'street' | 'number' | 'complement' | 'district' | 'city' | 'region';

/** Campos do endereço na ordem usada em cada país e o nome de cada um ("CEP", "ZIP code", "Estado"...). */
export function addressLayout(country: string | null): { field: AddressField; label: string }[] {
  const c = country ?? '';
  const region =
    ['BR', 'US', 'MX', 'VE', 'NG', 'AU', 'IN', 'MY', 'DE', 'AT'].includes(c) ? 'state'
    : ['CA', 'AR', 'ES', 'IT', 'PH', 'ZA', 'CN', 'KR', 'BO', 'EC', 'PE', 'CL', 'DO', 'CU', 'PA'].includes(c) ? 'province'
    : ['PT', 'AO', 'MZ', 'CV', 'GW', 'ST', 'TL'].includes(c) ? 'district_pt'
    : 'region';
  const postal = c === 'BR' ? 'cep' : c === 'US' ? 'zip' : 'postal';
  const L = (field: AddressField, label: string) => ({ field, label });
  if (c === 'BR')
    return [L('postal_code', postal), L('street', 'street'), L('number', 'number'), L('complement', 'complement'), L('district', 'district'), L('city', 'city'), L('region', region)];
  if (['US', 'CA', 'GB', 'AU', 'NZ', 'IE', 'PH', 'NG', 'ZA', 'IN', 'KE', 'GH'].includes(c))
    return [L('number', 'number'), L('street', 'street'), L('complement', 'apartment'), L('city', 'city'), L('region', region), L('postal_code', postal)];
  return [L('street', 'street'), L('number', 'number'), L('complement', 'complement'), L('district', 'district'), L('postal_code', postal), L('city', 'city'), L('region', region)];
}

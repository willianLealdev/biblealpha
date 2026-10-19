import { api } from './api';

export type DevotionalContent = {
  title: string;
  context: string;
  reflection: string;
  application: string;
  questions: string[];
  prayer: string;
  references?: string[];
  invalid_references?: string[];
  fallback?: boolean;
};

export type Devotional = {
  id: string;
  kind: 'daily' | 'ai' | 'own';
  day?: string;
  theme: string | null;
  theme_label: string | null;
  reference: string;
  verse_key_start: number;
  verse_key_end: number;
  translation: string;
  translation_code: string;
  verses: { chapter: number; verse: number; text: string }[];
  content: DevotionalContent;
  created_at?: string;
  mine?: { id: string; completed_on: string | null; favorite: boolean; note: string };
};

export type Stats = { current_streak: number; total_completed: number; calendar: { date: string; done: boolean }[] };

export type Reading = {
  ref: string;
  label: string;
  book: string;
  chapter: number;
  verse_start: number | null;
  chapter_end: number;
  verse_end: number | null;
};

export type PlanSummary = { code: string; category: string; title: string; description: string; days: number };

export type Enrollment = {
  id: string;
  plan: PlanSummary;
  status: 'active' | 'paused' | 'done';
  start_date: string;
  current_day: number;
  done_days: number[];
  progress: number;
  behind: number;
  today: { day: number; readings: Reading[] };
  next_unread: number | null;
};

export const devotionalApi = {
  today: () => api<Devotional>('/devotionals/today'),
  markToday: (body: { completed?: boolean; favorite?: boolean; note?: string }) =>
    api<Stats & { mine: Devotional['mine'] }>('/devotionals/today/mark', { method: 'POST', body }),
  themes: () => api<{ themes: { code: string; label: string }[] }>('/devotionals/themes'),
  personal: (body: { theme?: string | null; verse_key_start?: number | null; verse_key_end?: number | null; length: 'short' | 'medium' | 'long' }) =>
    api<Devotional>('/devotionals/personal', { method: 'POST', body }),
  mine: (favorites = false) => api<{ devotionals: Devotional[] }>(`/me/devotionals${favorites ? '?favorites=true' : ''}`),
  completed: () => api<{ devotionals: Devotional[] }>('/me/devotionals?completed=true'),
  mark: (id: string, body: { completed?: boolean; favorite?: boolean; note?: string }) =>
    api(`/me/devotionals/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => api(`/me/devotionals/${id}`, { method: 'DELETE' }),
  stats: () => api<Stats>('/me/devotionals/stats'),
  plans: () => api<{ plans: PlanSummary[] }>('/reading-plans'),
  plan: (code: string) => api<PlanSummary & { schedule: { day: number; readings: Reading[] }[] }>(`/reading-plans/${code}`),
  enrollments: () => api<{ enrollments: Enrollment[] }>('/me/reading-plans'),
  enroll: (code: string) => api<Enrollment>('/me/reading-plans', { method: 'POST', body: { code } }),
  markDay: (id: string, day: number, done: boolean) =>
    api<Enrollment>(`/me/reading-plans/${id}/days/${day}`, { method: 'POST', body: { done } }),
  action: (id: string, action: 'pause' | 'resume' | 'reschedule') =>
    api<Enrollment>(`/me/reading-plans/${id}/action`, { method: 'POST', body: { action } }),
  leave: (id: string) => api(`/me/reading-plans/${id}`, { method: 'DELETE' }),
  notifications: () => api<{ devotional_time: string | null; plan_reminders: boolean; timezone: string }>('/me/notifications'),
  saveNotifications: (body: { devotional_time: string | null; plan_reminders: boolean; timezone: string }) =>
    api('/me/notifications', { method: 'PUT', body }),
};

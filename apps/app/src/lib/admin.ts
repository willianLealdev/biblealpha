// Chamadas do painel administrativo (a API exige o papel "admin").

import { api } from './api';

export type Totals = { cost_usd: number; cost_brl: number; requests: number; users: number };
type Group = { key: string; cost_usd: number; cost_brl: number; requests: number };

export type Overview = {
  today: Totals;
  month: Totals;
  all_time: Totals;
  by_feature: Group[];
  by_model: Group[];
  by_plan: Group[];
  daily: { date: string; cost_usd: number; cost_brl: number; requests: number }[];
  budget: { daily_usd: number; monthly_usd: number; hard_daily_usd: number; today_percent: number | null };
  economics: {
    pro_subscribers: number;
    pro_price_brl_month: number | null;
    avg_ai_cost_per_pro_brl_month: number | null;
    margin_per_pro_brl_month: number | null;
    free_users_using_ai: number;
    avg_ai_cost_per_free_user_brl_month: number | null;
    donations_month?: { count: number; by_currency: { currency: string; count: number; amount: number }[] };
  };
};

export type AdminUserRow = {
  user_id: string;
  name: string | null;
  email: string;
  plan: 'free' | 'pro';
  cost_usd: number;
  cost_brl: number;
  requests: number;
  last_used_at: string | null;
};

export type ModelConfig = { model: string; effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max'; max_tokens: number };

export type AdminSettings = {
  enabled: boolean;
  models: Record<'explain' | 'chat' | 'classify', ModelConfig>;
  quotas: { free_daily: number; free_monthly: number; pro_daily_cap: number; pro_per_minute: number };
  budget_daily_usd: number;
  budget_monthly_usd: number;
  budget_hard_daily_usd: number;
  alert_email: string | null;
  usd_brl: number;
  known_models: string[];
  prices: {
    model: string;
    input_per_mtok: number;
    output_per_mtok: number;
    cache_read_per_mtok: number;
    cache_write_per_mtok: number;
    valid_from: string;
  }[];
};

export type AdminUserDetail = {
  user: { id: string; name: string | null; email: string; created_at: string };
  plan: 'free' | 'pro';
  subscription: { source: string; current_period_end: string | null; note: string | null } | null;
  month: { cost_usd: number; cost_brl: number; requests: number };
  all_time: { cost_usd: number; cost_brl: number; requests: number };
  requests: {
    created_at: string;
    feature: string;
    model: string;
    plan: string;
    status: string;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cost_usd: number;
    cost_brl: number;
    latency_ms: number;
  }[];
};

export const adminApi = {
  overview: () => api<Overview>('/admin/ai/overview'),
  users: (period: 'today' | 'month' | 'all') => api<{ users: AdminUserRow[] }>(`/admin/ai/users?period=${period}`),
  user: (id: string) => api<AdminUserDetail>(`/admin/ai/users/${id}`),
  searchUsers: (q: string) =>
    api<{ users: { id: string; name: string | null; email: string; plan: string }[] }>(`/admin/users?q=${encodeURIComponent(q)}`),
  settings: () => api<AdminSettings>('/admin/settings'),
  saveSettings: (body: Omit<AdminSettings, 'known_models' | 'prices'>) =>
    api<AdminSettings>('/admin/settings', { method: 'PUT', body }),
  grantPro: (id: string, days: number) => api(`/admin/users/${id}/pro`, { method: 'POST', body: { days } }),
  revokePro: (id: string) => api(`/admin/users/${id}/pro`, { method: 'DELETE' }),
};

// Painel → Ofertas: valor da contribuição mensal/anual (reais para o Brasil, dólar para o resto do
// mundo) e os limites da oferta avulsa. Vale na hora para todos os aparelhos (o app lê do servidor).

import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Button, Card, Notice, Screen, Text, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

type Interval = 'month' | 'year';
type Currency = 'BRL' | 'USD';
type Price = { interval: Interval; currency: string; amount: number; valid_from: string; is_current: boolean };
type Limits = {
  visual: { free_monthly: number; pro_monthly: number };
  slides: { free_monthly: number; pro_monthly: number };
  donation: { min_brl: number; max_brl: number; min_usd: number; max_usd: number; bonus_questions: number };
};

const SLOTS: [Interval, Currency][] = [
  ['month', 'BRL'],
  ['month', 'USD'],
  ['year', 'BRL'],
  ['year', 'USD'],
];

const num = (v: string) => {
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

export default function AdminOffers() {
  const { t, locale, errorMessage } = useI18n();
  const { colors } = useTheme();
  const [prices, setPrices] = useState<Price[] | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [limits, setLimits] = useState<Limits | null>(null);
  const [busy, setBusy] = useState<'prices' | 'donation' | null>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const loadPrices = useCallback(
    () =>
      api<{ prices: Price[] }>('/admin/billing/prices')
        .then((r) => setPrices(r.prices))
        .catch((e) => setMessage({ kind: 'error', text: errorMessage(e) })),
    [errorMessage],
  );

  useEffect(() => {
    loadPrices();
    api<Limits>('/admin/limits')
      .then(setLimits)
      .catch((e) => setMessage({ kind: 'error', text: errorMessage(e) }));
  }, [loadPrices, errorMessage]);

  if (!prices || !limits) {
    return (
      <Screen center>
        {message ? <Notice kind="error">{message.text}</Notice> : <ActivityIndicator color={colors.gold} />}
      </Screen>
    );
  }

  const money = (amount: number, currency: string) => amount.toLocaleString(locale, { style: 'currency', currency });
  const current = (interval: Interval, currency: Currency) =>
    prices.find((p) => p.is_current && p.interval === interval && p.currency === currency);
  const label = (interval: Interval, currency: Currency) =>
    t(`admin.offers.${interval === 'month' ? 'monthly' : 'yearly'}${currency === 'BRL' ? 'Brl' : 'Usd'}`);

  async function applyPrices() {
    setBusy('prices');
    setMessage(null);
    try {
      for (const [interval, currency] of SLOTS) {
        const amount = (draft[`${interval}-${currency}`] ?? '').replace(',', '.').trim();
        if (amount) await api('/admin/billing/prices', { method: 'POST', body: { interval, currency, amount } });
      }
      setDraft({});
      await loadPrices();
      setMessage({ kind: 'success', text: t('admin.offers.pricesSaved') });
    } catch (e) {
      setMessage({ kind: 'error', text: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  }

  async function saveDonation() {
    setBusy('donation');
    setMessage(null);
    try {
      setLimits(await api<Limits>('/admin/limits', { method: 'PUT', body: limits }));
      setMessage({ kind: 'success', text: t('admin.offers.donationSaved') });
    } catch (e) {
      setMessage({ kind: 'error', text: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  }

  const d = limits.donation;
  const setD = (k: keyof Limits['donation'], v: string) =>
    setLimits({ ...limits, donation: { ...d, [k]: k === 'bonus_questions' ? Math.round(num(v)) : num(v) } });
  const pair = (a: ReactNode, b: ReactNode) => (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <View style={{ flex: 1 }}>{a}</View>
      <View style={{ flex: 1 }}>{b}</View>
    </View>
  );
  const hasDraft = Object.values(draft).some((v) => v.trim());

  return (
    <Screen>
      <Text variant="title">{t('admin.offers.title')}</Text>
      <Text variant="muted">{t('admin.offers.intro')}</Text>
      {message ? <Notice kind={message.kind}>{message.text}</Notice> : null}

      <Card>
        <Text variant="heading">{t('admin.offers.recurring')}</Text>
        <Text variant="small">{t('admin.offers.recurringHint')}</Text>
        {SLOTS.map(([interval, currency]) => {
          const now = current(interval, currency);
          return (
            <TextField
              key={`${interval}-${currency}`}
              label={`${label(interval, currency)} · ${now ? money(now.amount, currency) : t('admin.offers.notSet')}`}
              value={draft[`${interval}-${currency}`] ?? ''}
              onChangeText={(v) => setDraft({ ...draft, [`${interval}-${currency}`]: v })}
              placeholder={t('admin.offers.newValue')}
              keyboardType="decimal-pad"
            />
          );
        })}
        <Button icon="checkmark" title={t('admin.offers.applyPrices')} onPress={applyPrices} loading={busy === 'prices'} disabled={!hasDraft} />
        <Text variant="label">{t('admin.offers.history')}</Text>
        {prices.length ? (
          prices.map((p, i) => (
            <Text key={i} variant="small">
              {t(p.interval === 'month' ? 'pro.month' : 'pro.year')} · {money(p.amount, p.currency)} · {new Date(`${p.valid_from}T12:00:00`).toLocaleDateString(locale)}
              {p.is_current ? ` · ${t('admin.offers.currentTag')}` : ''}
            </Text>
          ))
        ) : (
          <Text variant="small">—</Text>
        )}
      </Card>

      <Card>
        <Text variant="heading">{t('admin.limits.donation')}</Text>
        <Text variant="small">{t('admin.limits.donationHint')}</Text>
        {pair(
          <TextField label={t('admin.limits.minBrl')} value={String(d.min_brl)} onChangeText={(v) => setD('min_brl', v)} keyboardType="decimal-pad" />,
          <TextField label={t('admin.limits.maxBrl')} value={String(d.max_brl)} onChangeText={(v) => setD('max_brl', v)} keyboardType="decimal-pad" />,
        )}
        {pair(
          <TextField label={t('admin.limits.minUsd')} value={String(d.min_usd)} onChangeText={(v) => setD('min_usd', v)} keyboardType="decimal-pad" />,
          <TextField label={t('admin.limits.maxUsd')} value={String(d.max_usd)} onChangeText={(v) => setD('max_usd', v)} keyboardType="decimal-pad" />,
        )}
        <TextField label={t('admin.limits.bonus')} value={String(d.bonus_questions)} onChangeText={(v) => setD('bonus_questions', v)} keyboardType="number-pad" />
        <Button kind="secondary" icon="checkmark" title={t('admin.offers.saveDonation')} onPress={saveDonation} loading={busy === 'donation'} />
      </Card>
    </Screen>
  );
}

import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';

import { Button, Card, Divider, Notice, Screen, Seal, Segmented, Text, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

type Plans = {
  free: { ai_daily: number; ai_monthly: number };
  pro: { features: string[]; prices: { interval: 'month' | 'year'; currency: string; amount: number }[] };
  checkout_available: boolean;
  donation_limits?: Record<string, [number, number]>;
};

type MySub = { plan: 'free' | 'pro'; subscription: { current_period_end: string | null; source: string } | null };

// Brasil paga em reais; o resto do mundo em dólar (mesma regra do servidor)
const currencyFor = (locale: string) => (locale.startsWith('pt') ? 'BRL' : 'USD');

// Valores sugeridos para a oferta avulsa (o usuário pode digitar outro)
const PRESETS: Record<string, number[]> = { BRL: [10, 25, 50, 100], USD: [5, 10, 25, 50] };
const DEFAULT_LIMITS: Record<string, [number, number]> = { BRL: [5, 10000], USD: [1, 2000] };

/** "25", "25,50" ou "25.50" → 25.5; vazio ou inválido → NaN */
function parseAmount(text: string): number {
  const clean = text.trim().replace(/\s/g, '');
  if (!/^\d+([.,]\d{1,2})?$/.test(clean)) return Number.NaN;
  return Number(clean.replace(',', '.'));
}

export default function Pro() {
  const { t, locale, errorMessage } = useI18n();
  const { colors } = useTheme();
  const { checkout, donation } = useLocalSearchParams<{ checkout?: string; donation?: string }>();
  const [plans, setPlans] = useState<Plans | null>(null);
  const [mine, setMine] = useState<MySub | null>(null);
  const [notice, setNotice] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gift, setGift] = useState<string>('25');
  const [custom, setCustom] = useState('');

  const loadMine = useCallback(() => api<MySub>('/me/subscription').then(setMine).catch(() => {}), []);

  useEffect(() => {
    api<Plans>('/billing/plans', { auth: false }).then(setPlans).catch(() => {});
    loadMine();
  }, [loadMine]);

  // Voltando do Stripe: o webhook ativa o Pro em segundos; confere algumas vezes
  useEffect(() => {
    if (checkout !== 'success') return;
    let n = 0;
    const timer = setInterval(() => {
      n += 1;
      loadMine();
      if (n >= 10) clearInterval(timer);
    }, 3000);
    return () => clearInterval(timer);
  }, [checkout, loadMine]);

  async function open(path: '/billing/checkout' | '/billing/portal' | '/billing/donate', body?: object) {
    setError(null);
    setBusy(path);
    try {
      const { url } = await api<{ url: string }>(path, { method: 'POST', body });
      if (Platform.OS === 'web') {
        globalThis.location.assign(url);
        return;
      }
      await WebBrowser.openBrowserAsync(url);
      loadMine();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const prices = plans?.pro.prices ?? [];
  const local = prices.filter((p) => p.currency === currencyFor(locale));
  const shown = local.length ? local : prices.filter((p) => p.currency === 'USD');

  const money = (amount: number, currency: string) => amount.toLocaleString(locale, { style: 'currency', currency });

  const giftCurrency = currencyFor(locale);
  const presets = PRESETS[giftCurrency];
  const [min, max] = plans?.donation_limits?.[giftCurrency] ?? DEFAULT_LIMITS[giftCurrency];
  const giftAmount = gift === 'other' ? parseAmount(custom) : Number(gift);
  const giftValid = Number.isFinite(giftAmount) && giftAmount >= min && giftAmount <= max;

  return (
    <Screen>
      <View style={{ alignItems: 'center', gap: 8 }}>
        <Seal size={72} />
        <Text variant="title" style={{ textAlign: 'center' }}>
          {t('pro.title')}
        </Text>
        <Text variant="muted" style={{ textAlign: 'center' }}>
          {t('pro.subtitle')}
        </Text>
      </View>

      {mine?.plan === 'pro' ? (
        <Notice kind="success">
          {t('pro.youArePro')}
          {mine.subscription?.current_period_end ? ` ${t('pro.until', { date: new Date(mine.subscription.current_period_end).toLocaleDateString(locale) })}` : ''}
        </Notice>
      ) : null}

      {!plans ? (
        <ActivityIndicator color={colors.gold} />
      ) : (
        <>
          <Card>
            <Text variant="heading">{t('pro.freeTitle')}</Text>
            <Text variant="muted">{t('pro.freeBody', { daily: plans.free.ai_daily, monthly: plans.free.ai_monthly })}</Text>
          </Card>
          <Card style={{ borderColor: colors.gold }}>
            <Text variant="heading">{t('pro.supporterName')}</Text>
            {(['ai_unlimited', 'advanced_analysis', 'sermon_ai_tools', 'priority_support'] as const).map((f) => (
              <View key={f} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                <Ionicons name="checkmark-circle" size={18} color={colors.gold} style={{ marginTop: 3 }} />
                <Text variant="body" style={{ flex: 1 }}>
                  {t(`pro.features.${f}`)}
                </Text>
              </View>
            ))}
            {shown.length ? (
              shown.map((p) => (
                <Text key={p.interval} variant="heading" style={{ color: colors.gold }}>
                  {money(p.amount, p.currency)} / {t(p.interval === 'month' ? 'pro.month' : 'pro.year')}
                </Text>
              ))
            ) : (
              <Text variant="small">{t('pro.priceSoon')}</Text>
            )}
          </Card>
          {checkout === 'success' && mine?.plan !== 'pro' ? <Notice kind="success">{t('pro.checkoutSuccess')}</Notice> : null}
          {checkout === 'cancel' ? <Notice>{t('pro.checkoutCancel')}</Notice> : null}
          {error ? <Notice kind="error">{error}</Notice> : null}
          {mine?.plan !== 'pro' ? (
            plans.checkout_available && shown.length ? (
              <>
                {shown.map((p) => (
                  <Button
                    key={p.interval}
                    kind={p.interval === 'month' ? 'primary' : 'secondary'}
                    icon="sparkles"
                    title={t(p.interval === 'month' ? 'pro.subscribeMonthly' : 'pro.subscribeYearly')}
                    loading={busy === '/billing/checkout'}
                    onPress={() => open('/billing/checkout', { interval: p.interval })}
                  />
                ))}
                <Text variant="small" style={{ textAlign: 'center' }}>
                  {t('pro.securePayment')}
                </Text>
              </>
            ) : (
              <>
                <Button title={t('pro.subscribe')} icon="sparkles" onPress={() => setNotice(true)} />
                {notice ? <Notice>{t('pro.checkoutSoon')}</Notice> : null}
              </>
            )
          ) : mine.subscription?.source === 'stripe' ? (
            <Button kind="secondary" icon="card-outline" title={t('pro.manage')} loading={busy === '/billing/portal'} onPress={() => open('/billing/portal')} />
          ) : null}

          <Divider />
          <Card>
            <Text variant="heading">{t('pro.donateTitle')}</Text>
            <Text variant="muted">{t('pro.donateHint')}</Text>
            {donation === 'success' ? <Notice kind="success">{t('pro.donationThanks')}</Notice> : null}
            {donation === 'cancel' ? <Notice>{t('pro.checkoutCancel')}</Notice> : null}
            <Segmented
              value={gift}
              onChange={setGift}
              options={[
                ...presets.map((v) => ({ value: String(v), label: money(v, giftCurrency).replace(/[.,]00$/, '') })),
                { value: 'other', label: t('pro.donateOther') },
              ]}
            />
            {gift === 'other' ? (
              <TextField
                label={t('pro.donateOther')}
                value={custom}
                onChangeText={setCustom}
                keyboardType="decimal-pad"
                placeholder={money(min, giftCurrency)}
                error={custom && !giftValid ? t('pro.donateInvalid', { min: money(min, giftCurrency), max: money(max, giftCurrency) }) : null}
              />
            ) : null}
            {plans.checkout_available ? (
              <Button
                icon="heart"
                title={t('pro.donateButton', { amount: giftValid ? money(giftAmount, giftCurrency) : '' }).trim()}
                disabled={!giftValid}
                loading={busy === '/billing/donate'}
                onPress={() => open('/billing/donate', { amount: giftAmount.toFixed(2), currency: giftCurrency })}
              />
            ) : (
              <Notice>{t('pro.checkoutSoon')}</Notice>
            )}
          </Card>
        </>
      )}
    </Screen>
  );
}

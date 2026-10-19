import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Card, Screen, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { devotionalApi, type PlanSummary } from '@/lib/devotional';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme';

export default function PlanCatalog() {
  // Planos de leitura: só o administrador
  const isAdmin = !!useSession().user?.roles.includes('admin');
  const { t } = useI18n();
  const { colors } = useTheme();
  const [plans, setPlans] = useState<PlanSummary[] | null>(null);

  useEffect(() => {
    devotionalApi
      .plans()
      .then((r) => setPlans(r.plans))
      .catch(() => setPlans([]));
  }, []);

  if (!isAdmin) return <Redirect href="/devotional" />;
  if (!plans) return <Screen center><ActivityIndicator color={colors.gold} /></Screen>;

  return (
    <Screen>
      {plans.map((p) => (
        <Pressable
          key={p.code}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/devotionals/plan/[code]', params: { code: p.code } })}>
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <Text variant="heading" style={{ flex: 1 }}>
                {p.title}
              </Text>
              <Text variant="small">{t('devotional.days', { n: p.days })}</Text>
            </View>
            <Text variant="muted">{p.description}</Text>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}

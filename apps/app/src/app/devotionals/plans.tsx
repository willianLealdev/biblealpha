import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Card, Screen, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { devotionalApi, type PlanSummary } from '@/lib/devotional';
import { useTheme } from '@/theme';

// Ordem dos grupos na lista
const CATEGORIES = ['whole', 'testament', 'book', 'topical'] as const;

export default function PlanCatalog() {
  const { t } = useI18n();
  const { colors } = useTheme();
  const [plans, setPlans] = useState<PlanSummary[] | null>(null);

  useEffect(() => {
    devotionalApi
      .plans()
      .then((r) => setPlans(r.plans))
      .catch(() => setPlans([]));
  }, []);

  if (!plans) return <Screen center><ActivityIndicator color={colors.gold} /></Screen>;

  return (
    <Screen>
      <Text variant="muted">{t('devotional.plansIntro', { n: plans.length })}</Text>
      {CATEGORIES.map((cat) => {
        const list = plans.filter((p) => p.category === cat);
        if (!list.length) return null;
        return (
          <View key={cat} style={{ gap: 10 }}>
            <Text variant="label">{t(`devotional.planCat.${cat}`)}</Text>
            {list.map((p) => (
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
          </View>
        );
      })}
    </Screen>
  );
}

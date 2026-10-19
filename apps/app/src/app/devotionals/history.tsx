import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { DevotionalView } from '@/components/devotional-view';
import { Button, Card, Screen, Segmented, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { devotionalApi, type Devotional } from '@/lib/devotional';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme';

/** Meus devocionais: os que o usuário concluiu, para reler quando quiser. */
export default function DevotionalHistory() {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const isAdmin = !!useSession().user?.roles.includes('admin');
  // O administrador também vê os devocionais que preparou com a IA
  const [filter, setFilter] = useState<'completed' | 'all'>('completed');
  const [items, setItems] = useState<Devotional[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (filter === 'completed' ? devotionalApi.completed() : devotionalApi.mine())
      .then((r) => active && setItems(r.devotionals))
      .catch(() => active && setItems([]));
    return () => {
      active = false;
    };
  }, [filter]);

  async function copy(d: Devotional) {
    const c = d.content;
    const parts = [
      c.title,
      `${d.reference} (${d.translation})\n${d.verses.map((v) => v.text).join(' ')}`,
      c.reflection,
      c.application,
      c.prayer,
      'BibleAlpha',
    ];
    await Clipboard.setStringAsync(parts.filter(Boolean).join('\n\n'));
    setCopied(d.id);
    setTimeout(() => setCopied(null), 2500);
  }

  const dateOf = (d: Devotional) => {
    const when = d.mine?.completed_on ?? d.day ?? d.created_at;
    return when ? new Date(when.length === 10 ? `${when}T12:00:00` : when).toLocaleDateString(locale, { dateStyle: 'long' }) : '';
  };

  return (
    <Screen>
      {isAdmin ? (
        <Segmented
          value={filter}
          onChange={(v) => {
            setItems(null);
            setFilter(v);
          }}
          options={[
            { value: 'completed', label: t('devotional.done') },
            { value: 'all', label: t('devotional.all') },
          ]}
        />
      ) : null}
      {items === null ? <ActivityIndicator color={colors.gold} /> : null}
      {items?.length === 0 ? <Text variant="muted">{t('devotional.emptyHistory')}</Text> : null}
      {items?.map((d) => (
        <Card key={d.mine?.id ?? d.id}>
          <Pressable accessibilityRole="button" onPress={() => setOpen(open === d.id ? null : d.id)} style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text variant="heading" style={{ flex: 1 }}>
                {d.content.title}
              </Text>
              {d.mine?.favorite ? <Ionicons name="heart" size={16} color={colors.gold} /> : null}
              <Ionicons name={open === d.id ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
            </View>
            <Text variant="small">
              {d.reference} · {dateOf(d)}
            </Text>
          </Pressable>
          {open === d.id ? (
            <>
              <DevotionalView d={d} review={isAdmin} />
              <Button
                kind="secondary"
                icon={copied === d.id ? 'checkmark' : 'copy-outline'}
                title={copied === d.id ? t('devotional.copiedShare') : t('devotional.copyShare')}
                onPress={() => copy(d)}
              />
            </>
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}

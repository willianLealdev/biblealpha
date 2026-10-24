import { Text as RNText, View } from 'react-native';

import { useI18n } from '@/i18n';
import type { AccountRow } from '@/lib/admin';
import { useTheme } from '@/theme';
import { fonts, radius } from '@/theme/tokens';

/** "há 5 min", "há 3 h", "há 2 dias" — ou a data quando faz muito tempo. */
export function useAgo() {
  const { t, locale } = useI18n();
  return (iso: string | null) => {
    if (!iso) return t('adminUsers.never');
    const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (min < 1) return t('adminUsers.justNow');
    if (min < 60) return t('adminUsers.minAgo', { n: min });
    if (min < 60 * 24) return t('adminUsers.hoursAgo', { n: Math.round(min / 60) });
    if (min < 60 * 24 * 30) return t('adminUsers.daysAgo', { n: Math.round(min / 60 / 24) });
    return new Date(iso).toLocaleDateString(locale);
  };
}

function Chip({ label, tone }: { label: string; tone: 'ok' | 'warn' | 'bad' | 'plain' }) {
  const { colors } = useTheme();
  const color = { ok: colors.success, warn: colors.gold, bad: colors.danger, plain: colors.textMuted }[tone];
  return (
    <View style={{ borderWidth: 1, borderColor: color, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
      <RNText style={{ color, fontFamily: fonts.bodyMedium, fontSize: 11 }}>{label}</RNText>
    </View>
  );
}

export function StatusChips({ row }: { row: Pick<AccountRow, 'online' | 'blocked' | 'locked' | 'verified' | 'plan'> }) {
  const { t } = useI18n();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {row.online ? <Chip label={t('adminUsers.online')} tone="ok" /> : null}
      {row.blocked ? <Chip label={t('adminUsers.blockedChip')} tone="bad" /> : null}
      {row.locked ? <Chip label={t('adminUsers.lockedChip')} tone="warn" /> : null}
      {!row.verified ? <Chip label={t('adminUsers.unverifiedChip')} tone="plain" /> : null}
      {row.plan === 'pro' ? <Chip label="PRO" tone="warn" /> : null}
    </View>
  );
}

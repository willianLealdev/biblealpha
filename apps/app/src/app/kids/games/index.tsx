import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BADGES, categoryKey, gameName, GAMES, levelOf } from '@/kids/journey';
import { useKidsProgress } from '@/kids/progress';
import { useKidsText } from '@/kids/strings';
import { kidsColors, kidsFonts, kidsRadius } from '@/kids/theme';
import { BackButton, KidsScreen } from '@/kids/ui';

/** Jogos da Bíblia com a Jornada Bíblica: nível, pontos, estrelas e conquistas. */
export default function KidsGames() {
  const { t } = useKidsText();
  const progress = useKidsProgress();
  const { level, inLevel, next } = levelOf(progress.xp);
  const badges = BADGES.filter((b) => b.done(progress));

  return (
    <KidsScreen>
      <BackButton />
      <Text style={styles.title} accessibilityRole="header">
        🎮 {t('games_title')}
      </Text>

      <View style={styles.journey}>
        <Text style={styles.journeyTitle}>🗺️ {t('journey_title')}</Text>
        <View style={styles.journeyRow}>
          <Text style={styles.level}>{t('journey_level', { n: level })}</Text>
          <Text style={styles.small}>{t('journey_xp', { xp: inLevel, next })}</Text>
        </View>
        <View style={styles.bar}>
          <View style={[styles.barFill, { width: `${Math.round((inLevel / next) * 100)}%` }]} />
        </View>
        <View style={styles.journeyRow}>
          <Text style={styles.small}>⭐ {t('journey_stars', { n: progress.stars })}</Text>
          <Text style={styles.small}>🏅 {t('journey_badges', { n: badges.length })}</Text>
        </View>
        <View style={styles.badges}>
          {BADGES.map((b) => {
            const done = b.done(progress);
            return (
              <View key={b.id} style={[styles.badge, !done && { opacity: 0.35 }]} accessibilityLabel={t(b.label)}>
                <Text style={styles.badgeEmoji}>{done ? b.emoji : '🔒'}</Text>
                <Text style={styles.badgeText} numberOfLines={2}>
                  {t(b.label)}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.grid}>
        {GAMES.map((g) => {
          const times = progress.played[g.id] ?? 0;
          return (
            <Pressable
              key={g.id}
              accessibilityRole="button"
              accessibilityLabel={t(gameName(g.id))}
              onPress={() => router.push(g.route)}
              style={({ pressed }) => [styles.tile, { backgroundColor: g.color, opacity: pressed ? 0.85 : 1 }]}>
              <Text style={styles.tileEmoji}>{g.emoji}</Text>
              <Text style={styles.tileName}>{t(gameName(g.id))}</Text>
              <Text style={styles.tileMeta}>
                {t(categoryKey(g.category))} · {t('ages', { a: g.ages[0], b: g.ages[1] })}
              </Text>
              {times ? <Text style={styles.done}>✓ {times}</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </KidsScreen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: kidsFonts.bold, fontSize: 30, color: kidsColors.text },
  journey: { backgroundColor: kidsColors.card, borderRadius: kidsRadius.lg, borderWidth: 3, borderColor: kidsColors.yellow, padding: 16, gap: 10 },
  journeyTitle: { fontFamily: kidsFonts.bold, fontSize: 20, color: kidsColors.text },
  journeyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  level: { fontFamily: kidsFonts.bold, fontSize: 24, color: kidsColors.orange },
  small: { fontFamily: kidsFonts.bold, fontSize: 15, color: kidsColors.textMuted },
  bar: { height: 16, borderRadius: 8, backgroundColor: kidsColors.border, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: kidsColors.yellow, borderRadius: 8 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: { width: 92, alignItems: 'center', gap: 2 },
  badgeEmoji: { fontSize: 30 },
  badgeText: { fontFamily: kidsFonts.regular, fontSize: 12, color: kidsColors.text, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { flexBasis: '46%', flexGrow: 1, minWidth: 150, minHeight: 150, borderRadius: kidsRadius.lg, padding: 14, alignItems: 'center', justifyContent: 'center', gap: 4 },
  tileEmoji: { fontSize: 44, lineHeight: 54 },
  tileName: { fontFamily: kidsFonts.bold, fontSize: 18, lineHeight: 23, color: kidsColors.onColor, textAlign: 'center' },
  tileMeta: { fontFamily: kidsFonts.regular, fontSize: 13, color: kidsColors.onColor, textAlign: 'center' },
  done: { position: 'absolute', top: 8, right: 10, fontFamily: kidsFonts.bold, fontSize: 13, color: kidsColors.onColor },
});

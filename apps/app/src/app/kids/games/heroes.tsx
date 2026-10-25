import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GameShell } from '@/kids/game-ui';
import { type Hero, heroName, heroQuality, heroRef, HEROES, heroStory, unlockedHeroes } from '@/kids/heroes';
import { gameName, GAMES } from '@/kids/journey';
import { useKidsProgress } from '@/kids/progress';
import { useSpeaker } from '@/kids/speak';
import { useKidsText } from '@/kids/strings';
import { kidsColors, kidsFonts, kidsRadius, tileColors } from '@/kids/theme';
import { PillButton } from '@/kids/ui';

/** Heróis da Fé: álbum de cartas. Cada carta se ganha jogando o jogo da história do herói. */
export default function Heroes() {
  const { t, language } = useKidsText();
  const { played } = useKidsProgress();
  const { speak } = useSpeaker(language);
  const [open, setOpen] = useState<Hero | null>(null);
  const unlocked = unlockedHeroes(played).map((h) => h.id);

  if (open) {
    const has = unlocked.includes(open.id);
    const color = tileColors[HEROES.indexOf(open) % tileColors.length];
    const game = GAMES.find((g) => g.id === open.game);
    return (
      <GameShell game="heroes">
        <View style={[styles.bigCard, { borderColor: color }]}>
          <Text style={styles.bigEmoji}>{has ? open.emoji : '🔒'}</Text>
          <Text style={styles.bigName}>{t(heroName(open.id))}</Text>
          {has ? (
            <>
              <Text style={[styles.quality, { backgroundColor: color }]}>
                {t('heroes_quality')}: {t(heroQuality(open.id))}
              </Text>
              <Text style={styles.story}>{t(heroStory(open.id))}</Text>
              <Text style={styles.ref}>📜 {t(heroRef(open.id))}</Text>
              <PillButton label={t('listen')} color={kidsColors.blue} onPress={() => speak(`${t(heroName(open.id))}. ${t(heroStory(open.id))}`)} />
            </>
          ) : (
            <>
              <Text style={styles.story}>{t('heroes_unlock', { game: t(gameName(open.game)) })}</Text>
              {game ? <PillButton label={`${game.emoji} ${t(gameName(game.id))}`} color={kidsColors.orange} onPress={() => router.push(game.route)} /> : null}
            </>
          )}
        </View>
        <PillButton label={t('back')} color={kidsColors.purple} active={false} onPress={() => setOpen(null)} />
      </GameShell>
    );
  }

  return (
    <GameShell game="heroes" status={t('heroes_count', { n: unlocked.length, total: HEROES.length })}>
      <View style={styles.album}>
        {HEROES.map((h, i) => {
          const has = unlocked.includes(h.id);
          return (
            <Pressable
              key={h.id}
              accessibilityRole="button"
              accessibilityLabel={has ? t(heroName(h.id)) : t('heroes_unlock', { game: t(gameName(h.game)) })}
              onPress={() => setOpen(h)}
              style={({ pressed }) => [
                styles.card,
                { borderColor: tileColors[i % tileColors.length], opacity: pressed ? 0.8 : 1 },
                !has && { backgroundColor: '#EFE9DE' },
              ]}>
              <Text style={[styles.cardEmoji, !has && { opacity: 0.4 }]}>{has ? h.emoji : '❔'}</Text>
              <Text style={styles.cardName} numberOfLines={1}>
                {has ? t(heroName(h.id)) : '???'}
              </Text>
              {has ? <Text style={styles.cardQuality}>{t(heroQuality(h.id))}</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </GameShell>
  );
}

const styles = StyleSheet.create({
  album: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  card: { width: 104, height: 140, borderRadius: kidsRadius.md, borderWidth: 4, backgroundColor: kidsColors.card, alignItems: 'center', justifyContent: 'center', padding: 6, gap: 4 },
  cardEmoji: { fontSize: 42 },
  cardName: { fontFamily: kidsFonts.bold, fontSize: 15, color: kidsColors.text },
  cardQuality: { fontFamily: kidsFonts.regular, fontSize: 12, color: kidsColors.textMuted },
  bigCard: { backgroundColor: kidsColors.card, borderRadius: kidsRadius.lg, borderWidth: 6, padding: 22, alignItems: 'center', gap: 12 },
  bigEmoji: { fontSize: 80 },
  bigName: { fontFamily: kidsFonts.bold, fontSize: 30, color: kidsColors.text },
  quality: { fontFamily: kidsFonts.bold, fontSize: 17, color: kidsColors.onColor, borderRadius: kidsRadius.pill, overflow: 'hidden', paddingHorizontal: 14, paddingVertical: 4 },
  story: { fontFamily: kidsFonts.regular, fontSize: 20, lineHeight: 28, color: kidsColors.text, textAlign: 'center' },
  ref: { fontFamily: kidsFonts.regular, fontSize: 15, color: kidsColors.textMuted },
});

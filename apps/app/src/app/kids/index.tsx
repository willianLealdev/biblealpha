import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useKidsProgress } from '@/kids/progress';
import { type KidsKey, useKidsText } from '@/kids/strings';
import { kidsColors, kidsFonts } from '@/kids/theme';
import { BigTile, KidsScreen, Mascot, PillButton } from '@/kids/ui';

const GREETINGS: KidsKey[] = ['hello', 'hello2', 'hello3'];
const LANGUAGE_LABEL: Record<string, string> = { 'pt-BR': 'Português', en: 'English', es: 'Español' };

/** Início do BibleAlpha Kids: mascote, escolha do nível e botões enormes. */
export default function KidsHome() {
  const { t, language } = useKidsText();
  const { level, setLevel, stars } = useKidsProgress();
  const [message, setMessage] = useState<KidsKey>('hello');

  const soon = () => setMessage('soon');
  const nextGreeting = () => setMessage((m) => GREETINGS[(GREETINGS.indexOf(m) + 1) % GREETINGS.length]);

  const tiles: { emoji: string; label: KidsKey; color: string; onPress?: () => void; onlyBig?: boolean }[] = [
    { emoji: '📖', label: 'stories', color: kidsColors.orange, onPress: () => router.push('/kids/stories') },
    { emoji: '🧩', label: 'games', color: kidsColors.blue, onPress: () => router.push('/kids/games') },
    { emoji: '❓', label: 'quiz', color: kidsColors.purple, onPress: () => router.push('/kids/quiz') },
    { emoji: '⭐', label: 'verse', color: kidsColors.green, onPress: () => router.push('/kids/verses') },
    { emoji: '📜', label: 'bible', color: kidsColors.pink, onlyBig: true, onPress: () => router.push('/kids/bible') },
    { emoji: '🎬', label: 'videos', color: kidsColors.yellow, onPress: () => router.push('/kids/videos') },
  ];

  return (
    <KidsScreen>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('chooseLanguage')}
        onPress={() => router.push('/kids/language')}
        style={({ pressed }) => [styles.language, { opacity: pressed ? 0.7 : 1 }]}>
        <Text style={styles.languageText}>🌐 {LANGUAGE_LABEL[language] ?? language.toUpperCase()}</Text>
      </Pressable>
      <Text style={styles.brand} accessibilityRole="header">
        {t('appName')}
      </Text>
      <Mascot message={t(message)} onPress={nextGreeting} />
      {stars > 0 ? (
        <Text style={styles.stars} accessibilityLabel={`${stars} ⭐`}>
          ⭐ {stars}
        </Text>
      ) : null}
      <View style={styles.levels}>
        <PillButton label={`🐣 ${t('small')}`} active={level === 'small'} color={kidsColors.orange} onPress={() => setLevel('small')} style={{ flex: 1 }} />
        <PillButton label={`🦒 ${t('big')}`} active={level === 'big'} color={kidsColors.purple} onPress={() => setLevel('big')} style={{ flex: 1 }} />
      </View>
      <View style={styles.grid}>
        {tiles
          .filter((tile) => !tile.onlyBig || level === 'big')
          .map((tile) => (
            <BigTile
              key={tile.label}
              emoji={tile.emoji}
              label={t(tile.label)}
              color={tile.color}
              onPress={tile.onPress ?? soon}
              badge={tile.onPress ? undefined : t('soon')}
              dimmed={!tile.onPress}
            />
          ))}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('parents')}
        onPress={() => router.push('/kids/parents')}
        style={({ pressed }) => [styles.parents, { opacity: pressed ? 0.6 : 1 }]}>
        <Text style={styles.parentsText}>🔒 {t('parents')}</Text>
      </Pressable>
    </KidsScreen>
  );
}

const styles = StyleSheet.create({
  language: {
    alignSelf: 'flex-end',
    backgroundColor: kidsColors.card,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: kidsColors.blue,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  languageText: { fontFamily: kidsFonts.bold, fontSize: 17, color: kidsColors.blue },
  brand: { fontFamily: kidsFonts.bold, fontSize: 30, color: kidsColors.orange, textAlign: 'center' },
  levels: { flexDirection: 'row', gap: 12 },
  stars: { fontFamily: kidsFonts.bold, fontSize: 24, color: kidsColors.orange, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  parents: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 16 },
  parentsText: { fontFamily: kidsFonts.regular, fontSize: 15, color: kidsColors.textMuted },
});

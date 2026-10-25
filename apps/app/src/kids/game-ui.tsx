// Moldura comum dos jogos: título, instrução com voz e o final com o ensinamento bíblico.

import { router } from 'expo-router';
import { type ReactNode, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Celebrate } from './celebrate';
import { gameDesc, gameLesson, gameName, gameRef, GAMES } from './journey';
import { useKidsProgress } from './progress';
import { useSpeaker } from './speak';
import { useKidsText } from './strings';
import { kidsColors, kidsFonts, kidsRadius } from './theme';
import { BackButton, KidsScreen, PillButton } from './ui';

export function GameShell({ game, children, status }: { game: string; children: ReactNode; status?: string }) {
  const { t, language } = useKidsText();
  const { speaking, toggle } = useSpeaker(language);
  const info = GAMES.find((g) => g.id === game);
  return (
    <KidsScreen>
      <BackButton to="/kids/games" />
      <Text style={styles.title} accessibilityRole="header">
        {info?.emoji} {t(gameName(game))}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('listen')}
        onPress={() => toggle(t(gameDesc(game)))}
        style={[styles.help, { borderColor: info?.color ?? kidsColors.blue }]}>
        <Text style={styles.helpText}>{t(gameDesc(game))}</Text>
        <Text style={styles.listen}>{speaking ? t('stopListen') : t('listen')}</Text>
      </Pressable>
      {status ? <Text style={styles.status}>{status}</Text> : null}
      {children}
    </KidsScreen>
  );
}

/** Final do jogo: estrelas, ensinamento com a passagem e botões. Conta na Jornada uma vez. */
export function GameEnd({ game, stars, onAgain, extra }: { game: string; stars: number; onAgain: () => void; extra?: string }) {
  const { t, language } = useKidsText();
  const { finishGame } = useKidsProgress();
  const { speak } = useSpeaker(language);
  const counted = useRef(false);
  const won = Math.max(1, Math.min(3, Math.round(stars)));

  useEffect(() => {
    if (counted.current) return;
    counted.current = true;
    finishGame(game, won);
    speak(`${t('game_end')} ${t(gameLesson(game))}`);
    // só na primeira vez que o final aparece
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={{ gap: 14 }}>
      <Celebrate title={extra ?? t('game_end')} subtitle={`${'⭐'.repeat(won)}  ${t('game_stars', { n: won })}`} />
      <View style={styles.lesson}>
        <Text style={styles.lessonTitle}>📜 {t('game_lesson')}</Text>
        <Text style={styles.lessonText}>{t(gameLesson(game))}</Text>
        <Text style={styles.ref}>{t(gameRef(game))}</Text>
      </View>
      <View style={styles.row}>
        <PillButton label={t('playAgain')} color={kidsColors.blue} onPress={onAgain} style={{ flex: 1 }} />
        <PillButton label={`🎮 ${t('game_back')}`} color={kidsColors.orange} onPress={() => router.replace('/kids/games')} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

/** Botão grande de resposta (usado nas perguntas dos jogos). */
export function AnswerButton({
  label,
  color,
  state,
  onPress,
}: {
  label: string;
  color: string;
  state?: 'right' | 'wrong';
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.answer,
        {
          backgroundColor: state === 'right' ? kidsColors.green : state === 'wrong' ? kidsColors.border : color,
          opacity: pressed ? 0.85 : state === 'wrong' ? 0.6 : 1,
        },
      ]}>
      <Text style={[styles.answerText, state === 'wrong' && { color: kidsColors.textMuted }]}>
        {state === 'right' ? '✅ ' : state === 'wrong' ? '✖️ ' : ''}
        {label}
      </Text>
    </Pressable>
  );
}

/** Embaralha (Fisher-Yates) sem mexer na lista original. */
export function shuffled<T>(list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const gameStyles = StyleSheet.create({
  card: {
    backgroundColor: kidsColors.card,
    borderRadius: kidsRadius.lg,
    borderWidth: 3,
    borderColor: kidsColors.border,
    padding: 18,
    gap: 10,
  },
  big: { fontFamily: kidsFonts.bold, fontSize: 24, lineHeight: 32, color: kidsColors.text, textAlign: 'center' },
  info: { fontFamily: kidsFonts.bold, fontSize: 19, color: kidsColors.purple, textAlign: 'center' },
});

const styles = StyleSheet.create({
  title: { fontFamily: kidsFonts.bold, fontSize: 28, lineHeight: 34, color: kidsColors.text },
  help: { backgroundColor: kidsColors.card, borderRadius: kidsRadius.md, borderWidth: 3, padding: 14, gap: 6 },
  helpText: { fontFamily: kidsFonts.regular, fontSize: 18, lineHeight: 25, color: kidsColors.text },
  listen: { fontFamily: kidsFonts.bold, fontSize: 15, color: kidsColors.blue },
  status: { fontFamily: kidsFonts.bold, fontSize: 19, color: kidsColors.purple, textAlign: 'center' },
  lesson: { backgroundColor: kidsColors.card, borderRadius: kidsRadius.lg, borderWidth: 3, borderColor: kidsColors.green, padding: 18, gap: 8 },
  lessonTitle: { fontFamily: kidsFonts.bold, fontSize: 18, color: kidsColors.green },
  lessonText: { fontFamily: kidsFonts.bold, fontSize: 21, lineHeight: 29, color: kidsColors.text },
  ref: { fontFamily: kidsFonts.regular, fontSize: 16, color: kidsColors.textMuted },
  row: { flexDirection: 'row', gap: 12 },
  answer: { minHeight: 64, borderRadius: kidsRadius.md, paddingHorizontal: 16, paddingVertical: 12, justifyContent: 'center' },
  answerText: { fontFamily: kidsFonts.bold, fontSize: 20, color: kidsColors.onColor, textAlign: 'center' },
});

import { useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { GameEnd, GameShell, gameStyles } from '@/kids/game-ui';
import { useKidsProgress } from '@/kids/progress';
import { useSpeaker } from '@/kids/speak';
import { type KidsKey, useKidsText } from '@/kids/strings';
import { kidsColors, kidsFonts, kidsRadius } from '@/kids/theme';
import { PillButton } from '@/kids/ui';

// Três lugares para procurar (só emojis que todo aparelho desenha)
const SCENES = [
  { name: 'sheep_scene1', bg: '#DFF5E1', tiles: ['🌳', '🌲', '🌿', '🌳'] },
  { name: 'sheep_scene2', bg: '#E6ECF7', tiles: ['⛰️', '🌲', '🏔️', '🌲'] },
  { name: 'sheep_scene3', bg: '#FFF4D6', tiles: ['🌾', '🌻', '🌼', '🌿'] },
];

/** Encontre a ovelhinha perdida: procurar nos arbustos seguindo as pistas (Lucas 15:3–7). */
export default function Sheep() {
  const { t, language } = useKidsText();
  const { level } = useKidsProgress();
  const { speak } = useSpeaker(language);
  const { width } = useWindowDimensions();
  const cols = level === 'big' ? 5 : 4;
  const rows = level === 'big' ? 4 : 3;
  const total = cols * rows;
  const hide = () => Math.floor(Math.random() * total);
  const [scene, setScene] = useState(0);
  const [hidden, setHidden] = useState(hide);
  const [searched, setSearched] = useState<number[]>([]);
  const [found, setFound] = useState(false);
  const [taps, setTaps] = useState(0);
  const [clue, setClue] = useState<string | null>(null);
  const cell = Math.floor(Math.min(width - 40, 520) / cols);
  const finished = scene >= SCENES.length;

  function tap(i: number) {
    if (found || searched.includes(i)) return;
    setTaps((n) => n + 1);
    if (i === hidden) {
      setFound(true);
      setClue(t('sheep_found'));
      speak(t('sheep_found'));
      return;
    }
    setSearched((s) => [...s, i]);
    const [r, c, hr, hc] = [Math.floor(i / cols), i % cols, Math.floor(hidden / cols), hidden % cols];
    const where = [hr < r ? t('sheep_up') : hr > r ? t('sheep_down') : null, hc < c ? t('sheep_left') : hc > c ? t('sheep_right') : null]
      .filter(Boolean)
      .join(' · ');
    const text = t('sheep_clue', { where });
    setClue(text);
    speak(text);
  }

  function nextScene() {
    setScene((s) => s + 1);
    setHidden(hide());
    setSearched([]);
    setFound(false);
    setClue(null);
  }

  function again() {
    setScene(0);
    setTaps(0);
    setHidden(hide());
    setSearched([]);
    setFound(false);
    setClue(null);
  }

  if (finished) {
    const per = taps / SCENES.length;
    return (
      <GameShell game="sheep">
        <View style={[gameStyles.card, { alignItems: 'center' }]}>
          <Text style={{ fontSize: 64 }}>🧑‍🌾🐑💛</Text>
        </View>
        <GameEnd game="sheep" stars={per <= total / 4 ? 3 : per <= total / 2 ? 2 : 1} onAgain={again} />
      </GameShell>
    );
  }

  const s = SCENES[scene];
  return (
    <GameShell game="sheep" status={`${t(s.name as KidsKey)} · ${scene + 1}/${SCENES.length}`}>
      <View style={[styles.scene, { backgroundColor: s.bg, width: cell * cols + 8 }]}>
        {Array.from({ length: total }, (_, i) => {
          const isSheep = found && i === hidden;
          const looked = searched.includes(i);
          return (
            <Pressable key={i} accessibilityRole="button" accessibilityLabel={`${i + 1}`} onPress={() => tap(i)} style={[styles.tile, { width: cell, height: cell }]}>
              <Text style={[styles.emoji, { fontSize: cell * 0.55 }, looked && { opacity: 0.25 }]}>{isSheep ? '🐑' : s.tiles[i % s.tiles.length]}</Text>
            </Pressable>
          );
        })}
      </View>
      {clue ? <Text style={gameStyles.info}>{clue}</Text> : null}
      {found ? <PillButton label={t('nextQuestion')} color={kidsColors.green} onPress={nextScene} /> : null}
    </GameShell>
  );
}

const styles = StyleSheet.create({
  scene: { flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'center', borderRadius: kidsRadius.lg, overflow: 'hidden', borderWidth: 4, borderColor: kidsColors.green },
  tile: { alignItems: 'center', justifyContent: 'center' },
  emoji: { fontFamily: kidsFonts.bold },
});

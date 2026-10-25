import { useState } from 'react';
import { Image, type ImageSourcePropType, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { GameEnd, GameShell, shuffled } from '@/kids/game-ui';
import { useKidsProgress } from '@/kids/progress';
import { useSpeaker } from '@/kids/speak';
import { type KidsKey, useKidsText } from '@/kids/strings';
import { kidsColors, kidsFonts, kidsRadius } from '@/kids/theme';
import { PillButton } from '@/kids/ui';

// Ilustrações da história "A Ovelhinha Perdida" (estilo livro infantil)
const PICTURES: ImageSourcePropType[] = [
  require('@/assets/kids/puzzle-1.webp'),
  require('@/assets/kids/puzzle-2.webp'),
  require('@/assets/kids/puzzle-3.webp'),
  require('@/assets/kids/puzzle-4.webp'),
  require('@/assets/kids/puzzle-5.webp'),
];

function scramble(n: number): number[] {
  let order = shuffled(Array.from({ length: n * n }, (_, i) => i));
  while (order.every((v, i) => v === i)) order = shuffled(order);
  return order;
}

/** Quebra-cabeça: trocar peças de lugar até montar a figura (3×3 Pequenos, 4×4 Grandes). */
export default function Puzzle() {
  const { t, language } = useKidsText();
  const { level } = useKidsProgress();
  const { width } = useWindowDimensions();
  // Tamanhos: 2×2 até 6×6 no celular; em tela grande, até 10×10 (100 peças)
  const sizes = width >= 900 ? [2, 3, 4, 5, 6, 8, 10] : width >= 600 ? [2, 3, 4, 5, 6, 8] : [2, 3, 4, 5, 6];
  const [n, setN] = useState(level === 'big' ? 4 : 3);
  const { speak } = useSpeaker(language);
  const [picture, setPicture] = useState<number | null>(null);
  const [order, setOrder] = useState<number[]>(() => scramble(n));
  const [selected, setSelected] = useState<number | null>(null);
  const [moves, setMoves] = useState(0);
  const [preview, setPreview] = useState(false);
  const board = Math.min(width - 40, 480);
  const piece = board / n;
  const solved = order.length === n * n && order.every((v, i) => v === i);

  function start(p: number, size = n) {
    setPicture(p);
    setOrder(scramble(size));
    setMoves(0);
    setSelected(null);
  }

  function tap(i: number) {
    if (selected === null) return setSelected(i);
    if (selected !== i) {
      const next = [...order];
      [next[selected], next[i]] = [next[i], next[selected]];
      setOrder(next);
      setMoves((m) => m + 1);
    }
    setSelected(null);
  }

  if (picture === null) {
    return (
      <GameShell game="puzzle">
        <Text style={styles.pick}>{t('puzzle_size')}</Text>
        <View style={styles.sizes}>
          {sizes.map((s) => (
            <PillButton key={s} label={t('puzzle_pieces', { n: s * s })} active={n === s} color={kidsColors.pink} onPress={() => setN(s)} textSize={16} />
          ))}
        </View>
        <Text style={styles.pick}>{t('puzzle_pick')}</Text>
        <View style={styles.thumbs}>
          {PICTURES.map((src, i) => (
            <Pressable key={i} accessibilityRole="button" accessibilityLabel={`${i + 1}`} onPress={() => start(i)} style={styles.thumb}>
              <Image source={src} style={{ width: '100%', height: '100%' }} />
            </Pressable>
          ))}
        </View>
      </GameShell>
    );
  }

  if (solved) {
    return (
      <GameShell game="puzzle">
        <Image source={PICTURES[picture]} style={[styles.full, { width: board, height: board }]} />
        {/* Depois de montar, a história daquela figura é contada (Lucas 15:3–7) */}
        <Text style={styles.story} onPress={() => speak(t(`puzzle_story_${picture + 1}` as KidsKey))}>
          🔊 {t(`puzzle_story_${picture + 1}` as KidsKey)}
        </Text>
        <GameEnd game="puzzle" stars={moves <= n * n ? 3 : moves <= n * n * 2 ? 2 : 1} onAgain={() => start((picture + 1) % PICTURES.length)} />
      </GameShell>
    );
  }

  return (
    <GameShell game="puzzle" status={t('puzzle_moves', { n: moves })}>
      {preview ? (
        <Image source={PICTURES[picture]} style={[styles.full, { width: board, height: board }]} />
      ) : (
        // + 8: a borda da moldura (4 de cada lado) não pode tirar espaço das peças
        <View style={[styles.board, { width: board + 8, height: board + 8 }]}>
          {order.map((tile, i) => {
            const row = Math.floor(tile / n);
            const col = tile % n;
            return (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityLabel={`${i + 1}`}
                onPress={() => tap(i)}
                style={[styles.piece, { width: piece, height: piece }, selected === i && styles.selected]}>
                <Image
                  source={PICTURES[picture]}
                  style={{ position: 'absolute', width: board, height: board, left: -col * piece, top: -row * piece }}
                />
              </Pressable>
            );
          })}
        </View>
      )}
      <PillButton label={preview ? `🙈 ${t('puzzle_hide')}` : `👀 ${t('puzzle_show')}`} color={kidsColors.purple} active={!preview} onPress={() => setPreview((p) => !p)} />
    </GameShell>
  );
}

const styles = StyleSheet.create({
  pick: { fontFamily: kidsFonts.bold, fontSize: 20, color: kidsColors.textMuted },
  sizes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  story: { fontFamily: kidsFonts.bold, fontSize: 20, lineHeight: 28, color: kidsColors.text, textAlign: 'center' },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  thumb: { width: 140, height: 140, borderRadius: kidsRadius.md, overflow: 'hidden', borderWidth: 4, borderColor: kidsColors.pink },
  board: { flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'center', borderRadius: kidsRadius.md, overflow: 'hidden', borderWidth: 4, borderColor: kidsColors.pink, backgroundColor: kidsColors.card },
  piece: { overflow: 'hidden', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.7)' },
  selected: { borderWidth: 5, borderColor: kidsColors.yellow, opacity: 0.85 },
  full: { alignSelf: 'center', borderRadius: kidsRadius.md },
});

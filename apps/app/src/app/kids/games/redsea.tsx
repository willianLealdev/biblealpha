import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { GameEnd, GameShell, gameStyles } from '@/kids/game-ui';
import { useKidsProgress } from '@/kids/progress';
import { useKidsText } from '@/kids/strings';
import { kidsColors, kidsRadius } from '@/kids/theme';
import { PillButton } from '@/kids/ui';

const LANES = 3;
const OBSTACLES = ['🐚', '🦀', '🌿', '🐙'];
type Obstacle = { id: number; lane: number; y: number; emoji: string };

/** Travessia do Mar Vermelho: o povo anda pelo caminho seco e desvia dos obstáculos (Êxodo 14). */
export default function RedSea() {
  const { t } = useKidsText();
  const { level } = useKidsProgress();
  const [lane, setLane] = useState(1);
  const [progress, setProgress] = useState(0);
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const [bumps, setBumps] = useState(0);
  const [oops, setOops] = useState(false);
  const laneRef = useRef(lane);
  const listRef = useRef<Obstacle[]>([]);
  const nextId = useRef(0);
  const done = progress >= 100;

  useEffect(() => {
    laneRef.current = lane;
  }, [lane]);

  // O "relógio" do jogo: os obstáculos descem; quem bate perde um pouquinho do caminho (sem castigo)
  useEffect(() => {
    if (done) return;
    const speed = level === 'big' ? 3.2 : 2.2;
    const timer = setInterval(() => {
      let hit = false;
      const moved = listRef.current
        .map((o) => ({ ...o, y: o.y + speed }))
        .filter((o) => {
          if (o.y >= 78 && o.y <= 92 && o.lane === laneRef.current) {
            hit = true;
            return false;
          }
          return o.y < 100;
        });
      if (Math.random() < (level === 'big' ? 0.06 : 0.04)) {
        moved.push({ id: nextId.current++, lane: Math.floor(Math.random() * LANES), y: 0, emoji: OBSTACLES[Math.floor(Math.random() * OBSTACLES.length)] });
      }
      listRef.current = moved;
      setObstacles(moved);
      setProgress((p) => Math.max(0, Math.min(100, p + (level === 'big' ? 0.45 : 0.4) - (hit ? 4 : 0))));
      if (hit) {
        setBumps((b) => b + 1);
        setOops(true);
        setTimeout(() => setOops(false), 900);
      }
    }, 50);
    return () => clearInterval(timer);
  }, [done, level]);

  // No computador, as setas do teclado também mexem
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setLane((l) => Math.max(0, l - 1));
      if (e.key === 'ArrowRight') setLane((l) => Math.min(LANES - 1, l + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function again() {
    setLane(1);
    setProgress(0);
    listRef.current = [];
    setObstacles([]);
    setBumps(0);
  }

  if (done) {
    return (
      <GameShell game="redsea">
        <View style={[gameStyles.card, { alignItems: 'center' }]}>
          <Text style={{ fontSize: 60 }}>🏞️👨‍👩‍👧‍👦🙌</Text>
        </View>
        <GameEnd game="redsea" stars={bumps === 0 ? 3 : bumps <= 3 ? 2 : 1} onAgain={again} />
      </GameShell>
    );
  }

  return (
    <GameShell game="redsea" status={t('rs_progress', { n: Math.round(progress) })}>
      <View style={styles.bar}>
        <View style={[styles.barFill, { width: `${progress}%` }]} />
      </View>
      <View style={styles.sea}>
        <Text style={styles.wall}>🌊{'\n'}🌊{'\n'}🌊{'\n'}🌊{'\n'}🌊</Text>
        <View style={styles.path}>
          {obstacles.map((o) => (
            <Text key={o.id} style={[styles.obstacle, { top: `${o.y}%`, left: `${(o.lane + 0.5) * (100 / LANES)}%` }]}>
              {o.emoji}
            </Text>
          ))}
          <Text style={[styles.people, { left: `${(lane + 0.5) * (100 / LANES)}%` }]}>🚶</Text>
        </View>
        <Text style={styles.wall}>🌊{'\n'}🌊{'\n'}🌊{'\n'}🌊{'\n'}🌊</Text>
      </View>
      {oops ? <Text style={gameStyles.info}>{t('rs_oops')}</Text> : null}
      <View style={styles.row}>
        <PillButton label={'◀︎'} accessibilityLabel={t('previous')} color={kidsColors.blue} onPress={() => setLane((l) => Math.max(0, l - 1))} style={{ flex: 1, minHeight: 76 }} textSize={36} />
        <PillButton label={'▶︎'} accessibilityLabel={t('next')} color={kidsColors.blue} onPress={() => setLane((l) => Math.min(LANES - 1, l + 1))} style={{ flex: 1, minHeight: 76 }} textSize={36} />
      </View>
    </GameShell>
  );
}

const styles = StyleSheet.create({
  bar: { height: 14, borderRadius: 7, backgroundColor: kidsColors.border, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: kidsColors.green },
  sea: { flexDirection: 'row', height: 260, borderRadius: kidsRadius.lg, overflow: 'hidden', backgroundColor: '#1A4FB5' },
  wall: { width: 40, fontSize: 26, lineHeight: 52, textAlign: 'center', backgroundColor: '#3D9BFF' },
  path: { flex: 1, backgroundColor: '#E9C98B' },
  obstacle: { position: 'absolute', fontSize: 34, marginLeft: -18 },
  people: { position: 'absolute', top: '82%', fontSize: 40, marginLeft: -20 },
  row: { flexDirection: 'row', gap: 12 },
});

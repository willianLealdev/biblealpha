import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { GameEnd, GameShell } from '@/kids/game-ui';
import { useKidsProgress } from '@/kids/progress';
import { type KidsKey, useKidsText } from '@/kids/strings';
import { kidsColors, kidsFonts, kidsRadius } from '@/kids/theme';
import { playNote } from '@/kids/tones';
import { PillButton } from '@/kids/ui';

// Melodias simples e originais; a letra de cada uma vem de um versículo
const SONGS = [
  { id: 1, notes: ['C4', 'E4', 'G4', 'G4', 'C4', 'E4', 'G4', 'G4', 'A4', 'G4', 'F4', 'E4', 'D4', 'E4', 'C4'] },
  { id: 2, notes: ['G4', 'A4', 'B4', 'C5', 'B4', 'A4', 'G4', 'E4', 'F4', 'G4', 'A4', 'G4', 'F4', 'E4', 'D4', 'C4'] },
  { id: 3, notes: ['C4', 'E4', 'G4', 'C5', 'C5', 'B4', 'A4', 'G4', 'F4', 'A4', 'G4', 'E4', 'D4', 'G4', 'C4'] },
];
const LANE_COLORS = [kidsColors.pink, kidsColors.yellow, kidsColors.blue];
// Nota grave na pista da esquerda, média no meio, aguda na direita
const laneOf = (note: string) => (['C4', 'D4', 'E4'].includes(note) ? 0 : ['F4', 'G4', 'A4'].includes(note) ? 1 : 2);
const FALL_MS = 2200;
const LINE = 82;

type Note = { i: number; lane: number; note: string; at: number; hit: boolean };

// Hora atual, lida só nos toques e no relógio do jogo
const clock = () => Date.now();

/** Louvor musical: tocar as notas na hora certa e acompanhar a música. */
export default function Worship() {
  const { t } = useKidsText();
  const { level } = useKidsProgress();
  const [song, setSong] = useState<(typeof SONGS)[number] | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [now, setNow] = useState(0);
  const [hits, setHits] = useState(0);
  const startRef = useRef(0);
  const gap = level === 'big' ? 650 : 900;
  const total = notes.length;
  const end = total ? notes[total - 1].at + FALL_MS + 400 : 0;
  const finished = !!song && total > 0 && now > end;

  useEffect(() => {
    if (!song || finished) return;
    const timer = setInterval(() => setNow(clock() - startRef.current), 40);
    return () => clearInterval(timer);
  }, [song, finished]);

  function start(s: (typeof SONGS)[number]) {
    setSong(s);
    setNotes(s.notes.map((note, i) => ({ i, note, lane: laneOf(note), at: 1000 + i * gap, hit: false })));
    setHits(0);
    startRef.current = clock();
    setNow(0);
  }

  const y = (n: Note) => ((now - n.at + FALL_MS) / FALL_MS) * LINE;

  function press(lane: number) {
    const target = notes.find((n) => !n.hit && n.lane === lane && Math.abs(y(n) - LINE) <= 12);
    if (!target) return;
    playNote(target.note);
    setNotes((list) => list.map((n) => (n.i === target.i ? { ...n, hit: true } : n)));
    setHits((h) => h + 1);
  }

  if (!song) {
    return (
      <GameShell game="worship">
        <Text style={styles.pick}>{t('wo_pick')}</Text>
        {SONGS.map((s, i) => (
          <PillButton key={s.id} label={`🎵 ${t(`wo_song${s.id}` as KidsKey)}`} color={LANE_COLORS[i]} onPress={() => start(s)} />
        ))}
      </GameShell>
    );
  }

  if (finished) {
    const ratio = hits / Math.max(1, total);
    return (
      <GameShell game="worship">
        <Text style={styles.lyric}>{t(`wo_lyric${song.id}` as KidsKey)}</Text>
        <GameEnd game="worship" stars={ratio >= 0.8 ? 3 : ratio >= 0.5 ? 2 : 1} onAgain={() => setSong(null)} />
      </GameShell>
    );
  }

  return (
    <GameShell game="worship" status={t('wo_hits', { n: hits, total })}>
      <Text style={styles.lyric}>{t(`wo_lyric${song.id}` as KidsKey)}</Text>
      <View style={styles.stage}>
        {[0, 1, 2].map((lane) => (
          <View key={lane} style={styles.lane} />
        ))}
        <View style={[styles.line, { top: `${LINE}%` }]} />
        {notes
          .filter((n) => !n.hit && y(n) > -5 && y(n) < 100)
          .map((n) => (
            <View key={n.i} style={[styles.note, { top: `${y(n)}%`, left: `${(n.lane + 0.5) * 33.33}%`, backgroundColor: LANE_COLORS[n.lane] }]}>
              <Text style={styles.noteText}>♪</Text>
            </View>
          ))}
      </View>
      <View style={styles.buttons}>
        {[0, 1, 2].map((lane) => (
          <PillButton key={lane} label="🎵" accessibilityLabel={`${lane + 1}`} color={LANE_COLORS[lane]} onPress={() => press(lane)} style={{ flex: 1, minHeight: 80 }} textSize={30} />
        ))}
      </View>
    </GameShell>
  );
}

const styles = StyleSheet.create({
  pick: { fontFamily: kidsFonts.bold, fontSize: 20, color: kidsColors.textMuted },
  lyric: { fontFamily: kidsFonts.bold, fontSize: 20, lineHeight: 28, color: kidsColors.purple, textAlign: 'center' },
  stage: { height: 320, flexDirection: 'row', backgroundColor: '#2B2140', borderRadius: kidsRadius.lg, overflow: 'hidden' },
  lane: { flex: 1, borderRightWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  line: { position: 'absolute', left: 0, right: 0, height: 6, marginTop: -3, backgroundColor: 'rgba(255,255,255,0.8)' },
  note: { position: 'absolute', width: 48, height: 48, borderRadius: 24, marginLeft: -24, marginTop: -24, alignItems: 'center', justifyContent: 'center' },
  noteText: { fontSize: 24, color: kidsColors.onColor, fontFamily: kidsFonts.bold },
  buttons: { flexDirection: 'row', gap: 10 },
});

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GameEnd, GameShell, gameStyles } from '@/kids/game-ui';
import { useKidsProgress } from '@/kids/progress';
import { useSpeaker } from '@/kids/speak';
import { useKidsText } from '@/kids/strings';
import { kidsColors, kidsFonts, kidsRadius } from '@/kids/theme';
import { PillButton } from '@/kids/ui';

type Piece = 'brick' | 'door';

/** Reconstruindo Jerusalém com Neemias: completar o muro e os portões, sem desanimar com a zombaria (Neemias 2–6). */
export default function Nehemiah() {
  const { t, language } = useKidsText();
  const { level } = useKidsProgress();
  const { speak } = useSpeaker(language);
  const size = level === 'big' ? 12 : 8;
  // Os portões ficam em posições fixas do muro (Neemias 3 cita vários portões)
  const gates = level === 'big' ? [2, 7, 10] : [1, 6];
  const [built, setBuilt] = useState<number[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [wrong, setWrong] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [mocked, setMocked] = useState<number[]>([]);
  const [pause, setPause] = useState(false);
  const done = built.length === size;
  const days = Math.round((built.length / size) * 52);

  function place(piece: Piece) {
    if (selected === null) return setMessage(t('ne_pick'));
    const needs: Piece = gates.includes(selected) ? 'door' : 'brick';
    if (piece !== needs) {
      setWrong((w) => w + 1);
      setMessage(t('ne_wrong'));
      return;
    }
    const now = [...built, selected];
    setBuilt(now);
    setSelected(null);
    setMessage(null);
    // A zombaria de Sambalate aparece no meio da obra (Neemias 4:1–9)
    const half = Math.floor(size / 2);
    if (now.length === half && !mocked.includes(half)) {
      setMocked((m) => [...m, half]);
      setPause(true);
      speak(t('ne_mock'));
    }
  }

  function again() {
    setBuilt([]);
    setSelected(null);
    setWrong(0);
    setMessage(null);
    setMocked([]);
    setPause(false);
  }

  if (done) {
    return (
      <GameShell game="nehemiah">
        <View style={[gameStyles.card, { alignItems: 'center' }]}>
          <Text style={{ fontSize: 56 }}>🏰🙌</Text>
          <Text style={gameStyles.info}>52 🗓️</Text>
        </View>
        <GameEnd game="nehemiah" stars={wrong === 0 ? 3 : wrong <= 2 ? 2 : 1} onAgain={again} />
      </GameShell>
    );
  }

  return (
    <GameShell game="nehemiah" status={`${t('ne_done', { n: built.length, total: size })} · 🗓️ ${days}`}>
      <View style={styles.wall}>
        {Array.from({ length: size }, (_, i) => {
          const isBuilt = built.includes(i);
          const isGate = gates.includes(i);
          return (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityLabel={`${i + 1}`}
              disabled={isBuilt || pause}
              onPress={() => {
                setSelected(i);
                setMessage(t('ne_pick'));
              }}
              style={[styles.slot, isBuilt && styles.slotBuilt, selected === i && styles.slotOn]}>
              <Text style={styles.slotText}>{isBuilt ? (isGate ? '🚪' : '🧱') : isGate ? '⬜🚪' : '⬜'}</Text>
            </Pressable>
          );
        })}
      </View>
      {pause ? (
        <View style={styles.mock}>
          <Text style={styles.mockText}>😠 {t('ne_mock')}</Text>
          <PillButton label={t('ne_pray')} color={kidsColors.purple} onPress={() => setPause(false)} />
        </View>
      ) : (
        <>
          {message ? <Text style={gameStyles.info}>{message}</Text> : null}
          <View style={styles.row}>
            <PillButton label={t('ne_brick')} color={kidsColors.orange} onPress={() => place('brick')} style={{ flex: 1 }} />
            <PillButton label={t('ne_door')} color={kidsColors.blue} onPress={() => place('door')} style={{ flex: 1 }} />
          </View>
        </>
      )}
    </GameShell>
  );
}

const styles = StyleSheet.create({
  wall: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', backgroundColor: '#F3E3C7', borderRadius: kidsRadius.lg, padding: 12, borderWidth: 3, borderColor: '#C9A46A' },
  slot: { width: 72, height: 64, borderRadius: kidsRadius.md, backgroundColor: kidsColors.card, borderWidth: 3, borderColor: kidsColors.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  slotBuilt: { borderStyle: 'solid', borderColor: '#C9A46A', backgroundColor: '#FFF4D6' },
  slotOn: { borderColor: kidsColors.purple, borderWidth: 4, borderStyle: 'solid' },
  slotText: { fontSize: 26 },
  row: { flexDirection: 'row', gap: 12 },
  mock: { backgroundColor: '#FFE9E9', borderRadius: kidsRadius.lg, borderWidth: 3, borderColor: kidsColors.pink, padding: 16, gap: 10 },
  mockText: { fontFamily: kidsFonts.bold, fontSize: 19, lineHeight: 26, color: kidsColors.text, textAlign: 'center' },
});

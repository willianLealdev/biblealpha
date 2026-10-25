import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GameEnd, GameShell, gameStyles } from '@/kids/game-ui';
import { useStoredState } from '@/kids/local-state';
import { useSpeaker } from '@/kids/speak';
import { type KidsKey, useKidsText } from '@/kids/strings';
import { kidsColors, kidsFonts, kidsRadius } from '@/kids/theme';
import { PillButton } from '@/kids/ui';

// Uma flor para cada fruto do Espírito (Gálatas 5:22–23)
const FLOWERS = ['🌹', '🌻', '🌼', '🌵', '🌸', '🌷', '🌳', '🍀', '🌺'];
const WATERINGS = 3;
const REST_MS = 3000;

type Plot = { water: number; last: number } | null;

// Hora atual, lida só nos toques e no relógio do jogo
const clock = () => Date.now();

/** Meu jardim bíblico: plantar e regar até cada fruto do Espírito florescer. Fica salvo no aparelho. */
export default function Garden() {
  const { t, language } = useKidsText();
  const { speak } = useSpeaker(language);
  const [plots, setPlots] = useStoredState<Plot[]>('garden', Array(9).fill(null));
  const [message, setMessage] = useState<string | null>(null);
  const grownAll = plots.every((p) => p && p.water >= WATERINGS);
  // A comemoração (e os pontos) só na hora em que a última flor floresce, não ao reabrir o jardim
  const [celebrate, setCelebrate] = useState(false);

  function tap(i: number) {
    const p = plots[i];
    const fruit = t(`fr_${i + 1}` as KidsKey);
    if (!p) {
      setPlots((list) => list.map((x, j) => (j === i ? { water: 0, last: 0 } : x)));
      setMessage(`🌱 ${fruit}`);
      return;
    }
    if (p.water >= WATERINGS) {
      setMessage(t('ga_grown', { value: fruit }));
      speak(t('ga_grown', { value: fruit }));
      return;
    }
    if (clock() - p.last < REST_MS) return setMessage(t('ga_wait'));
    const water = p.water + 1;
    const next = plots.map((x, j) => (j === i ? { water, last: clock() } : x));
    setPlots(next);
    if (next.every((x) => x && x.water >= WATERINGS)) setCelebrate(true);
    if (water >= WATERINGS) {
      setMessage(t('ga_grown', { value: fruit }));
      speak(t('ga_grown', { value: fruit }));
    } else setMessage(`💧 ${t('ga_thirsty')}`);
  }

  if (celebrate && grownAll) {
    return (
      <GameShell game="garden">
        <View style={[gameStyles.card, { alignItems: 'center' }]}>
          <Text style={{ fontSize: 44, textAlign: 'center' }}>{FLOWERS.join(' ')}</Text>
        </View>
        <GameEnd
          game="garden"
          stars={3}
          onAgain={() => {
            setCelebrate(false);
            setPlots(Array(9).fill(null));
          }}
        />
      </GameShell>
    );
  }

  return (
    <GameShell game="garden">
      <View style={styles.garden}>
        {plots.map((p, i) => {
          const stage = !p ? '🟫' : p.water >= WATERINGS ? FLOWERS[i] : p.water >= 2 ? '🌿' : '🌱';
          return (
            <Pressable key={i} accessibilityRole="button" accessibilityLabel={t(`fr_${i + 1}` as KidsKey)} onPress={() => tap(i)} style={styles.plot}>
              <Text style={styles.plant}>{stage}</Text>
              <Text style={styles.label} numberOfLines={1}>
                {p ? t(`fr_${i + 1}` as KidsKey) : t('ga_plant')}
              </Text>
              {p && p.water < WATERINGS ? <Text style={styles.drops}>{'💧'.repeat(p.water)}</Text> : null}
            </Pressable>
          );
        })}
      </View>
      {message ? <Text style={gameStyles.info}>{message}</Text> : null}
      <Text style={styles.hint}>
        {t('ga_plant')} · {t('ga_water')}
      </Text>
      <PillButton label={`🔄 ${t('ga_reset')}`} color={kidsColors.green} active={false} onPress={() => setPlots(Array(9).fill(null))} textSize={16} />
    </GameShell>
  );
}

const styles = StyleSheet.create({
  garden: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', backgroundColor: '#E4F6E1', borderRadius: kidsRadius.lg, padding: 12, borderWidth: 3, borderColor: kidsColors.green },
  plot: { width: 100, height: 110, borderRadius: kidsRadius.md, backgroundColor: '#C9A46A', alignItems: 'center', justifyContent: 'center', gap: 2 },
  plant: { fontSize: 44 },
  label: { fontFamily: kidsFonts.bold, fontSize: 12, color: kidsColors.onColor },
  drops: { fontSize: 12 },
  hint: { fontFamily: kidsFonts.regular, fontSize: 15, color: kidsColors.textMuted, textAlign: 'center' },
});

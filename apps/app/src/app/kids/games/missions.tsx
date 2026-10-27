import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { GameEnd, GameShell, gameStyles } from '@/kids/game-ui';
import { useStoredState } from '@/kids/local-state';
import { useSpeaker } from '@/kids/speak';
import { type KidsKey, useKidsText } from '@/kids/strings';
import { kidsColors, kidsFonts, kidsRadius, tileColors } from '@/kids/theme';
import { PillButton } from '@/kids/ui';

const TOTAL = 12;
const PER_DAY = 3;

/** Número do dia (muda à meia-noite); as 3 missões do dia saem dele, sempre as mesmas no mesmo dia. */
function today() {
  const now = new Date();
  return Math.floor((now.getTime() - now.getTimezoneOffset() * 60_000) / 86_400_000);
}

function missionsOf(day: number): number[] {
  const out: number[] = [];
  for (let k = 0; out.length < PER_DAY; k++) {
    const n = ((day * 7 + k * 5) % TOTAL) + 1;
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

/** Pequenos missionários: 3 missões por dia para fazer na vida real, com a família. */
export default function Missions() {
  const { t, language } = useKidsText();
  const { speak } = useSpeaker(language);
  const day = today();
  const [saved, setSaved] = useStoredState<{ day: number; done: number[] }>('missions', { day, done: [] });
  const done = saved.day === day ? saved.done : [];
  const list = missionsOf(day);
  const complete = list.every((n) => done.includes(n));
  // A comemoração (e os pontos da jornada) aparece só na hora em que a última missão do dia é feita
  const [celebrate, setCelebrate] = useState(false);

  function mark(n: number) {
    const now = [...done, n];
    setSaved({ day, done: now });
    // Última missão: a vitória fala por si (confete e som)
    if (list.every((m) => now.includes(m))) setCelebrate(true);
    else speak(t('mi_done'));
  }

  return (
    <GameShell game="missions" status={`🙌 ${t('mi_today')}`}>
      {list.map((n, i) => {
        const ok = done.includes(n);
        return (
          <View key={n} style={[styles.mission, { borderColor: tileColors[i % tileColors.length] }, ok && { backgroundColor: '#E4F6E1' }]}>
            <Text style={styles.text} onPress={() => speak(t(`mi_${n}` as KidsKey))}>
              {ok ? '✅ ' : '⭐ '}
              {t(`mi_${n}` as KidsKey)}
            </Text>
            <Text style={styles.ref}>📜 {t(`mi_${n}_r` as KidsKey)}</Text>
            {ok ? <Text style={gameStyles.info}>{t('mi_done')}</Text> : <PillButton label={t('mi_mark')} color={kidsColors.green} onPress={() => mark(n)} textSize={17} />}
          </View>
        );
      })}
      {celebrate ? <GameEnd game="missions" stars={3} onAgain={() => setCelebrate(false)} /> : null}
      {complete ? <Text style={gameStyles.info}>{t('mi_tomorrow')}</Text> : null}
    </GameShell>
  );
}

const styles = StyleSheet.create({
  mission: { backgroundColor: kidsColors.card, borderRadius: kidsRadius.lg, borderWidth: 4, padding: 16, gap: 8 },
  text: { fontFamily: kidsFonts.bold, fontSize: 21, lineHeight: 29, color: kidsColors.text },
  ref: { fontFamily: kidsFonts.regular, fontSize: 15, color: kidsColors.textMuted },
});

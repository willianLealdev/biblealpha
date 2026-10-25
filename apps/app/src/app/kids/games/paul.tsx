import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AnswerButton, GameEnd, GameShell, gameStyles, shuffled } from '@/kids/game-ui';
import { useKidsProgress } from '@/kids/progress';
import { useSpeaker } from '@/kids/speak';
import { type KidsKey, useKidsText } from '@/kids/strings';
import { kidsColors, kidsFonts, kidsRadius, tileColors } from '@/kids/theme';
import { PillButton } from '@/kids/ui';

// Cidades na ordem das viagens em Atos (os Pequenos visitam só as principais)
const ALL = ['antioch', 'cyprus', 'lystra', 'philippi', 'athens', 'corinth', 'ephesus', 'malta', 'rome'];
const SMALL = ['antioch', 'lystra', 'philippi', 'malta', 'rome'];
const k = (city: string, rest = '') => `pl_${city}${rest}` as KidsKey;

/** As viagens de Paulo: de cidade em cidade, aprendendo o que aconteceu em cada uma. */
export default function Paul() {
  const { t, language } = useKidsText();
  const { level } = useKidsProgress();
  const { speak } = useSpeaker(language);
  const cities = level === 'big' ? ALL : SMALL;
  const [index, setIndex] = useState(0);
  const [options, setOptions] = useState(() => shuffled(['a', 'b', 'c']));
  const [tried, setTried] = useState<string[]>([]);
  const [solved, setSolved] = useState(false);
  const [mistakes, setMistakes] = useState(0);
  const done = index >= cities.length;

  function again() {
    setIndex(0);
    setTried([]);
    setSolved(false);
    setMistakes(0);
    setOptions(shuffled(['a', 'b', 'c']));
  }

  const route = (
    <View style={styles.route}>
      {cities.map((c, i) => (
        <View key={c} style={styles.stop}>
          <Text style={styles.stopIcon}>{i === index ? '⛵' : i < index ? '✅' : '📍'}</Text>
          <Text style={[styles.stopName, i === index && { color: kidsColors.purple }]} numberOfLines={1}>
            {t(k(c))}
          </Text>
        </View>
      ))}
    </View>
  );

  if (done) {
    return (
      <GameShell game="paul">
        {route}
        <GameEnd game="paul" stars={mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1} onAgain={again} />
      </GameShell>
    );
  }

  const city = cities[index];

  function pick(o: string) {
    if (solved || tried.includes(o)) return;
    if (o === 'a') {
      setSolved(true);
      speak(t('right'));
    } else {
      setTried((l) => [...l, o]);
      setMistakes((m) => m + 1);
    }
  }

  return (
    <GameShell game="paul" status={`📍 ${t(k(city))}`}>
      {route}
      <View style={gameStyles.card}>
        <Text style={styles.fact} onPress={() => speak(t(k(city, '_f')))}>
          {t(k(city, '_f'))}
        </Text>
        <Text style={styles.ref}>📜 {t(k(city, '_r'))}</Text>
      </View>
      <Text style={gameStyles.big}>{t(k(city, '_q'))}</Text>
      {options.map((o, i) => (
        <AnswerButton
          key={o}
          label={t(k(city, `_${o}`))}
          color={tileColors[i]}
          state={solved && o === 'a' ? 'right' : tried.includes(o) ? 'wrong' : undefined}
          onPress={() => pick(o)}
        />
      ))}
      {solved ? (
        <PillButton
          label={t('pl_sail')}
          color={kidsColors.blue}
          onPress={() => {
            setIndex((i) => i + 1);
            setSolved(false);
            setTried([]);
            setOptions(shuffled(['a', 'b', 'c']));
          }}
        />
      ) : null}
    </GameShell>
  );
}

const styles = StyleSheet.create({
  route: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, backgroundColor: '#E8F6FF', borderRadius: kidsRadius.lg, padding: 10, borderWidth: 3, borderColor: kidsColors.blue, justifyContent: 'center' },
  stop: { width: 70, alignItems: 'center' },
  stopIcon: { fontSize: 24 },
  stopName: { fontFamily: kidsFonts.bold, fontSize: 11, color: kidsColors.text },
  fact: { fontFamily: kidsFonts.bold, fontSize: 20, lineHeight: 28, color: kidsColors.text },
  ref: { fontFamily: kidsFonts.regular, fontSize: 15, color: kidsColors.textMuted },
});

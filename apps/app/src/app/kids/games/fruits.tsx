import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AnswerButton, GameEnd, GameShell, gameStyles, shuffled } from '@/kids/game-ui';
import { useKidsProgress } from '@/kids/progress';
import { useSpeaker } from '@/kids/speak';
import { type KidsKey, useKidsText } from '@/kids/strings';
import { kidsColors, kidsRadius, tileColors } from '@/kids/theme';
import { PillButton } from '@/kids/ui';

// Os 9 frutos do Espírito (Gálatas 5:22–23); cada atitude combina com um deles
const FRUIT_EMOJI = ['🍎', '🍇', '🍊', '🍐', '🍓', '🍌', '🍒', '🍑', '🍍'];

function deal(count: number) {
  return shuffled(FRUIT_EMOJI.map((_, i) => i + 1))
    .slice(0, count)
    .map((n) => ({ n, options: shuffled([n, ...shuffled(FRUIT_EMOJI.map((_, i) => i + 1).filter((x) => x !== n)).slice(0, 2)]) }));
}

/** Os frutos do Espírito: ligar cada atitude ao fruto que ela mostra e encher a cesta. */
export default function Fruits() {
  const { t, language } = useKidsText();
  const { level } = useKidsProgress();
  const { speak } = useSpeaker(language);
  const count = level === 'big' ? 9 : 5;
  const [rounds, setRounds] = useState(() => deal(count));
  const [index, setIndex] = useState(0);
  const [tried, setTried] = useState<number[]>([]);
  const [solved, setSolved] = useState(false);
  const [basket, setBasket] = useState<number[]>([]);
  const [mistakes, setMistakes] = useState(0);

  const cesta = (
    <View style={styles.basket} accessibilityLabel={t('fr_basket')}>
      <Text style={styles.basketText}>🧺 {basket.map((n) => FRUIT_EMOJI[n - 1]).join(' ')}</Text>
    </View>
  );

  function again() {
    setRounds(deal(count));
    setIndex(0);
    setTried([]);
    setSolved(false);
    setBasket([]);
    setMistakes(0);
  }

  if (index >= rounds.length) {
    return (
      <GameShell game="fruits">
        {cesta}
        <GameEnd game="fruits" stars={mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1} onAgain={again} />
      </GameShell>
    );
  }

  const r = rounds[index];

  function pick(n: number) {
    if (solved || tried.includes(n)) return;
    if (n === r.n) {
      setSolved(true);
      setBasket((b) => [...b, n]);
      speak(`${t('right')} ${t(`fr_${n}` as KidsKey)}`);
    } else {
      setTried((l) => [...l, n]);
      setMistakes((m) => m + 1);
    }
  }

  return (
    <GameShell game="fruits" status={t('questionOf', { n: index + 1, total: rounds.length })}>
      {cesta}
      <View style={gameStyles.card}>
        <Text style={gameStyles.big} onPress={() => speak(t(`fa_${r.n}` as KidsKey))}>
          {t(`fa_${r.n}` as KidsKey)}
        </Text>
      </View>
      {r.options.map((n, i) => (
        <AnswerButton
          key={n}
          label={`${FRUIT_EMOJI[n - 1]}  ${t(`fr_${n}` as KidsKey)}`}
          color={tileColors[i % tileColors.length]}
          state={solved && n === r.n ? 'right' : tried.includes(n) ? 'wrong' : undefined}
          onPress={() => pick(n)}
        />
      ))}
      {tried.length && !solved ? <Text style={gameStyles.info}>{t('wrong')}</Text> : null}
      {solved ? (
        <PillButton
          label={t('nextQuestion')}
          color={kidsColors.green}
          onPress={() => {
            setIndex((i) => i + 1);
            setTried([]);
            setSolved(false);
          }}
        />
      ) : null}
    </GameShell>
  );
}

const styles = StyleSheet.create({
  basket: { backgroundColor: '#FFF4D6', borderRadius: kidsRadius.lg, borderWidth: 3, borderColor: '#C9A46A', padding: 12, minHeight: 60, justifyContent: 'center' },
  basketText: { fontSize: 28, textAlign: 'center' },
});

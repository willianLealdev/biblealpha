import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { kidsApi, type Verse } from '@/kids/api';
import { GameEnd, GameShell, gameStyles, shuffled } from '@/kids/game-ui';
import { useKidsProgress } from '@/kids/progress';
import { useSpeaker } from '@/kids/speak';
import { useKidsText } from '@/kids/strings';
import { kidsColors, kidsFonts, tileColors } from '@/kids/theme';
import { Mascot, PillButton } from '@/kids/ui';

const ROUNDS = 3;

/** Monte o versículo: as palavras de um versículo publicado aparecem misturadas. */
export default function VerseBuilder() {
  const { t, language } = useKidsText();
  const { level, ready } = useKidsProgress();
  const { speak } = useSpeaker(language);
  const [verses, setVerses] = useState<Verse[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [queue, setQueue] = useState<Verse[]>([]);
  const [index, setIndex] = useState(0);
  const [placed, setPlaced] = useState(0);
  const [miss, setMiss] = useState<number | null>(null);
  const [hint, setHint] = useState(false);
  const [mistakes, setMistakes] = useState(0);

  useEffect(() => {
    if (!ready) return;
    kidsApi
      .verses(language, level)
      .then((list) => {
        // Pequenos: versículos curtos; Grandes: até 22 palavras
        const max = level === 'big' ? 22 : 12;
        const fit = list.filter((v) => v.text.split(/\s+/).length <= max);
        setVerses(fit.length ? fit : list);
        setQueue(shuffled(fit.length ? fit : list).slice(0, ROUNDS));
      })
      .catch(() => setFailed(true));
  }, [ready, language, level]);

  const verse = queue[index];
  const words = useMemo(() => (verse ? verse.text.split(/\s+/).filter(Boolean) : []), [verse]);
  const pool = useMemo(() => shuffled(words.map((w, i) => ({ w, i }))), [words]);
  const complete = !!verse && placed === words.length;

  function tap(i: number) {
    if (complete) return;
    if (i === placed) {
      const now = placed + 1;
      setPlaced(now);
      setMiss(null);
      setHint(false);
      if (now === words.length) speak(`${verse.text}. ${verse.reference}`);
    } else {
      setMiss(i);
      setMistakes((m) => m + 1);
    }
  }

  function next() {
    setIndex((n) => n + 1);
    setPlaced(0);
    setMiss(null);
    setHint(false);
  }

  function again() {
    setQueue(shuffled(verses ?? []).slice(0, ROUNDS));
    setIndex(0);
    setPlaced(0);
    setMistakes(0);
    setMiss(null);
  }

  if (failed) return <GameShell game="versebuilder"><Mascot message={t('loadError')} /></GameShell>;
  if (verses === null) return <GameShell game="versebuilder"><ActivityIndicator size="large" color={kidsColors.orange} /></GameShell>;
  if (!verses.length) return <GameShell game="versebuilder"><Mascot message={t('verse_none')} /></GameShell>;

  if (index >= queue.length) {
    return (
      <GameShell game="versebuilder">
        <GameEnd game="versebuilder" stars={mistakes <= 2 ? 3 : mistakes <= 6 ? 2 : 1} onAgain={again} />
      </GameShell>
    );
  }

  return (
    <GameShell game="versebuilder" status={t('questionOf', { n: index + 1, total: queue.length })}>
      <View style={gameStyles.card}>
        <Text style={styles.built}>
          {words.slice(0, placed).join(' ')}
          {placed < words.length ? <Text style={styles.cursor}> ▁▁▁</Text> : null}
        </Text>
        <Text style={styles.reference}>{verse.reference}</Text>
      </View>
      {complete ? (
        <PillButton label={index + 1 < queue.length ? t('verse_next') : t('nextQuestion')} color={kidsColors.green} onPress={next} />
      ) : (
        <>
          <View style={styles.pool}>
            {pool
              .filter((p) => p.i >= placed)
              .map((p) => (
                <PillButton
                  key={p.i}
                  label={p.w}
                  color={tileColors[p.i % tileColors.length]}
                  active={miss !== p.i}
                  onPress={() => tap(p.i)}
                  textSize={18}
                  style={hint && p.i === placed ? { borderColor: kidsColors.text, borderWidth: 4 } : undefined}
                />
              ))}
          </View>
          {miss !== null ? <Text style={gameStyles.info}>{t('verse_wrong')}</Text> : null}
          <PillButton label={`💡 ${t('verse_hint')}`} color={kidsColors.yellow} active={false} onPress={() => setHint(true)} textSize={17} />
        </>
      )}
    </GameShell>
  );
}

const styles = StyleSheet.create({
  built: { fontFamily: kidsFonts.bold, fontSize: 22, lineHeight: 32, color: kidsColors.text, textAlign: 'center', minHeight: 64 },
  cursor: { color: kidsColors.orange },
  reference: { fontFamily: kidsFonts.regular, fontSize: 16, color: kidsColors.textMuted, textAlign: 'center' },
  pool: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
});

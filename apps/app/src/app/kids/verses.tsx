import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { kidsApi, type Verse } from '@/kids/api';
import { Celebrate } from '@/kids/celebrate';
import { shuffle } from '@/kids/memory-cards';
import { useKidsProgress } from '@/kids/progress';
import { useSpeaker } from '@/kids/speak';
import { useKidsText } from '@/kids/strings';
import { kidsColors, kidsFonts, kidsRadius, tileColors } from '@/kids/theme';
import { BackButton, KidsScreen, Mascot, PillButton } from '@/kids/ui';

// Tira só a pontuação das pontas (o hífen de "bem-aventurado" fica)
const clean = (w: string) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').toLowerCase();

/** Palavras que somem no jogo: as mais compridas (1 para os Pequenos, até 3 para os Grandes). */
function blanksFor(words: string[], count: number): number[] {
  return words
    .map((w, i) => ({ i, len: clean(w).length }))
    .filter((w) => w.len >= 4)
    .sort((a, b) => b.len - a.len)
    .slice(0, count)
    .map((w) => w.i)
    .sort((a, b) => a - b);
}

function dayIndex(total: number) {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now.getTime() - start.getTime()) / 86_400_000) % total;
}

/** Versículos para decorar: o do dia, ouvir em voz alta e completar as palavras que sumiram. */
export default function KidsVerses() {
  const { t, language } = useKidsText();
  const { level, ready, addStars } = useKidsProgress();
  const { speaking, toggle, speak } = useSpeaker(language);
  const [verses, setVerses] = useState<Verse[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [filled, setFilled] = useState<number[]>([]);
  const [miss, setMiss] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    kidsApi
      .verses(language, level)
      .then((list) => {
        setVerses(list);
        if (list.length) setIndex(dayIndex(list.length));
      })
      .catch(() => setFailed(true));
  }, [ready, language, level]);

  const verse = verses?.[index];
  const words = useMemo(() => (verse ? verse.text.split(/\s+/).filter(Boolean) : []), [verse]);
  const blanks = useMemo(() => blanksFor(words, level === 'big' ? 3 : 1), [words, level]);
  const nextBlank = blanks.find((b) => !filled.includes(b));
  const complete = playing && nextBlank === undefined;

  // Opções: a palavra certa + 2 palavras de outros versículos
  const options = useMemo(() => {
    if (nextBlank === undefined || !verses) return [];
    const right = clean(words[nextBlank]);
    const pool = shuffle(
      verses
        .flatMap((v) => v.text.split(/\s+/))
        .map(clean)
        .filter((w) => w.length >= 4 && w !== right),
    );
    return shuffle([right, ...Array.from(new Set(pool)).slice(0, 2)]);
  }, [nextBlank, words, verses]);

  function choose(verseIndex: number) {
    setIndex(verseIndex);
    setPlaying(false);
    setFilled([]);
    setMiss(null);
  }

  function answer(word: string) {
    if (nextBlank === undefined) return;
    if (word === clean(words[nextBlank])) {
      const now = [...filled, nextBlank];
      setFilled(now);
      setMiss(null);
      if (now.length === blanks.length) {
        addStars(1);
        speak(`${verse!.text}. ${verse!.reference}`);
      }
    } else {
      setMiss(word);
    }
  }

  return (
    <KidsScreen>
      <BackButton />
      <Text style={styles.title} accessibilityRole="header">
        ⭐ {t('versesTitle')}
      </Text>
      {failed ? (
        <Mascot message={t('loadError')} />
      ) : verses === null ? (
        <ActivityIndicator size="large" color={kidsColors.green} />
      ) : !verse ? (
        <Mascot message={t('noVerses')} />
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.label}>{index === dayIndex(verses.length) ? t('verseOfDay') : verse.reference}</Text>
            <Text style={styles.verse}>
              {words.map((w, i) => {
                const hidden = playing && blanks.includes(i) && !filled.includes(i);
                return (
                  <Text key={i} style={hidden ? styles.blank : playing && filled.includes(i) ? styles.filled : undefined}>
                    {hidden ? '_'.repeat(Math.max(4, clean(w).length)) : w}
                    {i < words.length - 1 ? ' ' : ''}
                  </Text>
                );
              })}
            </Text>
            <Text style={styles.reference}>{verse.reference}</Text>
          </View>

          {complete ? <Celebrate title={t('fillDone')} /> : null}

          {playing && !complete ? (
            <View style={{ gap: 10 }}>
              <Text style={styles.hint}>{t('fillHint')}</Text>
              <View style={styles.options}>
                {options.map((o, i) => (
                  <PillButton
                    key={o}
                    label={o}
                    color={tileColors[i % tileColors.length]}
                    active={miss !== o}
                    onPress={() => answer(o)}
                    style={{ flexGrow: 1 }}
                  />
                ))}
              </View>
              {miss ? <Text style={styles.miss}>{t('wrong')}</Text> : null}
            </View>
          ) : null}

          <View style={styles.row}>
            <PillButton
              label={speaking ? t('stopListen') : t('listen')}
              color={kidsColors.blue}
              onPress={() => toggle(`${verse.text}. ${verse.reference}`)}
              style={{ flex: 1 }}
            />
            {!playing || complete ? (
              <PillButton
                label={t('fillGame')}
                color={kidsColors.purple}
                onPress={() => {
                  setPlaying(true);
                  setFilled([]);
                  setMiss(null);
                }}
                style={{ flex: 1 }}
              />
            ) : null}
          </View>
          {verses.length > 1 ? (
            <PillButton label={`🔀 ${t('otherVerse')}`} color={kidsColors.orange} onPress={() => choose((index + 1) % verses.length)} />
          ) : null}

          <Text style={styles.hint}>{t('allVerses')}</Text>
          <View style={styles.list}>
            {verses.map((v, i) => (
              <Pressable
                key={v.reference}
                accessibilityRole="button"
                accessibilityLabel={v.reference}
                onPress={() => choose(i)}
                style={[styles.chip, { borderColor: tileColors[i % tileColors.length], backgroundColor: i === index ? tileColors[i % tileColors.length] : kidsColors.card }]}>
                <Text style={[styles.chipText, { color: i === index ? kidsColors.onColor : kidsColors.text }]}>{v.reference}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </KidsScreen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: kidsFonts.bold, fontSize: 30, color: kidsColors.text },
  card: { backgroundColor: kidsColors.card, borderRadius: kidsRadius.lg, borderWidth: 3, borderColor: kidsColors.green, padding: 22, gap: 12 },
  label: { fontFamily: kidsFonts.bold, fontSize: 18, color: kidsColors.green, textAlign: 'center' },
  verse: { fontFamily: kidsFonts.bold, fontSize: 25, lineHeight: 36, color: kidsColors.text, textAlign: 'center' },
  blank: { color: kidsColors.purple },
  filled: { color: kidsColors.green },
  reference: { fontFamily: kidsFonts.regular, fontSize: 17, color: kidsColors.textMuted, textAlign: 'center' },
  hint: { fontFamily: kidsFonts.bold, fontSize: 18, color: kidsColors.textMuted },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  miss: { fontFamily: kidsFonts.bold, fontSize: 18, color: kidsColors.purple, textAlign: 'center' },
  row: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  list: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 3, borderRadius: kidsRadius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { fontFamily: kidsFonts.bold, fontSize: 15 },
});

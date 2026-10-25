import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { kidsApi } from '@/kids/api';
import { GameEnd, GameShell, gameStyles } from '@/kids/game-ui';
import { useKidsProgress } from '@/kids/progress';
import { useSpeaker } from '@/kids/speak';
import { type KidsKey, useKidsText } from '@/kids/strings';
import { kidsColors, kidsFonts, kidsRadius } from '@/kids/theme';
import { PillButton } from '@/kids/ui';

// Cada baú: a pista, o número secreto e o versículo de onde vem a resposta (o texto do
// versículo vem da Bíblia do idioma da criança, nunca da IA)
const CHESTS = [
  { n: 1, code: '23', book: 'PSA', chapter: 23, verse: 1 },
  { n: 2, code: '6', book: 'GEN', chapter: 2, verse: 2 },
  { n: 3, code: '12', book: 'MRK', chapter: 3, verse: 14 },
  { n: 4, code: '5', book: 'JHN', chapter: 6, verse: 9 },
  { n: 5, code: '40', book: 'GEN', chapter: 7, verse: 12 },
];

/** Caça ao tesouro: resolver pistas da Bíblia para abrir os baús. */
export default function Treasure() {
  const { t, language } = useKidsText();
  const { level } = useKidsProgress();
  const { speak } = useSpeaker(language);
  const chests = level === 'big' ? CHESTS : CHESTS.slice(0, 3);
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState('');
  const [wrong, setWrong] = useState(0);
  const [opened, setOpened] = useState(false);
  const [verse, setVerse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const done = index >= chests.length;

  async function open() {
    const chest = chests[index];
    if (typed !== chest.code) {
      setWrong((w) => w + 1);
      setTyped('');
      speak(t('tr_wrong'));
      return;
    }
    setOpened(true);
    speak(t('tr_opened'));
    setLoading(true);
    try {
      const bibles = await kidsApi.bibles(language);
      const verses = bibles.length ? await kidsApi.chapter(bibles[0].code, chest.book, chest.chapter) : [];
      setVerse(verses.find((v) => v.verse === chest.verse)?.text ?? null);
    } catch {
      setVerse(null);
    } finally {
      setLoading(false);
    }
  }

  function next() {
    setIndex((i) => i + 1);
    setTyped('');
    setOpened(false);
    setVerse(null);
  }

  function again() {
    setIndex(0);
    setTyped('');
    setWrong(0);
    setOpened(false);
    setVerse(null);
  }

  if (done) {
    return (
      <GameShell game="treasure">
        <View style={[gameStyles.card, { alignItems: 'center' }]}>
          <Text style={{ fontSize: 60 }}>{'💎'.repeat(chests.length)}</Text>
        </View>
        <GameEnd game="treasure" stars={wrong === 0 ? 3 : wrong <= 2 ? 2 : 1} onAgain={again} />
      </GameShell>
    );
  }

  const chest = chests[index];
  return (
    <GameShell game="treasure" status={t('tr_chest', { n: index + 1, total: chests.length })}>
      <View style={[gameStyles.card, { alignItems: 'center' }]}>
        <Text style={styles.chest}>{opened ? '💎' : '🧰'}</Text>
        <Text style={gameStyles.big} onPress={() => speak(t(`tr_clue${chest.n}` as KidsKey))}>
          🗝️ {t(`tr_clue${chest.n}` as KidsKey)}
        </Text>
      </View>
      {opened ? (
        <View style={styles.treasure}>
          <Text style={styles.treasureTitle}>{t('tr_opened')}</Text>
          {loading ? <ActivityIndicator color={kidsColors.yellow} /> : verse ? <Text style={styles.verse}>“{verse}”</Text> : null}
          <Text style={styles.ref}>📜 {t(`tr_clue${chest.n}_r` as KidsKey)}</Text>
          <PillButton label={t('nextQuestion')} color={kidsColors.green} onPress={next} />
        </View>
      ) : (
        <>
          <Text style={styles.display}>{typed || '—'}</Text>
          <View style={styles.pad}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((d) => (
              <Pressable key={d} accessibilityRole="button" accessibilityLabel={d} onPress={() => setTyped((s) => (s + d).slice(0, 3))} style={styles.key}>
                <Text style={styles.keyText}>{d}</Text>
              </Pressable>
            ))}
            <Pressable accessibilityRole="button" accessibilityLabel={t('tr_erase')} onPress={() => setTyped('')} style={[styles.key, { backgroundColor: kidsColors.border }]}>
              <Text style={styles.keyText}>⌫</Text>
            </Pressable>
          </View>
          <PillButton label={t('tr_open')} color={kidsColors.yellow} onPress={open} disabled={!typed} />
        </>
      )}
    </GameShell>
  );
}

const styles = StyleSheet.create({
  chest: { fontSize: 70 },
  display: { fontFamily: kidsFonts.bold, fontSize: 40, color: kidsColors.text, textAlign: 'center', letterSpacing: 8 },
  pad: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', maxWidth: 340, alignSelf: 'center' },
  key: { width: 88, height: 64, borderRadius: kidsRadius.md, backgroundColor: kidsColors.card, borderWidth: 3, borderColor: kidsColors.yellow, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontFamily: kidsFonts.bold, fontSize: 28, color: kidsColors.text },
  treasure: { backgroundColor: '#FFFBEA', borderRadius: kidsRadius.lg, borderWidth: 3, borderColor: kidsColors.yellow, padding: 16, gap: 10 },
  treasureTitle: { fontFamily: kidsFonts.bold, fontSize: 22, color: kidsColors.orange, textAlign: 'center' },
  verse: { fontFamily: kidsFonts.bold, fontSize: 20, lineHeight: 29, color: kidsColors.text, textAlign: 'center' },
  ref: { fontFamily: kidsFonts.regular, fontSize: 15, color: kidsColors.textMuted, textAlign: 'center' },
});

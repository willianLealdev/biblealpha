import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { LanguagePicker } from '@/kids/language-picker';
import { useKidsProgress } from '@/kids/progress';
import { useKidsText } from '@/kids/strings';
import { kidsColors, kidsFonts, kidsRadius } from '@/kids/theme';
import { BackButton, KidsScreen, PillButton } from '@/kids/ui';

const question = () => ({ a: 6 + Math.floor(Math.random() * 4), b: 6 + Math.floor(Math.random() * 4) });

/** Área dos pais, atrás de uma conta simples que criança pequena não resolve. */
export default function KidsParents() {
  const { t } = useKidsText();
  const { reset, language, setLanguage } = useKidsProgress();
  const [q, setQ] = useState(question);
  const [answer, setAnswer] = useState('');
  const [open, setOpen] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [cleared, setCleared] = useState(false);

  function check() {
    if (Number(answer) === q.a * q.b) {
      setOpen(true);
      return;
    }
    setWrong(true);
    setAnswer('');
    setQ(question());
  }

  if (!open) {
    return (
      <KidsScreen>
        <BackButton />
        <View style={styles.box}>
          <Text style={styles.title} accessibilityRole="header">
            🔒 {t('gateTitle')}
          </Text>
          <Text style={styles.question}>{t('gateQuestion', q)}</Text>
          <TextInput
            value={answer}
            onChangeText={(v) => {
              setAnswer(v.replace(/\D/g, '').slice(0, 3));
              setWrong(false);
            }}
            onSubmitEditing={check}
            keyboardType="number-pad"
            accessibilityLabel={t('gateHint')}
            placeholder="?"
            placeholderTextColor={kidsColors.textMuted}
            style={styles.input}
          />
          <Text style={[styles.hint, wrong && { color: kidsColors.pink }]}>{wrong ? t('gateWrong') : t('gateHint')}</Text>
          <PillButton label={t('enter')} onPress={check} disabled={!answer} />
        </View>
      </KidsScreen>
    );
  }

  return (
    <KidsScreen>
      <BackButton />
      <View style={styles.box}>
        <Text style={styles.title} accessibilityRole="header">
          {t('parentsTitle')}
        </Text>
        <Text style={styles.body}>{t('parentsIntro')}</Text>
        {(['rule1', 'rule2', 'rule3', 'rule4', 'rule5'] as const).map((rule) => (
          <Text key={rule} style={styles.body}>
            ✅ {t(rule)}
          </Text>
        ))}
        <Text style={styles.body}>{t('languageLabel')}</Text>
        <LanguagePicker value={language} onChange={setLanguage} />
        <PillButton
          label={cleared ? t('resetDone') : t('resetProgress')}
          color={kidsColors.pink}
          active={!cleared}
          disabled={cleared}
          onPress={() => {
            reset();
            setCleared(true);
          }}
        />
        <Text style={styles.hint}>{t('contact')}</Text>
      </View>
    </KidsScreen>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: kidsColors.card,
    borderRadius: kidsRadius.lg,
    borderWidth: 3,
    borderColor: kidsColors.border,
    padding: 20,
    gap: 14,
  },
  title: { fontFamily: kidsFonts.bold, fontSize: 26, color: kidsColors.text },
  question: { fontFamily: kidsFonts.bold, fontSize: 30, color: kidsColors.purple, textAlign: 'center' },
  input: {
    alignSelf: 'center',
    width: 160,
    minHeight: 64,
    borderRadius: kidsRadius.md,
    borderWidth: 3,
    borderColor: kidsColors.purple,
    fontFamily: kidsFonts.bold,
    fontSize: 30,
    textAlign: 'center',
    color: kidsColors.text,
    backgroundColor: kidsColors.bg,
  },
  hint: { fontFamily: kidsFonts.regular, fontSize: 15, color: kidsColors.textMuted, textAlign: 'center' },
  languages: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  body: { fontFamily: kidsFonts.regular, fontSize: 17, lineHeight: 25, color: kidsColors.text },
});

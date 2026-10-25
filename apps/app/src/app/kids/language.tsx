import { router } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import { LanguagePicker } from '@/kids/language-picker';
import { useKidsProgress } from '@/kids/progress';
import { useKidsText } from '@/kids/strings';
import { kidsColors, kidsFonts } from '@/kids/theme';
import { BackButton, KidsScreen } from '@/kids/ui';

/** Trocar o idioma do Kids (aberto pelo botão 🌐 do início). */
export default function KidsLanguage() {
  const { t } = useKidsText();
  const { language, setLanguage } = useKidsProgress();
  return (
    <KidsScreen>
      <BackButton />
      <Text style={styles.title} accessibilityRole="header">
        🌐 {t('chooseLanguage')}
      </Text>
      <LanguagePicker
        value={language}
        onChange={(code) => {
          setLanguage(code);
          if (router.canGoBack()) router.back();
          else router.replace('/kids');
        }}
      />
    </KidsScreen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: kidsFonts.bold, fontSize: 30, color: kidsColors.text },
});

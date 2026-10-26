// Começo do app BibleAlpha Kids (lojas). Só as telas do Kids: sem login, sem telas dos adultos.
// As telas em si ficam em src/app/kids (as mesmas do site) e chegam aqui pelas pontes de ./kids.

import { useFonts } from 'expo-font';
import { SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { UpdateReload } from '@/components/update-reload';
import { kidsColors } from '@/kids/theme';

SplashScreen.preventAutoHideAsync();

export default function KidsAppLayout() {
  // Só as duas fontes usadas pelo Kids
  const [fontsLoaded, fontError] = useFonts({
    Inter_500Medium: require('@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf'),
    Inter_600SemiBold: require('@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf'),
  });
  // Se as fontes demorarem, abre assim mesmo com a fonte do aparelho
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), 4000);
    return () => clearTimeout(timer);
  }, []);
  const ready = fontsLoaded || !!fontError || waited;
  if (ready) SplashScreen.hide();

  return (
    <SafeAreaProvider>
      {/* Atualização publicada: o app baixa sozinho e recarrega */}
      <UpdateReload />
      <StatusBar style="dark" />
      <View style={{ flex: 1, backgroundColor: kidsColors.bg }}>
        {ready ? <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: kidsColors.bg } }} /> : null}
      </View>
    </SafeAreaProvider>
  );
}

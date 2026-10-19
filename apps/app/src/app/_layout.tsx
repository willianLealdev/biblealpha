import { useFonts } from 'expo-font';
import { SplashScreen, Stack } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BottomNav, useShowBottomNav, useStackOptions } from '@/components/navigation';
import { Seal } from '@/components/ui';
import { I18nProvider, syncSourceTexts } from '@/i18n';
import { SessionProvider, useSession } from '@/lib/session';
import { StudyProvider } from '@/study/store';
import { ThemeProvider, useTheme } from '@/theme';

SplashScreen.preventAutoHideAsync();

// Navegador: tira o contorno de foco padrão dos campos (o app já destaca o campo ativo com a
// borda dourada); sem isso aparece "um quadrado dentro do outro"
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = 'input, textarea, select { outline: none; }';
  document.head.appendChild(style);
}

export default function RootLayout() {
  // Só os pesos usados (importar o pacote inteiro coloca todas as variações no build)
  const [fontsLoaded] = useFonts({
    CormorantGaramond_600SemiBold: require('@expo-google-fonts/cormorant-garamond/600SemiBold/CormorantGaramond_600SemiBold.ttf'),
    CormorantGaramond_700Bold: require('@expo-google-fonts/cormorant-garamond/700Bold/CormorantGaramond_700Bold.ttf'),
    Inter_400Regular: require('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'),
    Inter_500Medium: require('@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf'),
    Inter_600SemiBold: require('@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf'),
    // Fonte de leitura do texto bíblico
    Literata_400Regular: require('@expo-google-fonts/literata/400Regular/Literata_400Regular.ttf'),
  });

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <I18nProvider>
          <SessionProvider>
            <StudyProvider>
              <RootNavigator fontsLoaded={fontsLoaded} />
            </StudyProvider>
          </SessionProvider>
        </I18nProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { status } = useSession();
  const { colors, name } = useTheme();
  const ready = fontsLoaded && status !== 'loading';
  const stackOptions = useStackOptions();
  const { user } = useSession();
  // App do administrador: envia os textos em inglês desta versão (base das traduções automáticas)
  useEffect(() => {
    if (user?.roles.includes('admin')) syncSourceTexts().catch(() => {});
  }, [user]);
  const showNav = useShowBottomNav(status === 'signedIn');
  if (ready) SplashScreen.hide();

  // Enquanto a sessão é restaurada, o navegador de rotas não é montado: assim as guardas não
  // redirecionam antes da hora e recarregar a página mantém o endereço atual (ex.: /profile).
  if (!ready) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.bg }]}>
        <Seal size={96} />
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={name === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        {/* No site, quem não entrou vê a página de apresentação */}
        <Stack.Protected guard={status === 'signedIn'} redirectTo={Platform.OS === 'web' ? '/welcome' : undefined}>
          <Stack.Screen name="(app)" />
          <Stack.Screen name="bible" />
          <Stack.Screen name="admin" />
          <Stack.Screen name="pro" options={{ ...stackOptions, headerShown: true, title: '' }} />
          <Stack.Screen name="devotionals" />
          <Stack.Screen name="sermon" />
          <Stack.Screen name="agenda" />
          <Stack.Screen name="pair" />
          <Stack.Screen name="share-screen" options={{ ...stackOptions, headerShown: true, title: '' }} />
        </Stack.Protected>
        <Stack.Protected guard={status !== 'signedIn'}>
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="sign-up" />
          <Stack.Screen name="forgot-password" />
        </Stack.Protected>
        {/* Abertos pelos links dos e-mails, com ou sem sessão */}
        <Stack.Screen name="verify-email" />
        <Stack.Screen name="reset-password" />
        <Stack.Screen name="legal/[doc]" options={{ ...stackOptions, headerShown: true, title: '' }} />
        <Stack.Screen name="welcome" />
        {/* Telão da igreja: computador/TV, sem login */}
        <Stack.Screen name="screen" />
      </Stack>
      {/* Menu de baixo também nas telas fora das abas */}
      {showNav ? <BottomNav /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24 },
});

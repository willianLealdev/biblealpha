// Leitura do QR code da tela compartilhada (câmera dentro do app) ou digitação do código.
// Igual ao WhatsApp Web: abre a câmera direto; se não der, digita o código que aparece na tela.

import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';

import { Button, Notice, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { ApiError } from '@/lib/api';
import { codeFrom } from '@/lib/screens';
import { useTheme } from '@/theme';
import { fonts, radius } from '@/theme/tokens';

/** `onCode` confere/usa o código; se lançar erro, a leitura continua. */
export function ScanCode({ onCode, autoStart = true }: { onCode: (code: string) => Promise<void>; autoStart?: boolean }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const working = useRef(false);
  const lastBad = useRef<string | null>(null);

  // Câmera já aberta quando a permissão foi dada antes
  const cameraOn = scanning || (autoStart && !!permission?.granted);

  async function submit(raw: string) {
    const c = codeFrom(raw);
    if (c.length < 6 || working.current || c === lastBad.current) return;
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      await onCode(c);
    } catch (e) {
      lastBad.current = c;
      setTimeout(() => (lastBad.current = null), 3000);
      const k = e instanceof ApiError ? e.code : '';
      setError(k === 'screen_taken' ? t('screen.taken') : k === 'screen_not_found' ? t('screen.notFound') : t('study.errors.generic'));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  async function startScan() {
    setError(null);
    const p = permission?.granted ? permission : await requestPermission();
    if (p.granted) setScanning(true);
    else setError(t('screen.noCamera'));
  }

  return (
    <View style={{ gap: 12 }}>
      {cameraOn ? (
        <View style={{ aspectRatio: 1, maxHeight: 360, width: '100%', alignSelf: 'center', borderRadius: radius.lg, overflow: 'hidden', borderWidth: 2, borderColor: colors.gold }}>
          <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={busy ? undefined : (r) => submit(r.data)} />
          {/* Moldura para mirar o QR code */}
          <View pointerEvents="none" style={{ position: 'absolute', top: '15%', left: '15%', right: '15%', bottom: '15%', borderWidth: 3, borderColor: 'rgba(232,178,58,0.9)', borderRadius: 18 }} />
          {busy ? (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }}>
              <ActivityIndicator color={colors.gold} size="large" />
            </View>
          ) : null}
        </View>
      ) : (
        <Button icon="qr-code-outline" title={t('screen.scan')} onPress={startScan} />
      )}

      <Text variant="small" style={{ textAlign: 'center' }}>
        {t('screen.orType')}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TextInput
          value={code}
          onChangeText={(v) => {
            const c = codeFrom(v);
            setCode(c);
            if (c.length === 6) submit(c);
          }}
          placeholder="ABC123"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={12}
          accessibilityLabel={t('screen.codePlaceholder')}
          onSubmitEditing={() => submit(code)}
          style={{
            flex: 1,
            color: colors.text,
            fontFamily: fonts.bodyBold,
            fontSize: 26,
            letterSpacing: 8,
            textAlign: 'center',
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.md,
            paddingHorizontal: 14,
            paddingVertical: 10,
            backgroundColor: colors.surface,
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('screen.connect')}
          onPress={() => submit(code)}
          disabled={code.length < 6 || busy}
          style={{ backgroundColor: colors.gold, borderRadius: radius.md, padding: 14, opacity: code.length < 6 ? 0.5 : 1 }}>
          {busy ? <ActivityIndicator color={colors.onGold} /> : <Ionicons name="arrow-forward" size={24} color={colors.onGold} />}
        </Pressable>
      </View>
      {error ? <Notice kind="error">{error}</Notice> : null}
    </View>
  );
}

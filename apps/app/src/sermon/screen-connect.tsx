// Compartilhar tela a partir do púlpito: lê o QR code (ou o código) e conecta esta ministração.

import Ionicons from '@expo/vector-icons/Ionicons';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { screenApi, type ScreenState } from '@/lib/screens';
import { ScanCode } from '@/sermon/scan-code';
import { useTheme } from '@/theme';
import { radius } from '@/theme/tokens';

export function ScreenConnect({
  sermonId,
  onClose,
  onConnected,
}: {
  sermonId: string;
  onClose: () => void;
  onConnected: (state: ScreenState) => void;
}) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: colors.overlay }} onPress={onClose} accessibilityLabel={t('bible.close')} />
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: '92%',
          backgroundColor: colors.bg,
          borderTopLeftRadius: radius.lg,
          borderTopRightRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 16,
          paddingBottom: insets.bottom + 16,
        }}>
        <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center', gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="tv-outline" size={22} color={colors.gold} />
            <Text variant="heading" style={{ flex: 1 }}>
              {t('screen.share')}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel={t('bible.close')} onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </Pressable>
          </View>
          <Text variant="small">{t('screen.howTo')}</Text>
          <ScanCode onCode={async (code) => onConnected(await screenApi.pair(code, sermonId))} />
        </View>
      </View>
    </Modal>
  );
}

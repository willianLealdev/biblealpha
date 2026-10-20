// Escolha da voz da leitura em voz alta: lista as vozes do aparelho no idioma, as masculinas primeiro.

import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text as RNText, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { chooseVoice, listVoices, sampleVoice, saveVoice, type VoiceOption } from '@/bible/read-aloud';
import { Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';
import { fonts, radius } from '@/theme/tokens';

export function VoicePicker({ language, onClose, onChanged }: { language: string; onClose: () => void; onChanged: () => void }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [options, setOptions] = useState<VoiceOption[] | null>(null);
  const [selected, setSelected] = useState<string | undefined>(undefined);

  useEffect(() => {
    let active = true;
    Promise.all([listVoices(language), chooseVoice(language)]).then(([list, current]) => {
      if (!active) return;
      setOptions(list);
      setSelected(current);
    });
    return () => {
      active = false;
    };
  }, [language]);

  async function choose(identifier: string | null) {
    await saveVoice(language, identifier);
    if (identifier) {
      setSelected(identifier);
      sampleVoice(language, identifier);
    } else {
      setSelected(await chooseVoice(language));
    }
    onChanged();
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: colors.overlay }} onPress={onClose} accessibilityLabel={t('bible.close')} />
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: '80%',
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
            <Ionicons name="mic-outline" size={22} color={colors.gold} />
            <Text variant="heading" style={{ flex: 1 }}>
              {t('bible.voice')}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel={t('bible.close')} onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </Pressable>
          </View>
          <Text variant="small">{t('bible.voiceHint')}</Text>
          {!options ? (
            <ActivityIndicator color={colors.gold} />
          ) : options.length === 0 ? (
            <Text variant="muted">{t('bible.voiceNone')}</Text>
          ) : (
            <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ gap: 8 }}>
              {options.map((o) => {
                const active = o.identifier === selected;
                return (
                  <Pressable
                    key={o.identifier}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    onPress={() => choose(o.identifier)}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      borderWidth: 1.5,
                      borderColor: active ? colors.gold : colors.border,
                      backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
                      borderRadius: radius.md,
                      padding: 12,
                    })}>
                    <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={20} color={active ? colors.gold : colors.textMuted} />
                    <View style={{ flex: 1 }}>
                      <RNText style={{ color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 15 }} numberOfLines={1}>
                        {o.name}
                      </RNText>
                      <RNText style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 12 }}>
                        {[o.male ? t('bible.voiceMale') : null, o.quality === 'Enhanced' ? t('bible.voiceEnhanced') : null].filter(Boolean).join(' · ') || ' '}
                      </RNText>
                    </View>
                    <Ionicons name="play-circle-outline" size={22} color={colors.gold} />
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          <Pressable accessibilityRole="button" onPress={() => choose(null)} style={{ alignSelf: 'center', padding: 8 }}>
            <RNText style={{ color: colors.gold, fontFamily: fonts.bodyMedium }}>{t('bible.voiceAuto')}</RNText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

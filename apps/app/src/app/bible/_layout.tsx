import { Stack } from 'expo-router';

import { useStackOptions } from '@/components/navigation';
import { useI18n } from '@/i18n';

export default function BibleStack() {
  const stackOptions = useStackOptions();
  const { t } = useI18n();
  return (
    <Stack
      screenOptions={stackOptions}>
      <Stack.Screen name="books" options={{ title: t('bible.chooseBook') }} />
      <Stack.Screen name="search" options={{ title: t('bible.search') }} />
      <Stack.Screen name="translations" options={{ title: t('bible.translation') }} />
      <Stack.Screen name="info/[code]" options={{ title: t('bible.about') }} />
      <Stack.Screen name="note" options={{ title: t('note.newTitle') }} />
      <Stack.Screen name="verse" options={{ title: t('bible.deepen') }} />
      <Stack.Screen name="quiz" options={{ title: t('quiz.title') }} />
      <Stack.Screen name="visual" options={{ title: t('visual.title') }} />
      <Stack.Screen name="word/[strong]" options={{ title: t('bible.tabOriginal') }} />
    </Stack>
  );
}

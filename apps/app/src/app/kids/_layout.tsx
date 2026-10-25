import { Stack } from 'expo-router';

import { KidsProgressProvider } from '@/kids/progress';
import { KidsTextProvider } from '@/kids/strings';
import { kidsColors } from '@/kids/theme';

/** BibleAlpha Kids: área pública (sem login), com tema e progresso próprios. */
export default function KidsLayout() {
  return (
    <KidsProgressProvider>
      <KidsTextProvider>
        <Stack screenOptions={{ headerShown: false, title: 'BibleAlpha Kids', contentStyle: { backgroundColor: kidsColors.bg } }} />
      </KidsTextProvider>
    </KidsProgressProvider>
  );
}

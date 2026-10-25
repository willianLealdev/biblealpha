// Escolha do idioma do Kids: português, inglês e espanhol em destaque; os outros idiomas do
// BibleAlpha (traduzidos automaticamente uma vez e salvos para todos) logo abaixo, com busca.

import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { kidsFetch } from './api';
import { kidsLanguage, useKidsText } from './strings';
import { kidsColors, kidsFonts, kidsRadius } from './theme';
import { PillButton } from './ui';

type WorldLanguage = { code: string; name: string; name_en: string };

const MAIN = [
  { code: 'pt-BR', name: '🇧🇷 Português' },
  { code: 'en', name: '🇺🇸 English' },
  { code: 'es', name: '🇪🇸 Español' },
];
const MAIN_CODES = new Set(MAIN.map((m) => m.code));

export function LanguagePicker({ value, onChange }: { value: string | null; onChange: (code: string | null) => void }) {
  const { t } = useKidsText();
  const [all, setAll] = useState<WorldLanguage[]>([]);
  const [search, setSearch] = useState('');
  const current = value ?? kidsLanguage();

  useEffect(() => {
    kidsFetch<{ languages: WorldLanguage[] }>('/languages/world')
      .then((r) => setAll(r.languages.filter((l) => !MAIN_CODES.has(l.code))))
      .catch(() => setAll([]));
  }, []);

  const term = search.trim().toLowerCase();
  const others = all
    .filter((l) => !term || l.name.toLowerCase().includes(term) || l.name_en.toLowerCase().includes(term))
    .slice(0, term ? 40 : 12);
  // O idioma escolhido aparece mesmo fora dos primeiros da lista
  const chosen = all.find((l) => l.code === current);
  if (chosen && !others.includes(chosen)) others.unshift(chosen);

  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 10 }}>
        {MAIN.map((m) => (
          <PillButton key={m.code} label={m.name} active={current === m.code} color={kidsColors.orange} onPress={() => onChange(m.code)} />
        ))}
      </View>
      <Text style={styles.hint}>{t('otherLanguages')}</Text>
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder={`🔎 ${t('searchLanguage')}`}
        placeholderTextColor={kidsColors.textMuted}
        accessibilityLabel={t('searchLanguage')}
        style={styles.search}
      />
      <View style={styles.list}>
        {others.map((l) => (
          <PillButton key={l.code} label={l.name} active={current === l.code} color={kidsColors.blue} onPress={() => onChange(l.code)} textSize={16} />
        ))}
      </View>
      {value !== null ? (
        <PillButton label={`📱 ${t('deviceLanguage')}`} active={false} color={kidsColors.textMuted} onPress={() => onChange(null)} textSize={16} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { fontFamily: kidsFonts.bold, fontSize: 16, color: kidsColors.textMuted },
  list: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  search: {
    minHeight: 50,
    borderRadius: kidsRadius.md,
    borderWidth: 2,
    borderColor: kidsColors.border,
    paddingHorizontal: 14,
    fontFamily: kidsFonts.regular,
    fontSize: 17,
    color: kidsColors.text,
    backgroundColor: kidsColors.card,
  },
});

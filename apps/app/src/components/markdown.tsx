// Formatação simples para as respostas da IA: títulos (##), listas, **negrito** e *itálico*.

import { Fragment, type ReactNode } from 'react';
import { Text as RNText, View } from 'react-native';

import { useTheme } from '@/theme';
import { fonts } from '@/theme/tokens';

function inline(text: string, color: string, key: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\n]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const token = m[0];
    const bold = token.startsWith('**');
    parts.push(
      <RNText
        key={`${key}-${i++}`}
        style={bold ? { fontFamily: fonts.bodyBold, color } : { fontStyle: 'italic', color }}>
        {token.slice(bold ? 2 : 1, bold ? -2 : -1)}
      </RNText>,
    );
    last = m.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function Markdown({ text }: { text: string }) {
  const { colors } = useTheme();
  const body = { color: colors.text, fontFamily: fonts.body, fontSize: 16, lineHeight: 25 };
  const blocks = text.replace(/\r/g, '').split('\n');
  return (
    <View style={{ gap: 6 }}>
      {blocks.map((line, i) => {
        const key = String(i);
        const trimmed = line.trim();
        if (!trimmed) return <View key={key} style={{ height: 4 }} />;
        const heading = trimmed.match(/^(#{1,4})\s+(.*)$/);
        if (heading) {
          return (
            <RNText
              key={key}
              accessibilityRole="header"
              style={{ color: colors.gold, fontFamily: fonts.bodyBold, fontSize: heading[1].length <= 2 ? 17 : 15, marginTop: 10 }}>
              {heading[2].replace(/\*\*/g, '')}
            </RNText>
          );
        }
        const bullet = trimmed.match(/^([-*•]|\d+[.)])\s+(.*)$/);
        if (bullet) {
          const marker = /\d/.test(bullet[1]) ? bullet[1] : '•';
          return (
            <View key={key} style={{ flexDirection: 'row', gap: 8, paddingLeft: 4 }}>
              <RNText style={{ ...body, color: colors.gold, minWidth: 16 }}>{marker}</RNText>
              <RNText style={[body, { flex: 1 }]}>{inline(bullet[2], colors.text, key)}</RNText>
            </View>
          );
        }
        if (trimmed.startsWith('>')) {
          return (
            <View key={key} style={{ borderLeftWidth: 3, borderLeftColor: colors.goldMuted, paddingLeft: 10 }}>
              <RNText style={[body, { fontFamily: 'Literata_400Regular', fontStyle: 'italic' }]}>
                {inline(trimmed.replace(/^>\s?/, ''), colors.text, key)}
              </RNText>
            </View>
          );
        }
        return (
          <Fragment key={key}>
            <RNText style={body}>{inline(trimmed, colors.text, key)}</RNText>
          </Fragment>
        );
      })}
    </View>
  );
}

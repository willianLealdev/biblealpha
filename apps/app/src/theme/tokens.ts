// Cores derivadas do logo BibleAlpha. O usuário escolhe tema escuro ou claro (ou segue o sistema).

export type ThemeName = 'dark' | 'light';
export type ThemeMode = ThemeName | 'system';

export const palettes = {
  dark: {
    bg: '#0A0806',
    surface: '#15110C',
    surfaceAlt: '#1F1911',
    border: '#3A2E1C',
    text: '#F2EEE6',
    textMuted: '#A79F90',
    gold: '#E8B23A',
    goldMuted: '#B8892A',
    onGold: '#140F07',
    danger: '#F07167',
    success: '#7BC47F',
    overlay: 'rgba(0,0,0,0.6)',
  },
  light: {
    bg: '#FFFFFF',
    surface: '#F8F5EF',
    surfaceAlt: '#F0EBE1',
    border: '#E3DACA',
    text: '#16120C',
    textMuted: '#6B6355',
    // Dourado mais profundo: contraste suficiente sobre branco
    gold: '#8F6418',
    goldMuted: '#B8892A',
    onGold: '#FFFFFF',
    danger: '#B3261E',
    success: '#2E7D32',
    overlay: 'rgba(0,0,0,0.4)',
  },
} as const;

export type Palette = { [K in keyof (typeof palettes)['dark']]: string };

export const fonts = {
  display: 'CormorantGaramond_600SemiBold',
  displayBold: 'CormorantGaramond_700Bold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodyBold: 'Inter_600SemiBold',
} as const;

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
export const maxContentWidth = 560;

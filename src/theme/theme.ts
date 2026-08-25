export const spacing = {
  xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48,
};

export const radius = {
  sm: 10, md: 16, lg: 24, xl: 32, pill: 999,
};

export const typography = {
  h1: { fontSize: 32, fontWeight: '800' as const },
  h2: { fontSize: 24, fontWeight: '700' as const },
  h3: { fontSize: 18, fontWeight: '700' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  bodyBold: { fontSize: 15, fontWeight: '600' as const },
  caption: { fontSize: 13, fontWeight: '400' as const },
  small: { fontSize: 11, fontWeight: '500' as const },
};

export const avatarPalette = [
  '#B084F5', '#FF7EB6', '#5EE6C8', '#F5C86B',
  '#7EC8FF', '#FF9E7E', '#C8FF7E', '#E07EFF',
];

export const darkColors = {
  bg: '#020004',
  bgElevated: '#020005',
  card: '#1616166a',
  cardAlt: '#181819b2',
  border: '#2f2f30',
  primary: '#5f5f60',
  primaryDim: '#59585b',
  accent: '#656364',
  accentAlt: '#f6fbfa',
  gold: '#0fc305',
  text: '#F5F2FA',
  textDim: '#B5AAC7',
  textFaint: '#7A6D8F',
  success: '#028b20',
  danger: '#817f7f',
  white: '#870202',
};

export const lightColors = {
  bg: '#FFFFFF',
  bgElevated: '#F7F6F9',
  card: '#F2F0F5',
  cardAlt: '#EAE7EF',
  border: '#E1DEE6',
  primary: '#8B5FE0',
  primaryDim: '#A48CF0',
  accent: '#6B4FC9',
  accentAlt: '#1A1720',
  gold: '#0fc305',
  text: '#1A1720',
  textDim: '#5A5468',
  textFaint: '#8B849A',
  success: '#028b20',
  danger: '#C93E3E',
  white: '#870202',
};

export type ColorScheme = typeof darkColors;

// legacy default export kept for any files not yet migrated
export const colors = darkColors;
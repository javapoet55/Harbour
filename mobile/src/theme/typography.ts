import { Platform, type TextStyle } from 'react-native';

// Sizes follow the iOS Dynamic Type defaults (large title, title 2, body, footnote).
export const typography = {
  display: { fontSize: 34, lineHeight: 41, fontWeight: '700' },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  body: { fontSize: 17, lineHeight: 22, fontWeight: '400' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  mono: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '400',
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  },
} as const satisfies Record<string, TextStyle>;

export type TextVariant = keyof typeof typography;

import { Platform, type TextStyle } from 'react-native';

/**
 * The SwiftUI text styles the auth screens use, with the line heights iOS actually lays them out
 * with. React Native needs `lineHeight` stated; leaving it out, or deriving it as `fontSize * 1.2`,
 * makes every block shorter than the Swift one and the error compounds down the screen.
 *
 * `fontSize` is confirmed correct: the same string rendered by both apps on an iPhone 17 Pro
 * (iOS 26.5, default Dynamic Type) produces glyphs of identical pixel width and height. Only the
 * line box differed, so these `lineHeight` values are measured from the Swift app's own layout
 * frames rather than computed. See mobile/docs/swift-to-rn-style-map.md section 2.
 */
export const textStyles = {
  /** `.largeTitle` */
  largeTitle: { fontSize: 34, lineHeight: 41 },
  /** `.title2` */
  title2: { fontSize: 22, lineHeight: 28 },
  /** `.title3` */
  title3: { fontSize: 20, lineHeight: 28 },
  /** `.body` */
  body: { fontSize: 17, lineHeight: 25 },
  /** `.subheadline` */
  subheadline: { fontSize: 15, lineHeight: 21 },
  /** `.footnote` */
  footnote: { fontSize: 13, lineHeight: 20 },
} as const satisfies Record<string, TextStyle>;

/** `.system(size: n)` takes the font's own line height, which is close to `n * 1.2`. */
export function systemText(size: number): TextStyle {
  return { fontSize: size, lineHeight: Math.round(size * 1.2) };
}

// Kept for the Phase 1 screens that already use these names.
export const typography = {
  display: { fontSize: 34, lineHeight: 41, fontWeight: '700' },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  body: { ...textStyles.body, fontWeight: '400' },
  caption: { ...textStyles.footnote, fontWeight: '400' },
  mono: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '400',
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  },
} as const satisfies Record<string, TextStyle>;

export type TextVariant = keyof typeof typography;

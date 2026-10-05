import { useWindowDimensions } from 'react-native';

/**
 * `dynamicTypeSize.isAccessibilitySize`: the user has chosen one of the accessibility text sizes. iOS's
 * first one (AX1) sets body text at 28pt against the default 17pt, a 1.65 scale; Android's largest
 * settings (Android 14's 1.8× and 2×) are past it, its ordinary "Largest" (1.3×) is not.
 */
export const ACCESSIBILITY_FONT_SCALE = 1.6;

export function useAccessibilityTextSize(): boolean {
  return useWindowDimensions().fontScale >= ACCESSIBILITY_FONT_SCALE;
}

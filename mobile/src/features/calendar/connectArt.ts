import type { ImageSourcePropType } from 'react-native';

/**
 * `CalendarConnectionArtwork` (ios/App/CalendarConnectionView.swift:338-357): nine regions Swift crops
 * out of `calendar-connect-pack` (1254 × 1254) at draw time, cut ONCE with the same pixel rectangles
 * into small files under assets/calendar-connect/ — the approach §22 Run C took for the Wellness art
 * and Run B for the bug-report art. Each file is the exact region Swift shows, resampled to the width
 * it is drawn at (160 px icons, 180 px step pictures, 300 px hero), so every file stays well under the
 * 500 KB capture limit and the whole set is ~440 KB.
 *
 * Swift draws them with `.blendMode(.multiply)` so the white cells vanish into the fixed-light
 * surfaces. React Native has no blend mode, so the screens place the art on white or near-white.
 */
export type CalendarConnectArt = 'google' | 'apple' | 'microsoft' | 'hero' | 'googleSignIn' | 'microsoftSignIn' | 'permissions' | 'applePermissions' | 'complete';

/** Crop rectangle (x, y, width, height) in the sheet — for the record and for the regeneration script. */
export const CONNECT_ART_RECTS: Record<CalendarConnectArt, [number, number, number, number]> = {
  google: [72, 82, 322, 318],
  apple: [462, 82, 334, 325],
  microsoft: [844, 82, 380, 329],
  hero: [24, 443, 401, 392],
  googleSignIn: [452, 467, 344, 358],
  microsoftSignIn: [864, 467, 353, 359],
  permissions: [73, 873, 332, 333],
  applePermissions: [477, 872, 330, 334],
  complete: [830, 856, 389, 350],
};

export const CONNECT_ART: Record<CalendarConnectArt, ImageSourcePropType> = {
  google: require('../../../assets/calendar-connect/google.png'),
  apple: require('../../../assets/calendar-connect/apple.png'),
  microsoft: require('../../../assets/calendar-connect/microsoft.png'),
  hero: require('../../../assets/calendar-connect/hero.png'),
  googleSignIn: require('../../../assets/calendar-connect/google-sign-in.png'),
  microsoftSignIn: require('../../../assets/calendar-connect/microsoft-sign-in.png'),
  permissions: require('../../../assets/calendar-connect/permissions.png'),
  applePermissions: require('../../../assets/calendar-connect/apple-permissions.png'),
  complete: require('../../../assets/calendar-connect/complete.png'),
};

/** Width ÷ height of each region, so a picture laid out by width keeps Swift's `scaledToFit` shape. */
export function connectArtAspect(kind: CalendarConnectArt): number {
  const [, , width, height] = CONNECT_ART_RECTS[kind];
  return width / height;
}

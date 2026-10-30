import { palettes } from '../../../theme';

/** Phase 14 (docs/IOS_TO_REACT_NATIVE.md §24) Wellness rows; android-polish.md §60. */

describe('wellnessAccent', () => {
  it('is the brand indigo in light and Swift’s lilac in dark (WellnessAppearance.swift)', () => {
    expect(palettes.light.wellnessAccent).toBe('#3D29F0');
    expect(palettes.dark.wellnessAccent).toBe('#BAABFF');
  });
});

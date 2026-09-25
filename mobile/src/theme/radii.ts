// The Swift screens mostly use continuous rounded rectangles of 14, 16, 20 and 24 points.
export const radii = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 24,
  pill: 999,
} as const;

export type Radius = keyof typeof radii;

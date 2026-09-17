/**
 * Colour compositing helpers that match SwiftUI.
 *
 * SwiftUI's `.opacity(_:)` composites in **linear light**; React Native's `opacity` style composites
 * in gamma-encoded sRGB. The two disagree badly for a saturated colour over a light background: the
 * disabled sign-in button came out vividly pink in React Native where Swift renders it pale.
 *
 * Measured on an iPhone 17 Pro: `nexdoMagenta` at `.opacity(0.55)` over white is (250, 192, 239) in
 * Swift. A gamma blend gives (247, 126, 224); a linear blend gives (247, 180, 226).
 *
 * So for a view whose background is known, reproduce `.opacity()` by blending its colours here and
 * rendering them opaque, rather than setting `opacity` on the view.
 */

function channelToLinear(value: number): number {
  const v = value / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function channelToSrgb(value: number): number {
  const v = value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, v)) * 255);
}

function parse(color: string): [number, number, number] {
  const hex = color.replace('#', '');
  if (hex.length === 6) {
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }
  const match = color.match(/rgba?\(([^)]+)\)/);
  if (!match) throw new Error(`Unsupported colour: ${color}`);
  const parts = match[1].split(',').map((p) => Number(p.trim()));
  return [parts[0], parts[1], parts[2]];
}

/** `color.opacity(alpha)` drawn over `background`, composited the way SwiftUI does it. */
export function linearOpacity(color: string, alpha: number, background: string): string {
  const fg = parse(color);
  const bg = parse(background);
  const out = [0, 1, 2].map((i) =>
    channelToSrgb(alpha * channelToLinear(fg[i]) + (1 - alpha) * channelToLinear(bg[i])),
  );
  return `rgb(${out[0]}, ${out[1]}, ${out[2]})`;
}

/**
 * Expand a SwiftUI `LinearGradient`'s colour list into enough stops that React Native reproduces it.
 *
 * SwiftUI interpolates between gradient stops in linear light; `expo-linear-gradient` wraps
 * `CAGradientLayer`, which interpolates in gamma-encoded sRGB. Between two saturated brand colours
 * the two paths diverge by around 20/255 in the middle of a segment — enough to see on the
 * sign-in button and the logo mark.
 *
 * Interpolating here, in linear light, and handing React Native many closely spaced stops makes the
 * remaining per-segment gamma error negligible.
 */
export function linearGradientStops(
  colors: readonly string[],
  stepsPerSegment = 8,
): [string, string, ...string[]] {
  const stops: string[] = [];
  for (let segment = 0; segment < colors.length - 1; segment += 1) {
    const from = parse(colors[segment]).map(channelToLinear);
    const to = parse(colors[segment + 1]).map(channelToLinear);
    const isLastSegment = segment === colors.length - 2;
    for (let step = 0; step <= stepsPerSegment; step += 1) {
      // The shared stop belongs to the next segment, except at the very end.
      if (step === stepsPerSegment && !isLastSegment) continue;
      const t = step / stepsPerSegment;
      const channels = [0, 1, 2].map((c) => channelToSrgb(from[c] + (to[c] - from[c]) * t));
      stops.push(`rgb(${channels[0]}, ${channels[1]}, ${channels[2]})`);
    }
  }
  return stops as [string, string, ...string[]];
}

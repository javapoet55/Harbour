import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { base64Bytes } from '../shopping/image';

/**
 * The finished greeting card — artwork, greeting and signature — as the bytes the server stores for
 * scheduled emails (`PUT /api/moments/{id}/card`, src/server/moments/card-image.ts).
 *
 * Swift has no equivalent: `ImageRenderer` there only feeds the iOS share sheet
 * (ios/App/FestivalServices.swift:181-186) and nothing on iOS uploads a card. This is the React
 * Native half of the server feature, so the shape below follows the route, not Swift.
 *
 * The capture is taken at the view's natural size and resized here rather than through `captureRef`'s
 * own `width`/`height`: those are device-independent points, while the JPEG is physical pixels, so on
 * a 3x phone a 1600-point capture would be a 4800-pixel image. Going through the manipulator makes
 * the 1600 a pixel bound on every device, and reuses the encoder seam the shopping photos already use
 * (src/features/shopping/image.ts).
 *
 * The loop is pure and tested with a fake encoder; `cardEncoder` is the device half.
 */

/** The longest edge of an uploaded card, in pixels. */
export const CARD_MAX_EDGE = 1600;

/** `CARD_MAX_BYTES` (src/server/moments/card-image.ts:8). The server's limit is inclusive. */
export const CARD_MAX_BYTES = 1_500_000;

export const CARD_QUALITY = 0.85;

/** Tried in order when 0.85 at 1600 does not fit under the server's limit. */
export const CARD_QUALITIES = [CARD_QUALITY, 0.7, 0.55, 0.4] as const;

/**
 * The retry after a 413. The server counts decoded bytes, so a smaller edge is what actually moves
 * the number; dropping quality alone leaves a detailed card near the same size.
 */
export const CARD_RETRY_EDGE = 1120;
export const CARD_RETRY_QUALITIES = [0.7, 0.55, 0.4, 0.3] as const;

/** The inline note when the card saved but its image never reached the server. */
export const CARD_NOT_ATTACHED = "Card saved, but it couldn't be attached to scheduled emails";

export const CARD_TOO_LARGE = 'The card image is too large to attach to scheduled emails.';

/** `ratio = min(1, edge / max(w, h))` — never enlarges, so a small card uploads as drawn. */
export function cardTargetSize(width: number, height: number, edge: number = CARD_MAX_EDGE): { width: number; height: number } {
  const ratio = Math.min(1, edge / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
}

export type CardEncoder = {
  /** The captured image's pixel size. */
  size(uri: string): Promise<{ width: number; height: number }>;
  /** Redraws at `size` and returns base64 JPEG at `quality`. */
  jpeg(uri: string, size: { width: number; height: number }, quality: number): Promise<string>;
};

/**
 * Base64 JPEG of the captured card, bounded to `edge` pixels on its longest side and stepped down
 * through `qualities` until it fits under the server's limit. Resolves to the smallest attempt even
 * when none fits, so the caller sends it and lets the server be the judge of its own limit.
 */
async function encode(uri: string, encoder: CardEncoder, edge: number, qualities: readonly number[]): Promise<string> {
  const source = await encoder.size(uri);
  const size = cardTargetSize(source.width, source.height, edge);
  let smallest = '';
  for (const quality of qualities) {
    const data = await encoder.jpeg(uri, size, quality);
    if (base64Bytes(data) <= CARD_MAX_BYTES) return data;
    smallest = data;
  }
  return smallest;
}

/** The first attempt: quality 0.85, longest side at most 1600 px. */
export function encodeCard(uri: string, encoder: CardEncoder): Promise<string> {
  return encode(uri, encoder, CARD_MAX_EDGE, CARD_QUALITIES);
}

/** The one retry after a 413: a smaller edge, re-encoded from the same capture. */
export function encodeSmallerCard(uri: string, encoder: CardEncoder): Promise<string> {
  return encode(uri, encoder, CARD_RETRY_EDGE, CARD_RETRY_QUALITIES);
}

/** `expo-image-manipulator`, as the shopping photos use it. */
export const cardEncoder: CardEncoder = {
  async size(uri) {
    const image = await ImageManipulator.manipulate(uri).renderAsync();
    return { width: image.width, height: image.height };
  },
  async jpeg(uri, size, quality) {
    const context = ImageManipulator.manipulate(uri);
    context.resize(size);
    const image = await context.renderAsync();
    const saved = await image.saveAsync({ compress: quality, format: SaveFormat.JPEG, base64: true });
    if (!saved.base64) throw new Error(CARD_NOT_ATTACHED);
    return saved.base64;
  },
};

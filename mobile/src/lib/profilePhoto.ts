/**
 * `ProfilePhotoEncoder.encode(_:)` (ios/App/ProfilePhotoEncoder.swift:10-28) —
 * "Downsample before decoding and adapt compression to the server limit."
 *
 * Swift walks three thumbnail sizes and, for each, three JPEG qualities, and returns the first result
 * whose JPEG payload is at most 256,000 bytes, as a `data:image/jpeg;base64,` URL. Anything else
 * throws `Failure.invalid`.
 *
 * The limits are not arbitrary: `settingsSchema.photo` (src/app/api/settings/route.ts:36) requires
 * the exact `data:image/jpeg;base64,` prefix, a string no longer than 350,000 characters, decoded
 * bytes no larger than 256,000, and real JPEG SOI/EOI markers. A photo that fails locally would be
 * rejected there with a generic 400.
 *
 * This module is the pure part — the sizes, the qualities, the limit check and the data URL. The
 * resize and re-encode themselves live in `src/photo/encodePhoto.ts`, which calls
 * expo-image-manipulator, so the policy can be tested without a native module.
 */

export const PHOTO_SIZES = [512, 384, 256] as const;
export const PHOTO_QUALITIES = [0.8, 0.65, 0.5] as const;
/** `jpeg.count <= 256000` (ProfilePhotoEncoder.swift:22). */
export const PHOTO_MAX_BYTES = 256_000;
export const PHOTO_DATA_URL_PREFIX = 'data:image/jpeg;base64,';

export const PHOTO_INVALID = 'Could not process this photo. Please choose another image.';

/** Every (size, quality) pair Swift tries, in Swift's order: size outer, quality inner. */
export function photoAttempts(): { size: number; quality: number }[] {
  return PHOTO_SIZES.flatMap((size) => PHOTO_QUALITIES.map((quality) => ({ size, quality })));
}

/**
 * The decoded byte length of a base64 payload, without allocating it. Base64 encodes three bytes as
 * four characters; each `=` at the end stands for one byte that is not there.
 */
export function base64ByteLength(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/** `jpeg.count <= 256000` — the accept test for one attempt. */
export function fitsPhotoLimit(base64: string): boolean {
  return base64ByteLength(base64) <= PHOTO_MAX_BYTES;
}

/** `"data:image/jpeg;base64," + jpeg.base64EncodedString()` (ProfilePhotoEncoder.swift:23). */
export function photoDataUrl(base64: string): string {
  return PHOTO_DATA_URL_PREFIX + base64;
}

/** The inverse, for rendering a stored photo: Swift splits on "," and decodes the last part. */
export function photoBase64(dataUrl: string | null | undefined): string | null {
  if (!dataUrl) return null;
  const payload = dataUrl.split(',').pop();
  return payload && payload.length > 0 ? payload : null;
}

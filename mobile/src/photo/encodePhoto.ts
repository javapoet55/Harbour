import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { fitsPhotoLimit, photoAttempts, photoDataUrl, PHOTO_INVALID } from '../lib/profilePhoto';

/**
 * The native half of `ProfilePhotoEncoder.encode(_:)` (ios/App/ProfilePhotoEncoder.swift:10-28).
 *
 * Swift uses ImageIO: `CGImageSourceCreateThumbnailAtIndex` with `kCGImageSourceThumbnailMaxPixelSize`
 * for the downsample (which preserves the aspect ratio and applies the EXIF transform), then
 * `UIImage.jpegData(compressionQuality:)`. expo-image-manipulator's `resize` with only one dimension
 * given preserves the aspect ratio the same way, and `renderAsync().saveAsync({ compress, format })`
 * is the JPEG re-encode.
 *
 * The loop, the sizes, the qualities and the 256,000-byte limit are in `src/lib/profilePhoto.ts` so
 * they can be tested without a device.
 */
export async function encodeProfilePhoto(uri: string, width: number, height: number): Promise<string> {
  // `kCGImageSourceThumbnailMaxPixelSize` bounds the LONGER edge, so the resize is applied to
  // whichever dimension is larger and the other follows.
  const landscape = width >= height;

  for (const { size, quality } of photoAttempts()) {
    // A photo already smaller than the target is not enlarged, matching
    // `CGImageSourceCreateThumbnailFromImageAlways` on an image below the max pixel size.
    const longEdge = Math.max(width, height);
    const target = Math.min(size, longEdge || size);

    let base64: string | null = null;
    try {
      const context = ImageManipulator.manipulate(uri);
      context.resize(landscape ? { width: target } : { height: target });
      const image = await context.renderAsync();
      const saved = await image.saveAsync({ compress: quality, format: SaveFormat.JPEG, base64: true });
      base64 = saved.base64 ?? null;
    } catch {
      // `guard let thumbnail = … else { continue }` — a size that cannot be produced is skipped.
      continue;
    }

    if (base64 && fitsPhotoLimit(base64)) return photoDataUrl(base64);
  }

  // `throw Failure.invalid`
  throw new Error(PHOTO_INVALID);
}

import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

/**
 * `attach(_:)` (ios/App/ShoppingItemEditor.swift:68-80): every item image — a photo, a camera shot or
 * AI artwork — is redrawn to at most 480 px on its longer edge (never enlarged) and re-encoded as JPEG
 * at 0.8, 0.6, 0.4 then 0.2 until it fits in 67,000 bytes. Redrawing is what strips the camera's EXIF
 * and location metadata, and JPEG is what the server requires (`/9j/…`).
 *
 * The loop is pure and tested with a fake encoder; `manipulatorEncoder` is the device half.
 */

export const MAX_EDGE = 480;
export const MAX_BYTES = 67_000;
export const QUALITIES = [0.8, 0.6, 0.4, 0.2] as const;
export const IMAGE_TOO_DETAILED = 'This image is too detailed. Choose a simpler or cropped photo.';
export const PHOTO_UNREADABLE = 'Could not open that photo. Choose another image.';
export const CAMERA_DENIED = 'Camera access is off. Enable it for Nexdo in Settings, or choose a photo.';

/** `ratio = min(1, 480 / max(w, h))`, `size = max(1, w * ratio)` — Swift's target size. */
export function targetSize(width: number, height: number): { width: number; height: number } {
  const ratio = Math.min(1, MAX_EDGE / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
}

/** The decoded size of a base64 string, in bytes. */
export function base64Bytes(value: string): number {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return Math.floor((value.length * 3) / 4) - padding;
}

export type ImageEncoder = {
  /** The source image's pixel size. */
  size(uri: string): Promise<{ width: number; height: number }>;
  /** Redraws at `size` and returns base64 JPEG at `quality`. */
  jpeg(uri: string, size: { width: number; height: number }, quality: number): Promise<string>;
};

/** Resolves to base64 JPEG, or throws `IMAGE_TOO_DETAILED`. */
export async function encodeItemImage(uri: string, encoder: ImageEncoder): Promise<string> {
  const source = await encoder.size(uri);
  const size = targetSize(source.width, source.height);
  for (const quality of QUALITIES) {
    const data = await encoder.jpeg(uri, size, quality);
    if (base64Bytes(data) <= MAX_BYTES) return data;
  }
  throw new Error(IMAGE_TOO_DETAILED);
}

/** `expo-image-manipulator`, already used by the Phase 7 profile photo. */
export const manipulatorEncoder: ImageEncoder = {
  async size(uri) {
    const image = await ImageManipulator.manipulate(uri).renderAsync();
    return { width: image.width, height: image.height };
  },
  async jpeg(uri, size, quality) {
    const context = ImageManipulator.manipulate(uri);
    context.resize(size);
    const image = await context.renderAsync();
    const saved = await image.saveAsync({ compress: quality, format: SaveFormat.JPEG, base64: true });
    if (!saved.base64) throw new Error(PHOTO_UNREADABLE);
    return saved.base64;
  },
};

/** AI artwork arrives as base64; the manipulator needs a file, so it goes through the cache first. */
export function base64ToCacheFile(base64: string): string {
  const file = new File(new Directory(Paths.cache), `item-${Crypto.randomUUID()}.jpg`);
  file.write(base64, { encoding: 'base64' });
  return file.uri;
}

/**
 * `PhotosPicker(matching: .images)` — the system photo picker, which needs no library permission,
 * as the Phase 7 profile photo already does. Resolves to a URI, or `null` when cancelled.
 */
export async function choosePhoto(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  return result.canceled ? null : (result.assets[0]?.uri ?? null);
}

/**
 * "Take a Picture" (`openCamera()` and `ShoppingCamera`, ShoppingItemEditor.swift:81-84, :98-111):
 * ask for the camera, then open it. Throws `CAMERA_DENIED` when access is refused.
 */
export async function takePicture(): Promise<string | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new Error(CAMERA_DENIED);
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
  return result.canceled ? null : (result.assets[0]?.uri ?? null);
}

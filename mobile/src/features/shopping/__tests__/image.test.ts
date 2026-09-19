import UPNG from 'upng-js';

import { base64Bytes, bmp24, encodeItemImage, flattenOntoWhite, IMAGE_TOO_DETAILED, MAX_BYTES, targetSize, type ImageEncoder } from '../image';

function encoder(width: number, height: number, bytesByQuality: Record<number, number>) {
  const calls: { uri: string; size: { width: number; height: number }; quality: number }[] = [];
  const fake: ImageEncoder = {
    size: async () => ({ width, height }),
    flatten: async (uri) => `${uri}#flat`,
    jpeg: async (uri, size, quality) => {
      calls.push({ uri, size, quality });
      return 'A'.repeat(Math.ceil(((bytesByQuality[quality] ?? 1) * 4) / 3));
    },
  };
  return { fake, calls };
}

describe('item image pipeline (ShoppingItemEditor.swift:68-80)', () => {
  it('bounds the longer edge to 480 px and never enlarges', () => {
    expect(targetSize(4032, 3024)).toEqual({ width: 480, height: 360 });
    expect(targetSize(1080, 1920)).toEqual({ width: 270, height: 480 });
    expect(targetSize(300, 200)).toEqual({ width: 300, height: 200 });
    expect(targetSize(0, 0)).toEqual({ width: 1, height: 1 });
  });

  it('counts decoded bytes, not base64 characters', () => {
    expect(base64Bytes('AAAA')).toBe(3);
    expect(base64Bytes('AAA=')).toBe(2);
    expect(base64Bytes('AA==')).toBe(1);
  });

  it('steps the JPEG quality down until it fits in 67,000 bytes', async () => {
    const { fake, calls } = encoder(4032, 3024, { 0.8: 90_000, 0.6: 70_000, 0.4: 60_000 });
    const data = await encodeItemImage('file:///photo.heic', fake);
    expect(base64Bytes(data)).toBeLessThanOrEqual(MAX_BYTES);
    expect(calls.map((call) => call.quality)).toEqual([0.8, 0.6, 0.4]);
    expect(calls.every((call) => call.size.width === 480 && call.size.height === 360)).toBe(true);
    // The JPEG is always encoded from the image flattened onto white.
    expect(calls.every((call) => call.uri === 'file:///photo.heic#flat')).toBe(true);
  });

  it('refuses an image that is still too big at 0.2', async () => {
    const { fake, calls } = encoder(480, 480, { 0.8: 99_000, 0.6: 99_000, 0.4: 99_000, 0.2: 68_000 });
    await expect(encodeItemImage('file:///busy.jpg', fake)).rejects.toThrow(IMAGE_TOO_DETAILED);
    expect(calls).toHaveLength(4);
  });
});

describe('flattening onto white (ShoppingItemEditor.swift:72-75)', () => {
  it('composites every pixel source-over onto opaque white', () => {
    const rgba = new Uint8Array([
      255, 0, 0, 255, // opaque red stays red
      0, 0, 0, 0, // fully transparent becomes white, not black
      0, 0, 0, 128, // half-transparent black becomes mid grey
    ]);
    const { rgb, hadAlpha } = flattenOntoWhite(rgba);
    expect(hadAlpha).toBe(true);
    expect(Array.from(rgb)).toEqual([255, 0, 0, 255, 255, 255, 127, 127, 127]);
    expect(flattenOntoWhite(new Uint8Array([1, 2, 3, 255])).hadAlpha).toBe(false);
  });

  it('decodes a transparent 8-bit RGBA PNG — what the manipulator writes — and flattens it', () => {
    // More than 256 colours, so UPNG writes true-colour RGBA rather than a palette.
    const size = 20;
    const rgba = new Uint8Array(size * size * 4);
    for (let index = 0; index < size * size; index++) {
      rgba.set([index % 256, (index * 7) % 256, 90, index === 0 ? 0 : 255], index * 4);
    }
    const decoded = UPNG.decode(UPNG.encode([rgba.buffer], size, size, 0));
    expect(decoded.ctype).toBe(6);
    const { rgb, hadAlpha } = flattenOntoWhite(new Uint8Array(UPNG.toRGBA8(decoded)[0]));
    expect(hadAlpha).toBe(true);
    // The transparent corner is white, not black; an opaque pixel is untouched.
    expect(Array.from(rgb.slice(0, 3))).toEqual([255, 255, 255]);
    expect(Array.from(rgb.slice(3, 6))).toEqual([1, 7, 90]);
  });

  it('writes a bottom-up 24-bit BMP with 4-byte row padding', () => {
    const bmp = bmp24(new Uint8Array([1, 2, 3, 4, 5, 6]), 1, 2);
    const view = new DataView(bmp.buffer);
    expect(String.fromCharCode(bmp[0], bmp[1])).toBe('BM');
    expect(view.getUint32(2, true)).toBe(54 + 4 * 2);
    expect(view.getInt32(18, true)).toBe(1);
    expect(view.getInt32(22, true)).toBe(2);
    expect(view.getUint16(28, true)).toBe(24);
    // The last source row comes first, in BGR order.
    expect(Array.from(bmp.slice(54, 57))).toEqual([6, 5, 4]);
    expect(Array.from(bmp.slice(58, 61))).toEqual([3, 2, 1]);
  });
});

import { base64Bytes, encodeItemImage, IMAGE_TOO_DETAILED, MAX_BYTES, targetSize, type ImageEncoder } from '../image';

function encoder(width: number, height: number, bytesByQuality: Record<number, number>) {
  const calls: { size: { width: number; height: number }; quality: number }[] = [];
  const fake: ImageEncoder = {
    size: async () => ({ width, height }),
    jpeg: async (_uri, size, quality) => {
      calls.push({ size, quality });
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
  });

  it('refuses an image that is still too big at 0.2', async () => {
    const { fake, calls } = encoder(480, 480, { 0.8: 99_000, 0.6: 99_000, 0.4: 99_000, 0.2: 68_000 });
    await expect(encodeItemImage('file:///busy.jpg', fake)).rejects.toThrow(IMAGE_TOO_DETAILED);
    expect(calls).toHaveLength(4);
  });
});

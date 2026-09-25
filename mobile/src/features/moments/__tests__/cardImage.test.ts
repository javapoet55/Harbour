import { CARD_MAX_BYTES, CARD_MAX_EDGE, CARD_RETRY_EDGE, cardTargetSize, encodeCard, encodeSmallerCard, type CardEncoder } from '../cardImage';

/** A base64 string that decodes to roughly `bytes`. */
const ofSize = (bytes: number) => 'A'.repeat(Math.ceil((bytes * 4) / 3));

/**
 * The device half is `expo-image-manipulator`; this exercises the loop with a fake encoder, as
 * `encodeItemImage` is tested for the shopping photos.
 */
function encoder(source: { width: number; height: number }, sizes: Record<number, number>): CardEncoder & { calls: { size: { width: number; height: number }; quality: number }[] } {
  const calls: { size: { width: number; height: number }; quality: number }[] = [];
  return {
    calls,
    size: async () => source,
    jpeg: async (_uri, size, quality) => {
      calls.push({ size, quality });
      return ofSize(sizes[quality] ?? 1_000);
    },
  };
}

describe('cardTargetSize', () => {
  it('bounds the longest side to 1600 px and keeps the aspect ratio', () => {
    expect(cardTargetSize(3200, 2400)).toEqual({ width: 1600, height: 1200 });
    expect(cardTargetSize(2400, 3200)).toEqual({ width: 1200, height: 1600 });
  });

  it('never enlarges a card that is already smaller', () => {
    expect(cardTargetSize(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it('never returns a zero edge', () => {
    expect(cardTargetSize(0, 0)).toEqual({ width: 1, height: 1 });
  });
});

describe('encodeCard', () => {
  it('encodes at quality 0.85 within 1600 px when that already fits', async () => {
    const fake = encoder({ width: 1140, height: 3000 }, { 0.85: 900_000 });
    await encodeCard('file:///card.jpg', fake);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0].quality).toBe(0.85);
    expect(Math.max(fake.calls[0].size.width, fake.calls[0].size.height)).toBe(CARD_MAX_EDGE);
  });

  it('steps the quality down until it fits under the server limit', async () => {
    const fake = encoder({ width: 2000, height: 2000 }, { 0.85: CARD_MAX_BYTES + 1, 0.7: CARD_MAX_BYTES + 1, 0.55: 1_200_000 });
    const data = await encodeCard('file:///card.jpg', fake);
    expect(fake.calls.map((call) => call.quality)).toEqual([0.85, 0.7, 0.55]);
    expect(data.length).toBeGreaterThan(0);
  });

  it('accepts the limit exactly, since the server does', async () => {
    const fake = encoder({ width: 2000, height: 2000 }, { 0.85: CARD_MAX_BYTES });
    await encodeCard('file:///card.jpg', fake);
    expect(fake.calls).toHaveLength(1);
  });
});

describe('encodeSmallerCard', () => {
  it('re-encodes the same capture at a smaller edge for the 413 retry', async () => {
    const fake = encoder({ width: 2000, height: 2000 }, { 0.7: 800_000 });
    await encodeSmallerCard('file:///card.jpg', fake);
    expect(Math.max(fake.calls[0].size.width, fake.calls[0].size.height)).toBe(CARD_RETRY_EDGE);
    expect(fake.calls[0].quality).toBe(0.7);
  });
});

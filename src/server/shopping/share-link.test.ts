import { describe, expect, it } from 'vitest';
import { decodeShoppingShareToken } from './share-link';
describe('compact shopping share links', () => {
  it('preserves the full existing secret and produces a stable URL token', () => {
    const hex = '0123456789abcdef'.repeat(4);
    const compact = Buffer.from(hex, 'hex').toString('base64url');
    expect(compact).toHaveLength(43);
    expect(decodeShoppingShareToken(compact)).toBe(hex);
    expect(decodeShoppingShareToken(compact)).toBe(hex);
  });
  it('rejects malformed and noncanonical tokens', () => {
    for (const value of ['', 'a'.repeat(64), '/'.repeat(43), 'A'.repeat(42) + 'B']) {
      expect(decodeShoppingShareToken(value)).toBeNull();
    }
  });
});

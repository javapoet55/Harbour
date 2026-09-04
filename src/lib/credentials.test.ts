import { describe, expect, it } from 'vitest';
import { decryptCredential, encryptCredential } from './credentials';

describe('OAuth credential encryption', () => {
  it('encrypts with a randomized authenticated envelope and decrypts losslessly', () => {
    const first = encryptCredential('refresh-secret');
    const second = encryptCredential('refresh-secret');
    expect(first).toMatch(/^v1\./);
    expect(first).not.toBe(second);
    expect(decryptCredential(first)).toBe('refresh-secret');
  });

  it('supports legacy plaintext values during migration', () => {
    expect(decryptCredential('legacy-token')).toBe('legacy-token');
  });
});

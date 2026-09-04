import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function key() {
  const raw = process.env.HARBOR_CREDENTIAL_ENCRYPTION_KEY;
  if (!raw) {
    if (process.env.NODE_ENV === 'production') throw new Error('HARBOR_CREDENTIAL_ENCRYPTION_KEY is required');
    return Buffer.from('f20d27b2b64f82e0d14b1b12591d233dd153908a6d195eec37a1b17b0f4d43a1', 'hex');
  }
  const value = Buffer.from(raw, 'hex');
  if (value.length !== 32) throw new Error('HARBOR_CREDENTIAL_ENCRYPTION_KEY must be 64 hex characters');
  return value;
}

export function encryptCredential(value: string | null | undefined) {
  if (!value) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptCredential(value: string | null | undefined) {
  if (!value) return null;
  if (!value.startsWith('v1.')) return value; // Supports migration from the MVP's plaintext fields.
  const [, iv, tag, encrypted] = value.split('.');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
}

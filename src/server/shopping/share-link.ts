/** Decode a URL-safe representation of the existing 256-bit share secret. */
export function decodeShoppingShareToken(value: string): string | null {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) return null;
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.length !== 32 || bytes.toString('base64url') !== value) return null;
  return bytes.toString('hex');
}

import {
  base64ByteLength,
  fitsPhotoLimit,
  photoAttempts,
  photoBase64,
  photoDataUrl,
  PHOTO_MAX_BYTES,
} from './profilePhoto';

/** `ProfilePhotoEncoder.encode(_:)` (ios/App/ProfilePhotoEncoder.swift:11-27). */
describe('photo encoding policy', () => {
  it('tries every size and quality in Swift’s order: size outer, quality inner', () => {
    expect(photoAttempts()).toEqual([
      { size: 512, quality: 0.8 },
      { size: 512, quality: 0.65 },
      { size: 512, quality: 0.5 },
      { size: 384, quality: 0.8 },
      { size: 384, quality: 0.65 },
      { size: 384, quality: 0.5 },
      { size: 256, quality: 0.8 },
      { size: 256, quality: 0.65 },
      { size: 256, quality: 0.5 },
    ]);
  });

  it('measures decoded bytes, padding included', () => {
    // "any carnal pleasure." → 20 bytes, base64 "YW55IGNhcm5hbCBwbGVhc3VyZS4=".
    expect(base64ByteLength('YW55IGNhcm5hbCBwbGVhc3VyZS4=')).toBe(20);
    expect(base64ByteLength('YWJj')).toBe(3);
    expect(base64ByteLength('YWI=')).toBe(2);
    expect(base64ByteLength('YQ==')).toBe(1);
    expect(base64ByteLength('')).toBe(0);
  });

  /** `jpeg.count <= 256000` — the limit is inclusive, and the server's check is the same one. */
  it('accepts exactly 256,000 bytes and refuses one more', () => {
    // 85,333 unpadded groups carry 255,999 bytes; one padded group adds the last one or two.
    const body = 'A'.repeat(85_333 * 4);
    const atLimit = `${body}QQ==`;
    const overLimit = `${body}QUE=`;

    expect(base64ByteLength(atLimit)).toBe(PHOTO_MAX_BYTES);
    expect(base64ByteLength(overLimit)).toBe(PHOTO_MAX_BYTES + 1);
    expect(fitsPhotoLimit(atLimit)).toBe(true);
    expect(fitsPhotoLimit(overLimit)).toBe(false);
  });

  it('builds the exact data URL the server’s regex requires', () => {
    // `settingsSchema.photo` (src/app/api/settings/route.ts:36) matches /^data:image\/jpeg;base64,…/.
    expect(photoDataUrl('YWJj')).toBe('data:image/jpeg;base64,YWJj');
    expect(photoDataUrl('YWJj')).toMatch(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/);
  });

  it('reads the payload back out of a stored photo, as Swift’s avatar does', () => {
    expect(photoBase64('data:image/jpeg;base64,YWJj')).toBe('YWJj');
    expect(photoBase64(null)).toBeNull();
    expect(photoBase64(undefined)).toBeNull();
    expect(photoBase64('')).toBeNull();
  });
});

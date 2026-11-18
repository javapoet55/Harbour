/** Classify phone platforms without storing a full user agent or guessing a model. */
export function phonePlatform(value: string | null | undefined) {
  if (!value) return null;
  if (/\bandroid\b/i.test(value)) return 'Android';
  if (/iphone/i.test(value)) return 'iPhone';
  return null;
}

export function reportedDevice(metadata: string | undefined) {
  if (!metadata) return null;
  try {
    const { deviceModel } = JSON.parse(metadata) ?? {};
    return typeof deviceModel === 'string' ? deviceModel.trim().slice(0, 100) || null : null;
  } catch {
    return null;
  }
}

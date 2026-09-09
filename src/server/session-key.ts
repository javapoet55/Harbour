export function sessionSigningKey() {
  const value = process.env.HARBOR_SESSION_SECRET;
  if (process.env.NODE_ENV === 'production' && (!value || value.length < 32 || value === 'harbor-dev-session-secret-change-me')) throw new Error('SESSION_CONFIGURATION_REQUIRED');
  return new TextEncoder().encode(value || 'harbor-dev-session-secret-change-me');
}

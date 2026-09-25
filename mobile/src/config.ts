import Constants from 'expo-constants';

/** The API origin from `extra.apiUrl` in app.config.ts. There is deliberately no fallback here. */
export function getApiUrl(): string {
  const apiUrl: unknown = Constants.expoConfig?.extra?.apiUrl;
  if (typeof apiUrl !== 'string' || apiUrl.length === 0) {
    throw new Error('extra.apiUrl is missing. Set it in app.config.ts or through EXPO_PUBLIC_API_URL.');
  }
  return apiUrl;
}

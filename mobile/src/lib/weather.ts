import type { TaskSymbolName } from '../components/TaskSymbol';

/**
 * Port of `WeatherResponse.Current.conditionSymbol` (ios/Sources/NexdoCore/Models.swift:81-93),
 * mapping an open-meteo WMO weather code to an SF Symbol, then to its Ionicons substitute.
 */
export function conditionSymbol(code: number | null | undefined): TaskSymbolName {
  const value = code ?? -1;
  if (value === 0) return 'sun.max.fill';
  if (value === 1 || value === 2) return 'cloud.sun.fill';
  if (value === 3) return 'cloud.fill';
  if (value === 45 || value === 48) return 'cloud.fog.fill';
  if (value >= 51 && value <= 57) return 'cloud.drizzle.fill';
  if ((value >= 61 && value <= 67) || (value >= 80 && value <= 82)) return 'cloud.rain.fill';
  if ((value >= 71 && value <= 77) || value === 85 || value === 86) return 'cloud.snow.fill';
  if (value >= 95 && value <= 99) return 'cloud.bolt.rain.fill';
  return 'thermometer.medium';
}

/** `WeatherResponse.Day.condition` (Models.swift:128-140), for the forecast sheet in Run B. */
export function conditionLabel(code: number | null | undefined): string {
  const value = code ?? -1;
  if (value === 0) return 'Clear';
  if (value === 1 || value === 2) return 'Partly cloudy';
  if (value === 3) return 'Cloudy';
  if (value === 45 || value === 48) return 'Fog';
  if (value >= 51 && value <= 57) return 'Drizzle';
  if ((value >= 61 && value <= 67) || (value >= 80 && value <= 82)) return 'Rain';
  if ((value >= 71 && value <= 77) || value === 85 || value === 86) return 'Snow';
  if (value >= 95 && value <= 99) return 'Thunderstorms';
  return 'Conditions unavailable';
}

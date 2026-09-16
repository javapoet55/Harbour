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

/** `WeatherResponse.Day` (ios/Sources/NexdoCore/Models.swift:113-140). */
export type WeatherDay = {
  /** The `yyyy-MM-dd` string, which is also the row identity. */
  id: string;
  code: number | null;
  high: number | null;
  low: number | null;
  rain: number | null;
};

/**
 * `WeatherResponse.Daily.days` (Models.swift:120-130): the first FIVE entries, each index read
 * defensively because open-meteo can return shorter arrays than `time`.
 */
export function weatherDays(daily: {
  time: string[];
  weather_code: (number | null)[];
  temperature_2m_max: (number | null)[];
  temperature_2m_min: (number | null)[];
  precipitation_probability_max: (number | null)[];
} | null | undefined): WeatherDay[] {
  if (!daily) return [];
  return daily.time.slice(0, 5).map((day, index) => ({
    id: day,
    code: daily.weather_code[index] ?? null,
    high: daily.temperature_2m_max[index] ?? null,
    low: daily.temperature_2m_min[index] ?? null,
    rain: daily.precipitation_probability_max[index] ?? null,
  }));
}

/** `temperature(_:)` (ios/App/WeatherForecastView.swift:84): rounded, or an em dash. */
export function temperatureLabel(value: number | null): string {
  return value === null ? '\u2014' : `${Math.round(value)}\u00b0`;
}

/**
 * `dateLabel(_:zone:)` (WeatherForecastView.swift:85-95): "Today" for the current day in the
 * forecast's own zone, otherwise `EEE, MMM d`.
 */
export function forecastDayLabel(day: string, zone: string | null | undefined, now: number = Date.now()): string {
  const timeZone = zone ?? 'America/Los_Angeles';
  try {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(now));
    if (today === day) return 'Today';
    const [year, month, date] = day.split('-').map(Number);
    if (!year || !month || !date) return day;
    return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(
      new Date(Date.UTC(year, month - 1, date)),
    );
  } catch {
    return day;
  }
}

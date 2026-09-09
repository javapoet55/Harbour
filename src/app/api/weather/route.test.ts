import { afterEach, expect, it, vi } from 'vitest';
import { GET } from './route';

afterEach(() => vi.unstubAllGlobals());

it('requests five daily forecasts and preserves current weather', async () => {
  const payload = { current: { temperature_2m: 72 }, current_units: { temperature_2m: '°F' }, daily: { time: ['2026-09-07'] }, timezone: 'America/Los_Angeles' };
  const fetchMock = vi.fn().mockResolvedValue(Response.json(payload));
  vi.stubGlobal('fetch', fetchMock);
  const response = await GET(new Request('https://nexdo.test/api/weather?lat=37.7547&lon=-121.8997'));
  expect(await response.json()).toEqual({ current: payload.current, units: payload.current_units, daily: payload.daily, timezone: payload.timezone });
  const url = fetchMock.mock.calls[0][0] as URL;
  expect(url.searchParams.get('forecast_days')).toBe('5');
  expect(url.searchParams.get('daily')).toBe('weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max');
  expect(url.searchParams.get('temperature_unit')).toBe('fahrenheit');
});

it('returns a retryable error when the provider fails', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unavailable')));
  expect((await GET(new Request('https://nexdo.test/api/weather?lat=37&lon=-121'))).status).toBe(502);
});

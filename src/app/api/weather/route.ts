import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const latitude = Number(params.get('lat'));
  const longitude = Number(params.get('lon'));
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return NextResponse.json({ error: 'Valid coordinates are required.' }, { status: 400 });
  }
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', latitude.toFixed(4));
  url.searchParams.set('longitude', longitude.toFixed(4));
  url.searchParams.set('current', 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m');
  url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max');
  url.searchParams.set('forecast_days', '5');
  url.searchParams.set('temperature_unit', 'fahrenheit');
  url.searchParams.set('wind_speed_unit', 'mph');
  url.searchParams.set('timezone', 'auto');
  try {
    const response = await fetch(url, { next: { revalidate: 600 }, signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`Weather provider returned ${response.status}`);
    const payload = await response.json();
    return NextResponse.json({ current: payload.current, units: payload.current_units, daily: payload.daily, timezone: payload.timezone });
  } catch {
    return NextResponse.json({ error: 'Weather is temporarily unavailable.' }, { status: 502 });
  }
}

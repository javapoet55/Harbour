import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';
import { Linking, Platform } from 'react-native';

import { WeatherChip } from '../components/TodayShell';
import { LOCATION_UNAVAILABLE, resolveWeatherPlace, SAN_RAMON, weatherUrl } from '../query/useToday';

import Weather from '../../app/(tabs)/(today)/today/weather';

/**
 * The weather-location bug: Android showed San Ramon wherever the phone was, because the forecast
 * used Swift's hard-coded coordinates. Android now uses the device's approximate location, asks for it
 * on the Weather screen's first open, and says so when it has none. iOS keeps Swift's coordinates.
 */
const location = Location as unknown as Record<string, jest.Mock>;
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const FORECAST = {
  current: { temperature_2m: 88.2, weather_code: 1 },
  timezone: 'Asia/Kolkata',
  daily: {
    time: ['2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26'],
    weather_code: [1, 61, 2, 3, 1],
    temperature_2m_max: [90, 91, 89, 88, 87],
    temperature_2m_min: [74, 75, 73, 72, 71],
    precipitation_probability_max: [10, 70, 20, 30, 10],
  },
};

/** Bengaluru, as a phone there would report it. */
const BENGALURU = { coords: { latitude: 12.97159, longitude: 77.59456 } };

const granted = { granted: true, status: 'granted', canAskAgain: true };
const undetermined = { granted: false, status: 'undetermined', canAskAgain: true };
const denied = { granted: false, status: 'denied', canAskAgain: false };

function wrap() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Weather />
    </QueryClientProvider>,
  );
}

const fetchedUrl = () => String(mockFetch.mock.calls[mockFetch.mock.calls.length - 1][0]);

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockResolvedValue({ ok: true, json: async () => FORECAST });
  location.getLastKnownPositionAsync.mockResolvedValue(BENGALURU);
  location.reverseGeocodeAsync.mockResolvedValue([{ city: 'Bengaluru', region: 'Karnataka' }]);
});

afterEach(() => jest.restoreAllMocks());

describe('Weather on Android', () => {
  beforeEach(() => jest.replaceProperty(Platform, 'OS', 'android'));

  it('with location granted, forecasts the phone’s town — never San Ramon', async () => {
    location.getForegroundPermissionsAsync.mockResolvedValue(granted);
    await wrap();
    await waitFor(() => expect(screen.getByTestId('weather-title')).toHaveTextContent('Bengaluru'));
    expect(fetchedUrl()).toContain('latitude=12.97&longitude=77.59');
    expect(fetchedUrl()).not.toContain('37.7547');
    expect(location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(screen.getByTestId('weather-current')).toBeTruthy();
    expect(screen.queryByTestId('weather-location-unavailable')).toBeNull();
  });

  it('on first open, asks once for approximate location and forecasts once allowed', async () => {
    location.getForegroundPermissionsAsync.mockResolvedValueOnce(undetermined).mockResolvedValueOnce(undetermined).mockResolvedValue(granted);
    location.requestForegroundPermissionsAsync.mockResolvedValue(granted);
    await wrap();
    await waitFor(() => expect(screen.getByTestId('weather-title')).toHaveTextContent('Bengaluru'));
    expect(location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(fetchedUrl()).toContain('latitude=12.97&longitude=77.59');
  });

  it('when refused, shows that the location is unavailable, fetches nothing, and names no city', async () => {
    location.getForegroundPermissionsAsync.mockResolvedValue(undetermined);
    location.requestForegroundPermissionsAsync.mockResolvedValue(denied);
    await wrap();
    await waitFor(() => expect(screen.getByTestId('weather-location-unavailable')).toBeTruthy());
    expect(screen.getByText(LOCATION_UNAVAILABLE)).toBeTruthy();
    expect(LOCATION_UNAVAILABLE).toBe('Location unavailable — enable location to see local weather');
    expect(screen.getByTestId('weather-title')).toHaveTextContent('Weather');
    expect(mockFetch).not.toHaveBeenCalled();
    expect(screen.queryByText('San Ramon')).toBeNull();
    // A refusal is not an error.
    expect(screen.queryByTestId('weather-failure')).toBeNull();
  });

  it('once permission can no longer be asked for, "Enable location" opens the app’s settings', async () => {
    location.getForegroundPermissionsAsync.mockResolvedValue(denied);
    const settings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    await wrap();
    await waitFor(() => expect(screen.getByTestId('weather-enable-location')).toBeTruthy());
    // Already refused: the screen does not prompt again on its own.
    expect(location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('weather-enable-location'));
    await waitFor(() => expect(settings).toHaveBeenCalled());
  });

  it('with no position fix, says the location is unavailable rather than guessing', async () => {
    location.getForegroundPermissionsAsync.mockResolvedValue(granted);
    location.getLastKnownPositionAsync.mockResolvedValue(null);
    location.getCurrentPositionAsync.mockRejectedValue(new Error('Location services are disabled'));
    expect(await resolveWeatherPlace()).toEqual({ kind: 'unavailable' });
  });

  it('names the place "Current location" when the geocoder cannot', async () => {
    location.getForegroundPermissionsAsync.mockResolvedValue(granted);
    location.reverseGeocodeAsync.mockRejectedValue(new Error('no geocoder'));
    expect(await resolveWeatherPlace()).toEqual({ kind: 'device', latitude: 12.97, longitude: 77.59, name: 'Current location' });
  });
});

describe('Weather on iOS', () => {
  beforeEach(() => jest.replaceProperty(Platform, 'OS', 'ios'));

  it('keeps Swift’s fixed coordinates and never touches location', async () => {
    await wrap();
    await waitFor(() => expect(screen.getByTestId('weather-title')).toHaveTextContent('San Ramon'));
    expect(fetchedUrl()).toBe(weatherUrl(SAN_RAMON));
    expect(fetchedUrl()).toContain('latitude=37.7547&longitude=-121.8997');
    expect(location.getForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });
});

describe('the Today weather chip', () => {
  it('names the forecast’s place', async () => {
    await render(<WeatherChip temperature={88} weatherCode={1} place="Bengaluru" onPress={jest.fn()} testID="chip" />);
    expect(screen.getByTestId('chip').props.accessibilityLabel).toBe('Bengaluru weather, 88 degrees Fahrenheit');
  });

  it('still says San Ramon by default, as on iOS', async () => {
    await render(<WeatherChip temperature={71} weatherCode={0} onPress={jest.fn()} testID="chip" />);
    expect(screen.getByTestId('chip').props.accessibilityLabel).toBe('San Ramon weather, 71 degrees Fahrenheit');
  });
});

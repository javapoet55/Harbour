import { useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { TaskSymbol, Text } from '../../../../src/components';
import { conditionLabel, conditionSymbol, forecastDayLabel, temperatureLabel, weatherDays } from '../../../../src/lib/weather';
import { queryKeys } from '../../../../src/query/keys';
import { LOCATION_UNAVAILABLE, requestWeatherLocation, useWeather } from '../../../../src/query/useToday';
import { brand, useTheme } from '../../../../src/theme';

/**
 * Port of `WeatherForecastView` (ios/App/WeatherForecastView.swift), built from `body` at `:11-72`.
 * Child view files followed: none — `temperatures`, `temperature` and `dateLabel` are private funcs
 * on the same view; the condition glyph and label come from `WeatherResponse` in `Models.swift`.
 *
 * The title is the forecast's place: "San Ramon" on iOS, where `WeatherClient` hardcodes those
 * coordinates, and the device's town on Android. Android asks for APPROXIMATE location the first time
 * this screen opens; without it, the screen says the location is unavailable instead of showing some
 * other city's weather.
 */
export default function Weather() {
  const theme = useTheme();
  const weather = useWeather();
  const queryClient = useQueryClient();

  // After a grant, fetch again for wherever the phone is. The first fetch may still be in flight
  // (it found no permission); React Query folds an invalidation into a data-less in-flight fetch, so
  // cancel that one first or its "unavailable" answer would stand.
  const refetchForLocation = async () => {
    await queryClient.cancelQueries({ queryKey: queryKeys.weather() });
    await queryClient.invalidateQueries({ queryKey: queryKeys.weather() });
  };

  // Android: ask on first open.
  useEffect(() => {
    void requestWeatherLocation().then(async (granted) => {
      if (!granted) return;
      await queryClient.cancelQueries({ queryKey: queryKeys.weather() });
      await queryClient.invalidateQueries({ queryKey: queryKeys.weather() });
    });
  }, [queryClient]);

  const place = weather.data?.place ?? null;
  const unavailable = place?.kind === 'unavailable';
  const forecast = weather.data?.forecast ?? null;
  const days = weatherDays(forecast?.daily);
  // `failure` (WeatherForecastView.swift:99-101): the wording depends on whether anything is shown.
  const failure = weather.isError
    ? forecast === null
      ? 'Couldn’t load the forecast. Please try again.'
      : 'Couldn’t refresh. Showing the previous forecast.'
    : null;

  return (
    <View style={styles.fill}>
      <LinearGradient
        colors={[withAlpha(brand.nexdoBlue, 0.09), withAlpha(brand.nexdoMagenta, 0.05), theme.colors.background]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={weather.isRefetching} onRefresh={() => void weather.refetch()} />}
      >
        <View style={styles.heading}>
          <Text style={[styles.title, { color: theme.colors.ink }]} testID="weather-title">
            {place === null || place.kind === 'unavailable' ? 'Weather' : place.name}
          </Text>
          <Text style={[styles.subheadline, { color: theme.colors.secondary }]}>5-day forecast · °F</Text>
        </View>

        {/* Android without location: say so, and offer the way to turn it on. Never another city. */}
        {unavailable ? (
          <View style={styles.unavailable} testID="weather-location-unavailable">
            <Text style={[theme.typography.body, { color: theme.colors.secondary }]}>{LOCATION_UNAVAILABLE}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Enable location"
              onPress={() => void enableLocation().then(refetchForLocation)}
              style={styles.retry}
              testID="weather-enable-location"
            >
              <Text style={[styles.retryLabel, { color: theme.colors.link }]}>Enable location</Text>
            </Pressable>
          </View>
        ) : null}

        {forecast ? (
          <>
            <View accessible style={styles.current} testID="weather-current">
              <TaskSymbol name={conditionSymbol(forecast.current.weather_code)} size={34} color={theme.colors.link} />
              <Text style={[styles.currentTemperature, { color: theme.colors.ink }]}>
                {`${Math.round(forecast.current.temperature_2m)}°`}
              </Text>
              <Text style={[theme.typography.body, { color: theme.colors.secondary }]}>Currently</Text>
            </View>

            <View style={[styles.days, { backgroundColor: theme.colors.surface, borderColor: withAlpha(brand.nexdoIndigo, 0.12) }]}>
              {days.map((day, index) => (
                <View key={day.id}>
                  <View accessible style={styles.day} testID={`weather-day-${day.id}`}>
                    <View style={styles.dayRow}>
                      <View style={styles.grow}>
                        <Text style={[styles.dayTitle, { color: theme.colors.ink }]}>
                          {forecastDayLabel(day.id, forecast.timezone)}
                        </Text>
                        <Text style={[styles.caption, { color: theme.colors.secondary }]}>{conditionLabel(day.code)}</Text>
                      </View>
                      <TaskSymbol name={conditionSymbol(day.code)} size={22} color={theme.colors.link} />
                      <View
                        accessibilityLabel={`High ${temperatureLabel(day.high)}, low ${temperatureLabel(day.low)} Fahrenheit`}
                        style={styles.temperatures}
                      >
                        <Text style={[styles.high, { color: theme.colors.ink }]}>{`H ${temperatureLabel(day.high)}`}</Text>
                        <Text style={[styles.low, { color: theme.colors.secondary }]}>{`L ${temperatureLabel(day.low)}`}</Text>
                      </View>
                    </View>
                    {day.rain !== null ? (
                      <View style={styles.rainRow}>
                        <TaskSymbol name="drop.fill" size={12} color={theme.colors.secondary} />
                        <Text style={[styles.caption, { color: theme.colors.secondary }]}>
                          {`${day.rain}% chance of precipitation`}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  {index < days.length - 1 ? (
                    <View style={[styles.divider, { backgroundColor: theme.colors.separator }]} />
                  ) : null}
                </View>
              ))}
            </View>
          </>
        ) : null}

        {weather.isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator />
            <Text style={[theme.typography.body, { color: theme.colors.secondary }]}>Loading forecast…</Text>
          </View>
        ) : null}

        {failure !== null ? (
          <>
            <Text style={[theme.typography.body, { color: theme.colors.secondary }]} testID="weather-failure">
              {failure}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry"
              accessibilityState={{ disabled: weather.isFetching }}
              disabled={weather.isFetching}
              onPress={() => void weather.refetch()}
              style={[styles.retry, { backgroundColor: theme.colors.tint }]}
              testID="weather-retry"
            >
              <Text style={[styles.retryLabel, { color: '#FFFFFF' }]}>Retry</Text>
            </Pressable>
          </>
        ) : null}

        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Weather by Open-Meteo"
          onPress={() => void Linking.openURL('https://open-meteo.com/')}
          testID="weather-attribution"
        >
          <Text style={[styles.footnote, { color: theme.colors.link }]}>Weather by Open-Meteo</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

/**
 * "Enable location": asks again while Android still allows it; once it does not ("Don't allow" twice,
 * or "never ask"), only the app's settings can turn it on.
 */
async function enableLocation(): Promise<void> {
  try {
    const current = await Location.getForegroundPermissionsAsync();
    if (current.canAskAgain) await Location.requestForegroundPermissionsAsync();
    else await Linking.openSettings();
  } catch {
    await Linking.openSettings();
  }
}

function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const int = parseInt(value, 16);
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // `.padding(24)` with `VStack(alignment: .leading, spacing: 22)`.
  scroll: { padding: 24, gap: 22 },
  heading: { gap: 6 },
  title: { fontSize: 34, lineHeight: 41, fontWeight: '700' },
  subheadline: { fontSize: 15, lineHeight: 20 },
  current: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  // `.font(.system(size: 52, weight: .light))`
  currentTemperature: { fontSize: 52, lineHeight: 60, fontWeight: '300' },
  days: { borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  day: { gap: 8, padding: 16 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dayTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 16 },
  temperatures: { alignItems: 'flex-end', gap: 4 },
  high: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  low: { fontSize: 15, lineHeight: 20 },
  rainRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },
  grow: { flex: 1 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  unavailable: { gap: 12 },
  retry: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 11, paddingHorizontal: 16, alignSelf: 'flex-start' },
  retryLabel: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  footnote: { fontSize: 13, lineHeight: 18 },
});

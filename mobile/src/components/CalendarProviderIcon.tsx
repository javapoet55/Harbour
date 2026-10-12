import { Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';

import { CONNECT_ART } from '../features/calendar/connectArt';
import { deviceCalendarCopy, devicePlatform } from '../features/calendar/deviceCalendarCopy';
import { WELLNESS_NAVIGATION } from '../features/wellness/art';
import { useTheme } from '../theme';
import { TaskSymbol } from './TaskSymbol';

/**
 * `CalendarEventProviderIcon(source:)` (ios/App/CalendarConnectionView.swift:289-319, 08be688): the
 * provider's artwork in a 32 x 36 frame, labelled for accessibility by the provider's calendar name.
 *
 * Google and Microsoft are cells of the bundled `calendar-connect-pack`, which Swift draws with
 * `.blendMode(.multiply)` so their white vanishes into the card. React Native has no blend mode, so it
 * uses the Calendar run's transparent crops of those cells (`CONNECT_ART`, the hub's own icons). Run D's
 * separate crops had opaque black corners and drew as a black square on the phone (parity pass 4).
 *
 * Device events (`apple`, `apple-device`, `icloud`): Apple's logo and "Apple Calendar" on iOS; on
 * Android a phone glyph and "Phone calendar" (android-polish.md §33, the §37 Calendar run).
 */
const ARTWORK: Record<'google' | 'microsoft', ImageSourcePropType> = { google: CONNECT_ART.google, microsoft: CONNECT_ART.microsoft };

export function calendarProviderLabel(source: string | null | undefined): string {
  switch (source?.toLowerCase() ?? '') {
    case 'apple':
    case 'apple-device':
    case 'icloud':
      return deviceCalendarCopy().providerTitle;
    case 'microsoft':
    case 'outlook':
      return 'Outlook Calendar';
    case 'google':
      return 'Google Calendar';
    case 'harbor':
      return 'NexDo Calendar';
    default:
      return 'Calendar';
  }
}

export function CalendarProviderIcon({ source, testID }: { source: string | null | undefined; testID?: string }) {
  const theme = useTheme();
  const normalized = source?.toLowerCase() ?? '';
  let content;
  if (normalized === 'apple' || normalized === 'apple-device' || normalized === 'icloud') {
    // `.font(.title2)` in `.primary`; the phone's own glyph on Android (§33).
    content = <TaskSymbol color={theme.colors.label} name={devicePlatform() === 'ios' ? 'apple.logo' : 'iphone'} size={22} />;
  } else if (normalized === 'microsoft' || normalized === 'outlook') {
    content = <Image resizeMode="contain" source={ARTWORK.microsoft} style={styles.image} />;
  } else if (normalized === 'google') {
    content = <Image resizeMode="contain" source={ARTWORK.google} style={styles.image} />;
  } else if (normalized === 'harbor') {
    content = <Image resizeMode="contain" source={WELLNESS_NAVIGATION} style={styles.image} />;
  } else {
    // `.font(.title3)` in `nexdoIndigo`: `link`, which is that indigo except on Android in dark (§6).
    content = <TaskSymbol color={theme.colors.link} name="calendar" size={20} />;
  }
  return (
    <View accessibilityLabel={calendarProviderLabel(source)} accessible style={styles.frame} testID={testID}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: 32, height: 36, alignItems: 'center', justifyContent: 'center' },
  image: { width: 32, height: 36 },
});

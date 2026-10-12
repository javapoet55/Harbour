import { Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';

import { WELLNESS_NAVIGATION } from '../features/wellness/art';
import { useTheme } from '../theme';
import { TaskSymbol } from './TaskSymbol';

/**
 * `CalendarEventProviderIcon(source:)` (ios/App/CalendarConnectionView.swift:289-319, 08be688): the
 * provider's artwork in a 32 x 36 frame, labelled for accessibility by the provider's calendar name.
 *
 * Google and Microsoft are cells of the bundled `calendar-connect-pack`, which Swift draws with
 * `.blendMode(.multiply)` so their white vanishes into the card. React Native has no blend mode, so
 * the two cells were cut out with the white unmixed into transparency (assets/calendar/), which
 * gives the same pixels over white and keeps the artwork from sitting in a white square in dark.
 */
const ARTWORK: Record<'google' | 'microsoft', ImageSourcePropType> = {
  google: require('../../assets/calendar/google.png'),
  microsoft: require('../../assets/calendar/microsoft.png'),
};

export function calendarProviderLabel(source: string | null | undefined): string {
  switch (source?.toLowerCase() ?? '') {
    case 'apple':
    case 'apple-device':
    case 'icloud':
      return 'Apple Calendar';
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
    // `.font(.title2)` in `.primary`.
    content = <TaskSymbol color={theme.colors.label} name="apple.logo" size={22} />;
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

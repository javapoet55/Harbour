import { Image, StyleSheet, View } from 'react-native';

import { TaskSymbol } from '../../components/TaskSymbol';
import { WELLNESS_NAVIGATION } from '../wellness/art';
import { brand, useTheme } from '../../theme';
import { CONNECT_ART } from './connectArt';
import { deviceCalendarCopy, devicePlatform } from './deviceCalendarCopy';

/**
 * `CalendarEventProviderIcon` (ios/App/CalendarConnectionView.swift:289-320): the glyph beside an event
 * row and a Settings connection row, chosen from the RECORDED `source` — never guessed from the title.
 * 32 × 36 in Swift; `size` scales the frame for the Settings rows.
 *
 * Device events: `apple.logo` on iOS; on Android a phone glyph, labelled "Phone calendar" (§33).
 */
export function providerIconLabel(source: string | null | undefined): string {
  switch (normalized(source)) {
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

function normalized(source: string | null | undefined): string {
  return source?.toLowerCase() ?? '';
}

export function CalendarEventProviderIcon({ source, size = 32, testID }: { source: string | null | undefined; size?: number; testID?: string }) {
  const theme = useTheme();
  const kind = normalized(source);
  const frame = { width: size, height: Math.round((size * 36) / 32) };
  let glyph: React.ReactNode;
  switch (kind) {
    case 'apple':
    case 'apple-device':
    case 'icloud':
      glyph = <TaskSymbol color={theme.colors.label} name={devicePlatform() === 'ios' ? 'apple.logo' : 'iphone'} size={Math.round(size * 0.7)} />;
      break;
    case 'microsoft':
    case 'outlook':
      glyph = <Image resizeMode="contain" source={CONNECT_ART.microsoft} style={styles.art} />;
      break;
    case 'google':
      glyph = <Image resizeMode="contain" source={CONNECT_ART.google} style={styles.art} />;
      break;
    case 'harbor':
      glyph = <Image resizeMode="contain" source={WELLNESS_NAVIGATION} style={styles.art} />;
      break;
    default:
      glyph = <TaskSymbol color={brand.nexdoIndigo} name="calendar" size={Math.round(size * 0.65)} />;
  }
  return (
    <View accessibilityLabel={providerIconLabel(source)} accessible style={[styles.frame, frame]} testID={testID}>
      {glyph}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: 'center', justifyContent: 'center' },
  art: { width: '100%', height: '100%' },
});

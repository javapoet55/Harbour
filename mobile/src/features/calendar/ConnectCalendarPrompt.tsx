import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { calendarAccent, withAlpha } from '../../components/CalendarParts';
import { Text } from '../../components/Text';
import { calendarConnectGradient, textStyles, useTheme } from '../../theme';
import { deviceCalendarCopy } from './deviceCalendarCopy';

/**
 * `calendarConnectionPrompt` (ios/App/CalendarView.swift:279-324, fbce45b / 9acb39a): the Calendar tab's
 * offer to connect a calendar. **No capture exists** (the capture account has Google connected), so this is
 * built from the Swift source alone. When it shows is `useCalendarConnectOffer` (connectOffer.ts).
 *
 * A `[.medium, .large]` sheet with a drag indicator. On Android it is a bottom sheet over a dimmed tab that
 * closes on a tap outside or Back, standing in for the swipe; on iOS a page sheet.
 */

export function ConnectCalendarPrompt({ visible, onConnect, onClose }: { visible: boolean; onConnect: () => void; onClose: () => void }) {
  const theme = useTheme({ elevated: true });
  const insets = useSafeAreaInsets();
  const android = Platform.OS === 'android';
  const accent = calendarAccent(theme);
  const copy = deviceCalendarCopy();

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle={android ? undefined : 'pageSheet'}
      statusBarTranslucent
      transparent={android}
      visible={visible}
    >
      {android ? <Pressable accessibilityElementsHidden importantForAccessibility="no" onPress={onClose} style={[StyleSheet.absoluteFill, styles.dim]} testID="calendar-connect-prompt-scrim" /> : null}
      <View style={[styles.sheet, { backgroundColor: theme.colors.background }, android && styles.androidSheet]} testID="calendar-connect-prompt">
        {/* `.presentationDragIndicator(.visible)` */}
        <View style={[styles.grabber, { backgroundColor: theme.colors.separator }]} />
        <ScrollView bounces={false} contentContainerStyle={styles.content} style={android ? styles.androidScroll : styles.fill}>
          {/* `calendar.badge.plus`, 42 pt in the accent, in a 12% circle. */}
          <View style={[styles.badge, { backgroundColor: withAlpha(accent, 0.12) }]}>
            <Ionicons accessibilityElementsHidden color={accent} importantForAccessibility="no" name="calendar-outline" size={42} />
            <View style={[styles.plus, { backgroundColor: theme.colors.background }]}>
              <Ionicons color={accent} name="add-circle" size={20} />
            </View>
          </View>
          <Text accessibilityRole="header" style={[styles.title, { color: theme.colors.ink }]}>
            Connect your calendar
          </Text>
          <Text style={[textStyles.body, styles.centered, { color: theme.colors.secondary }]}>{copy.connectOfferBody}</Text>
          <Text style={[textStyles.footnote, styles.centered, { color: theme.colors.secondary }]}>{copy.connectOfferFootnote}</Text>
        </ScrollView>

        {/* `.safeAreaInset(edge: .bottom)`: the two buttons, `.padding(.horizontal, 24).padding(.bottom, 12)`. */}
        <View style={[styles.buttons, { backgroundColor: theme.colors.background, paddingBottom: 12 + (android ? insets.bottom : 0) }]}>
          <Pressable accessibilityLabel="Yes, connect calendar" accessibilityRole="button" onPress={onConnect} testID="calendar-connect-prompt-yes">
            <LinearGradient colors={calendarConnectGradient} end={{ x: 1, y: 0.5 }} start={{ x: 0, y: 0.5 }} style={styles.yes}>
              <Text style={[styles.headline, { color: theme.colors.onTint }]}>Yes, connect calendar</Text>
            </LinearGradient>
          </Pressable>
          <Pressable accessibilityLabel="Not now" accessibilityRole="button" onPress={onClose} style={styles.notNow} testID="calendar-connect-prompt-dismiss">
            <Text style={[textStyles.body, { color: theme.colors.link }]}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  dim: { backgroundColor: 'rgba(0, 0, 0, 0.35)' },
  sheet: { flex: 1 },
  // Android: content-height at the bottom, like the `.medium` detent the sheet opens at.
  androidSheet: { flex: 0, marginTop: 'auto', maxHeight: '90%', borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' },
  androidScroll: { flexGrow: 0 },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginTop: 8 },
  // `VStack(spacing: 18)`, centred, `.padding(24)`.
  content: { alignItems: 'center', gap: 18, padding: 24 },
  // `.padding(18).background(…, in: Circle())` around a 42 pt symbol.
  badge: { width: 78, height: 78, borderRadius: 39, alignItems: 'center', justifyContent: 'center' },
  plus: { position: 'absolute', right: 12, bottom: 12, borderRadius: 10 },
  // `.font(.title2.bold())`
  title: { ...textStyles.title2, fontWeight: '700', textAlign: 'center' },
  centered: { textAlign: 'center' },
  buttons: { gap: 8, paddingHorizontal: 24 },
  // `.padding(.horizontal, 16).padding(.vertical, 14).frame(maxWidth: .infinity, minHeight: 50)` in a capsule.
  yes: { minHeight: 50, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  notNow: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});

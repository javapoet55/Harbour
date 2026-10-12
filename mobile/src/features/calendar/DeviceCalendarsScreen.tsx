import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InlineNavBar } from '../../components/InlineNavBar';
import { SettingsCaption, SettingsToggle } from '../../components/SettingsControls';
import { TaskSymbol } from '../../components/TaskSymbol';
import { Text } from '../../components/Text';
import { permissionDecision } from '../../lib/permissionAccess';
import { useSession } from '../../store/session';
import { androidGroup, useTheme } from '../../theme';
import { deviceCalendarCopy } from './deviceCalendarCopy';
import { deviceCalendarAccess, listDeviceCalendars, requestDeviceCalendarAccess, type DeviceCalendarChoice } from './deviceCalendars';
import { calendarShown, deviceCalendarSelection } from './deviceCalendarSelection';

/**
 * `AppleCalendarSelectionView` (ios/App/AppleCalendarService.swift:68-121): which of the phone's calendars
 * this account shows. Pushed from the phone-calendar provider page, from Settings' phone-calendar card and
 * from the Calendar filters menu. Reloads on focus, on return to the foreground and after a request.
 *
 * On Android it is "Phone calendars" (android-polish.md §33); the strings are `deviceCalendarCopy`.
 */
export function DeviceCalendarsScreen({ onBack, onImportMoments }: { onBack: () => void; onImportMoments: () => void }) {
  const theme = useTheme();
  const copy = deviceCalendarCopy();
  const owner = useSession((state) => state.profile?.id ?? null);
  const selection = deviceCalendarSelection((state) => state.selection);
  const [calendars, setCalendars] = useState<DeviceCalendarChoice[]>([]);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  /** `load(requestPermission:)` (:103-120). */
  const load = useCallback(
    async (requestPermission = false) => {
      setLoading(true);
      setFailure(null);
      try {
        if (requestPermission) await requestDeviceCalendarAccess();
        const choices = await listDeviceCalendars();
        const access = permissionDecision('calendar', await deviceCalendarAccess()) === 'allow';
        setAllowed(access);
        setCalendars(choices);
        if (requestPermission && !access) setFailure(copy.accessNeeded);
      } catch {
        setFailure(copy.accessUnavailable);
      } finally {
        setLoading(false);
      }
    },
    [copy.accessNeeded, copy.accessUnavailable],
  );

  useEffect(() => {
    void deviceCalendarSelection.getState().load(owner);
  }, [owner]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load();
    });
    return () => subscription.remove();
  }, [load]);

  const toggle = (id: string, enabled: boolean) => {
    if (!owner) return;
    const current = new Set(selection ?? calendars.map((calendar) => calendar.id));
    if (enabled) current.add(id);
    else current.delete(id);
    void deviceCalendarSelection.getState().save(owner, current);
  };

  const selectedCount = calendars.filter((calendar) => calendarShown(selection, calendar.id)).length;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.fill, { backgroundColor: theme.colors.groupedBackground }]} testID="device-calendars">
      <InlineNavBar onBack={onBack} title={copy.selectionTitle} testID="device-calendars-bar" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.group, { backgroundColor: theme.colors.surface }, androidGroup(theme)]}>
          <Text style={[theme.typography.body, styles.row, { color: theme.colors.label }]}>{copy.selectionIntro}</Text>
          {!allowed ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: loading }}
                disabled={loading}
                onPress={() => void load(true)}
                style={styles.row}
                testID="device-calendars-allow"
              >
                <Text style={[theme.typography.body, { color: theme.colors.link, opacity: loading ? 0.45 : 1 }]}>{copy.allowAccess}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => void Linking.openSettings()} style={styles.row} testID="device-calendars-settings">
                <Text style={[theme.typography.body, { color: theme.colors.link }]}>{copy.openSettings}</Text>
              </Pressable>
            </>
          ) : null}
          {loading ? (
            <View style={[styles.row, styles.loading]} testID="device-calendars-loading">
              <ActivityIndicator />
              <Text style={[theme.typography.body, { color: theme.colors.secondary }]}>{copy.loading}</Text>
            </View>
          ) : null}
          {failure ? (
            <Text style={[theme.typography.body, styles.row, { color: theme.colors.danger }]} testID="device-calendars-failure">
              {failure}
            </Text>
          ) : null}
        </View>

        {allowed ? (
          <>
            <Text style={[styles.sectionTitle, { color: theme.colors.secondary }]}>{copy.calendarsToShow}</Text>
            <View style={[styles.group, { backgroundColor: theme.colors.surface }, androidGroup(theme)]} testID="device-calendars-list">
              {calendars.map((calendar) => (
                <View key={calendar.id} style={styles.calendarRow} testID={`device-calendar-${calendar.id}`}>
                  <SettingsToggle
                    label={calendar.title}
                    onValueChange={(enabled) => toggle(calendar.id, enabled)}
                    testID={`device-calendar-toggle-${calendar.id}`}
                    value={calendarShown(selection, calendar.id)}
                  />
                  {calendar.account ? <SettingsCaption testID={`device-calendar-account-${calendar.id}`}>{calendar.account}</SettingsCaption> : null}
                </View>
              ))}
              {calendars.length === 0 ? (
                <Text style={[theme.typography.body, styles.row, { color: theme.colors.label }]} testID="device-calendars-empty">
                  {copy.noCalendars}
                </Text>
              ) : selectedCount === 0 ? (
                <Text style={[theme.typography.body, styles.row, { color: theme.colors.secondary }]} testID="device-calendars-all-hidden">
                  {copy.allHidden}
                </Text>
              ) : null}
            </View>
            <View style={[styles.group, { backgroundColor: theme.colors.surface }, androidGroup(theme)]}>
              <Pressable accessibilityRole="button" onPress={onImportMoments} style={[styles.row, styles.linkRow]} testID="device-calendars-import">
                <Text style={[theme.typography.body, styles.grow, { color: theme.colors.label }]}>{copy.importMoments}</Text>
                <TaskSymbol color={theme.colors.secondary} name="chevron.right" size={13} />
              </Pressable>
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1 },
  content: { padding: 16, gap: 16 },
  // A grouped `List` section: the inset card with its rows.
  group: { borderRadius: 12, overflow: 'hidden' },
  row: { paddingHorizontal: 16, paddingVertical: 12, minHeight: 44, justifyContent: 'center' },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  calendarRow: { paddingHorizontal: 16, paddingVertical: 6 },
  // A section header: `.font(.footnote)` upper-cased grey, as a grouped `List` draws it.
  sectionTitle: { fontSize: 13, lineHeight: 18, paddingHorizontal: 16, textTransform: 'uppercase' },
});

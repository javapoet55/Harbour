import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { CalendarEvent } from '../../api/types';
import { withAlpha } from '../../components/SignInBackdrop';
import { TaskSymbol, type TaskSymbolName } from '../../components/TaskSymbol';
import { Text } from '../../components/Text';
import { TodayBackdrop } from '../../components/TodayShell';
import { useAddEventTask, useCalendarEvent, useDeleteCalendarEvent, useSetEventCompletion } from '../../query/useCalendarEvent';
import { useTheme } from '../../theme';
import { PopoverMenu, usePopoverMenu } from '../moments/form';
import { systemColors } from '../moments/components';
import { eventCalendarName, eventDateText, eventEditable, eventStatus, openInCalendarURL, warningsMessage } from './eventDetails';

/**
 * `CalendarEventDetailsView` (ios/App/CalendarEventDetailsView.swift), the Appointment details sheet
 * opened from a Calendar event row (CalendarView.swift:177-181). The event the row held shows at once and
 * is replaced by the server's copy (`.task`, :99-105). Mark Complete / Mark Incomplete work on every
 * event; Edit and Delete only on Nexdo's own (`editable`). Every change reloads the agenda (`onChange`).
 *
 * DARK MODE: Swift's cards are fixed white (`.white.opacity(0.94)`) under adaptive ink — white on white
 * (§22 "For the team"). Light mode is Swift's; dark mode uses the theme surface.
 */
export function EventDetailsScreen({ id, fallbackTimeZone }: { id: string; fallbackTimeZone: string }) {
  const theme = useTheme();
  const query = useCalendarEvent(id);
  const completion = useSetEventCompletion();
  const addTask = useAddEventTask();
  const remove = useDeleteCalendarEvent();
  const [taskAdded, setTaskAdded] = useState(false);
  const anchor = useRef<View>(null);
  const menu = usePopoverMenu(anchor);
  const event: CalendarEvent | undefined = query.data?.event;
  const busy = completion.isPending || addTask.isPending || remove.isPending;
  const dark = theme.scheme === 'dark';
  const card = dark ? theme.colors.surface : 'rgba(255, 255, 255, 0.94)';
  const blue = dark ? '#0A84FF' : systemColors.blue;
  const green = dark ? '#30D158' : systemColors.green;
  const red = dark ? '#FF453A' : systemColors.red;
  const indigo = dark ? '#5E5CE6' : '#5856D6';

  // `.task { … catch { message = error.localizedDescription } }` (:103-104).
  const loadError = query.error;
  useEffect(() => {
    if (loadError) show(loadError.message);
  }, [loadError]);

  if (!event) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.fill} testID="event-details">
        <TodayBackdrop subtle />
        <ActivityIndicator style={styles.loading} />
      </SafeAreaView>
    );
  }

  const editable = eventEditable(event);
  const calendarName = eventCalendarName(event);
  const zone = event.timeZone ?? fallbackTimeZone;
  const completed = event.completedAt != null;
  const edit = () => router.push({ pathname: '/calendar/event/edit', params: { id: event.id } });

  /** `setCompletion(_:)` (:137-141). */
  const setCompletion = (value: boolean) =>
    completion.mutate(
      { id: event.id, completed: value },
      {
        onSuccess: (response) => {
          const warnings = warningsMessage(response.warnings);
          if (warnings) show(warnings);
        },
        onError: (error) => show(error.message),
      },
    );

  /** `addTask()` (:142-148). */
  const add = () =>
    addTask.mutate(event.id, {
      onSuccess: () => {
        setTaskAdded(true);
        show('Added to your tasks.');
      },
      onError: (error) => show(error.message),
    });

  /** `deleteEvent()` (:149-158): warnings are shown before closing; otherwise it just closes. */
  const deleteEvent = () =>
    remove.mutate(event.id, {
      onSuccess: (response) => {
        const warnings = warningsMessage(response.warnings);
        if (warnings) show(warnings, () => router.back());
        else router.back();
      },
      onError: (error) => show(error.message),
    });

  /** `.confirmationDialog("Delete this event?", titleVisibility: .visible)` (:94-96). */
  const confirmDelete = () =>
    Alert.alert('Delete this event?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete Event', style: 'destructive', onPress: deleteEvent },
    ]);

  const openCalendar = () => {
    const url = openInCalendarURL(event.startAt, Platform.OS === 'ios' ? 'ios' : 'android');
    if (url) void Linking.openURL(url).catch(() => undefined);
  };

  const action = (title: string, icon: TaskSymbolName, color: string, onPress: () => void, testID: string) => {
    const disabled = busy || title === 'Added to Tasks';
    return (
      <Pressable
        accessibilityLabel={title}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        style={[styles.action, { backgroundColor: withAlpha(color, 0.08), opacity: disabled ? 0.45 : 1 }]}
        testID={testID}
      >
        <TaskSymbol color={color} name={icon} size={22} />
        <Text style={[styles.captionBold, styles.centered, { color }]}>{title}</Text>
      </Pressable>
    );
  };

  const detail = (label: string, value: string, icon: TaskSymbolName, testID: string) => (
    <View key={label}>
      <View style={[styles.divider, { backgroundColor: theme.colors.separator }]} />
      <View style={styles.detailRow} testID={testID}>
        <View style={styles.detailIcon}>
          <TaskSymbol color={theme.colors.secondary} name={icon} size={15} />
        </View>
        <Text style={[styles.subheadline, styles.detailLabel, { color: theme.colors.secondary }]}>{label}</Text>
        <Text style={[styles.subheadline, styles.grow, { color: theme.colors.ink }]}>{value}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.fill} testID="event-details">
      <TodayBackdrop subtle />
      {/* `.navigationTitle("Event Details")`, inline, a back chevron, then Edit and the "…" menu (:80-92). */}
      <View style={styles.bar}>
        <Pressable accessibilityLabel="Back" accessibilityRole="button" hitSlop={8} onPress={() => router.back()} style={styles.barButton} testID="event-details-back">
          <TaskSymbol color={theme.colors.link} name="chevron.left" size={20} />
        </Pressable>
        <Text accessibilityRole="header" numberOfLines={1} style={[styles.barTitle, { color: theme.colors.ink }]}>
          Event Details
        </Text>
        <View style={styles.barTrailing}>
          {editable ? (
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} hitSlop={8} onPress={edit} testID="event-details-edit-bar">
              <Text style={[styles.body, { color: theme.colors.link, opacity: busy ? 0.45 : 1 }]}>Edit</Text>
            </Pressable>
          ) : null}
          <View collapsable={false} ref={anchor}>
            <Pressable
              accessibilityLabel="More event actions"
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={menu.open}
              style={styles.barButton}
              testID="event-details-more"
            >
              <TaskSymbol color={theme.colors.link} name="ellipsis" size={20} />
            </Pressable>
          </View>
        </View>
      </View>
      <PopoverMenu
        items={[
          {
            key: 'complete',
            title: completed ? 'Mark Incomplete' : 'Mark Complete',
            onPress: () => setCompletion(!completed),
            testID: 'event-details-menu-complete',
          },
          ...(editable ? [{ key: 'delete', title: 'Delete Event', destructive: true, onPress: confirmDelete, testID: 'event-details-menu-delete' }] : []),
        ]}
        menu={menu}
        testID="event-details-menu"
      />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, styles.mainCard, { backgroundColor: card }]}>
          <View style={styles.heading}>
            <View style={[styles.tile, { backgroundColor: withAlpha(blue, 0.12) }]}>
              <TaskSymbol color={blue} name="calendar" size={32} />
            </View>
            <View style={[styles.grow, styles.headingText]}>
              <View style={styles.sourceRow}>
                <View style={styles.source}>
                  <TaskSymbol color={blue} name="circle.fill" size={8} />
                  <Text style={[styles.caption, { color: blue }]}>{calendarName}</Text>
                </View>
                <View style={styles.grow} />
                <View style={[styles.status, { backgroundColor: withAlpha(green, 0.08) }]}>
                  <Text style={[styles.captionBold, { color: green }]} testID="event-details-status">
                    {eventStatus(event)}
                  </Text>
                </View>
              </View>
              <Text style={[styles.title2, { color: theme.colors.ink }, completed && styles.struck]} testID="event-details-title">
                {event.title}
              </Text>
              {event.notes ? <Text style={[styles.subheadline, { color: theme.colors.secondary }]}>{event.notes}</Text> : null}
            </View>
          </View>
          <View style={styles.actions}>
            {action('Mark Complete', 'checkmark.circle.fill', green, () => setCompletion(true), 'event-details-complete')}
            {action('Mark Incomplete', 'xmark.circle.fill', red, () => setCompletion(false), 'event-details-incomplete')}
            {action(taskAdded ? 'Added to Tasks' : 'Add to Tasks', 'calendar.badge.plus', indigo, add, 'event-details-add-task')}
          </View>
          <View>
            {detail('Start', eventDateText(event.startAt, zone, event.allDay), 'clock', 'event-details-start')}
            {detail('End', eventDateText(event.endAt, zone, event.allDay), 'clock', 'event-details-end')}
            {detail('Time Zone', zone, 'mappin.and.ellipse', 'event-details-zone')}
            {detail('Calendar', calendarName, 'list.bullet', 'event-details-calendar')}
            {event.location ? detail('Location', event.location, 'location', 'event-details-location') : null}
          </View>
        </View>

        <View style={[styles.card, styles.notesCard, { backgroundColor: card }]}>
          <View style={styles.notesHeader}>
            <TaskSymbol color={theme.colors.ink} name="doc.text" size={17} />
            <Text style={[styles.headline, styles.grow, { color: theme.colors.ink }]}>Notes</Text>
            {editable ? (
              <Pressable accessibilityRole="button" hitSlop={8} onPress={edit} testID="event-details-edit-notes">
                <Text style={[styles.body, { color: theme.colors.link }]}>Edit</Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={[styles.body, styles.notes, { color: theme.colors.secondary, backgroundColor: withAlpha(indigo, 0.04) }]} testID="event-details-notes">
            {event.notes ? event.notes : 'No notes added.'}
          </Text>
        </View>

        <Pressable accessibilityLabel="Open in Calendar" accessibilityRole="button" onPress={openCalendar} style={[styles.card, styles.openRow, { backgroundColor: card }]} testID="event-details-open">
          <TaskSymbol color={theme.colors.link} name="link" size={17} />
          <Text style={[styles.body, styles.semibold, styles.grow, { color: theme.colors.link }]}>Open in Calendar</Text>
          <TaskSymbol color={theme.colors.link} name="chevron.right" size={13} />
        </Pressable>

        {editable ? (
          <Pressable
            accessibilityLabel="Delete Event"
            accessibilityRole="button"
            onPress={confirmDelete}
            style={[styles.delete, { backgroundColor: withAlpha(red, 0.08) }]}
            testID="event-details-delete"
          >
            <TaskSymbol color={red} name="trash" size={17} />
            <Text style={[styles.body, styles.semibold, { color: red }]}>Delete Event</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      {busy ? (
        <View pointerEvents="none" style={styles.overlay}>
          <View style={[styles.busy, { backgroundColor: dark ? 'rgba(44, 44, 46, 0.94)' : 'rgba(242, 242, 247, 0.94)' }]} testID="event-details-busy">
            <ActivityIndicator />
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

/** `.alert("Event Details", …)` (:97); OK after a delete also closes (`if deleted { dismiss() }`). */
function show(message: string, then?: () => void) {
  Alert.alert('Event Details', message, [{ text: 'OK', onPress: then }], { cancelable: false });
}

const shadow = { shadowColor: '#5856D6', shadowOpacity: 0.035, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 1 } as const;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1 },
  loading: { marginTop: 40 },
  centered: { textAlign: 'center' },
  semibold: { fontWeight: '600' },
  struck: { textDecorationLine: 'line-through' },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 22 },
  subheadline: { fontSize: 15, lineHeight: 20 },
  caption: { fontSize: 12, lineHeight: 16 },
  captionBold: { fontSize: 12, lineHeight: 16, fontWeight: '600' },

  bar: { flexDirection: 'row', alignItems: 'center', minHeight: 50, paddingHorizontal: 12 },
  barButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  barTitle: { flex: 1, textAlign: 'center', fontSize: 17, lineHeight: 22, fontWeight: '600' },
  barTrailing: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 44, justifyContent: 'flex-end' },

  content: { padding: 16, gap: 18 },
  card: { borderRadius: 26, ...shadow },
  mainCard: { padding: 20, gap: 22 },
  heading: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  tile: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headingText: { gap: 8 },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  source: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  status: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  actions: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  action: { flex: 1, minHeight: 80, paddingHorizontal: 4, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 10 },
  divider: { height: StyleSheet.hairlineWidth },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 16 },
  detailIcon: { width: 22, alignItems: 'center', paddingTop: 2 },
  detailLabel: { width: 76 },
  notesCard: { padding: 20, gap: 16 },
  notesHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  notes: { padding: 16, borderRadius: 16, overflow: 'hidden' },
  openRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 22 },
  delete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 20, borderRadius: 24 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  busy: { padding: 22, borderRadius: 18 },
});

import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { CalendarEventEdit } from '../../api/calendarEvent';
import type { CalendarEvent } from '../../api/types';
import { Text } from '../../components/Text';
import { parseServerDate } from '../../lib/taskQuery';
import { useCalendarEvent, useUpdateCalendarEvent } from '../../query/useCalendarEvent';
import { useTheme } from '../../theme';
import { DateField, FormField, FormRow, FormScroll, FormSection, FormText } from '../moments/form';
import { warningsMessage } from './eventDetails';

/**
 * `CalendarEventDetailsEditor` (ios/App/CalendarEventDetailsView.swift:168-211), the "Edit Event" sheet
 * over Event Details: title, location, start and end (dates only for an all-day event) and notes. Save
 * sends the text fields always and the times only when one changed (:197-202), then closes; any warnings
 * show on Event Details' "Event Details" alert (`update(_:)`, :134).
 */
export function EventEditorScreen({ id, fallbackTimeZone }: { id: string; fallbackTimeZone: string }) {
  const theme = useTheme();
  const event = useCalendarEvent(id).data?.event;
  if (!event) return <SafeAreaView style={[styles.fill, { backgroundColor: theme.colors.groupedBackground }]} />;
  return <Editor event={event} zone={event.timeZone ?? fallbackTimeZone} />;
}

/** The payload Save sends (:197-202). */
export function eventEditPayload(event: CalendarEvent, draft: { title: string; notes: string; location: string; start: number; end: number }): CalendarEventEdit {
  const payload: CalendarEventEdit = { title: draft.title.trim(), notes: draft.notes, location: draft.location };
  if (draft.start !== parseServerDate(event.startAt) || draft.end !== parseServerDate(event.endAt)) {
    // `ISO8601DateFormatter().string(from:)`: whole seconds, UTC.
    payload.startAt = new Date(draft.start).toISOString().replace(/\.\d{3}Z$/, 'Z');
    payload.endAt = new Date(draft.end).toISOString().replace(/\.\d{3}Z$/, 'Z');
  }
  return payload;
}

function Editor({ event, zone }: { event: CalendarEvent; zone: string }) {
  const theme = useTheme();
  const update = useUpdateCalendarEvent();
  const [opened] = useState(() => Date.now());
  // `.onAppear { title = event.title; … }` (:208).
  const [title, setTitle] = useState(event.title);
  const [notes, setNotes] = useState(event.notes ?? '');
  const [location, setLocation] = useState(event.location ?? '');
  const [start, setStart] = useState(() => parseServerDate(event.startAt) ?? opened);
  const [end, setEnd] = useState(() => parseServerDate(event.endAt) ?? opened);
  const [error, setError] = useState<string | null>(null);
  const saving = update.isPending;
  const allDay = event.allDay === true;

  const save = () => {
    setError(null);
    update.mutate(
      { id: event.id, edit: eventEditPayload(event, { title, notes, location, start, end }) },
      {
        onSuccess: (response) => {
          router.back();
          const warnings = warningsMessage(response.warnings);
          if (warnings) Alert.alert('Event Details', warnings, [{ text: 'OK' }]);
        },
        onError: (failure) => setError(failure.message),
      },
    );
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.fill, { backgroundColor: theme.colors.groupedBackground }]} testID="event-editor">
      {/* `.navigationTitle("Edit Event")`, inline, Cancel and Save (:190-207). */}
      <View style={styles.bar}>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: saving }} disabled={saving} hitSlop={8} onPress={() => router.back()} style={styles.side} testID="event-editor-cancel">
          <Text style={[styles.body, { color: theme.colors.link, opacity: saving ? 0.45 : 1 }]}>Cancel</Text>
        </Pressable>
        <Text accessibilityRole="header" style={[styles.title, { color: theme.colors.ink }]}>
          Edit Event
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: saving || title.trim() === '' }}
          disabled={saving || title.trim() === ''}
          hitSlop={8}
          onPress={save}
          style={[styles.side, styles.trailing]}
          testID="event-editor-save"
        >
          <Text style={[styles.body, styles.semibold, { color: theme.colors.link, opacity: saving || title.trim() === '' ? 0.45 : 1 }]}>Save</Text>
        </Pressable>
      </View>
      <FormScroll>
        <FormSection disabled={saving}>
          <FormRow>
            <FormField onChangeText={setTitle} placeholder="Title" testID="event-editor-title" value={title} />
          </FormRow>
          <FormRow last>
            <FormField onChangeText={setLocation} placeholder="Location" testID="event-editor-location" value={location} />
          </FormRow>
        </FormSection>
        <FormSection disabled={saving} header="Time">
          <FormRow>
            <DateField includeTime={!allDay} label="Start" onChange={setStart} testID="event-editor-start" value={start} zone={zone} />
          </FormRow>
          <FormRow last>
            <DateField includeTime={!allDay} label="End" onChange={setEnd} testID="event-editor-end" value={end} zone={zone} />
          </FormRow>
        </FormSection>
        <FormSection disabled={saving} header="Notes">
          <FormRow last>
            <View style={styles.notes}>
              <FormField accessibilityLabel="Notes" multiline onChangeText={setNotes} placeholder="" testID="event-editor-notes" value={notes} />
            </View>
          </FormRow>
        </FormSection>
        {error ? (
          <FormSection>
            <FormRow last>
              <FormText tone="danger" testID="event-editor-error">
                {error}
              </FormText>
            </FormRow>
          </FormSection>
        ) : null}
      </FormScroll>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  semibold: { fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 22 },
  bar: { flexDirection: 'row', alignItems: 'center', minHeight: 50, paddingHorizontal: 16 },
  side: { minWidth: 64, minHeight: 44, justifyContent: 'center' },
  trailing: { alignItems: 'flex-end' },
  title: { flex: 1, textAlign: 'center', fontSize: 17, lineHeight: 22, fontWeight: '600' },
  // `TextEditor(text:).frame(minHeight: 140)`.
  notes: { flex: 1, minHeight: 140 },
});

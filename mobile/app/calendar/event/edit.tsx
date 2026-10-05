import { useLocalSearchParams } from 'expo-router';

import { EventEditorScreen } from '../../../src/features/calendar/EventEditorScreen';

/** `.sheet(isPresented: $editing) { CalendarEventDetailsEditor(event:) }` (CalendarEventDetailsView.swift:98). */
export default function CalendarEventEdit() {
  const { id, zone } = useLocalSearchParams<{ id: string; zone?: string }>();
  return <EventEditorScreen fallbackTimeZone={zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone} id={id} />;
}

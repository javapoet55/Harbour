import { useLocalSearchParams } from 'expo-router';

import { EventDetailsScreen } from '../../../src/features/calendar/EventDetailsScreen';

/**
 * `.sheet(item: $eventDetail) { CalendarEventDetailsView(event:fallbackTimeZone:) }`
 * (ios/App/CalendarView.swift:177-181). `zone` is the Calendar's zone, for an event without its own.
 */
export default function CalendarEventDetails() {
  const { id, zone } = useLocalSearchParams<{ id: string; zone?: string }>();
  return <EventDetailsScreen fallbackTimeZone={zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone} id={id} />;
}

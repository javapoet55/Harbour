import { router } from 'expo-router';

import { CalendarConnectHub } from '../../../src/features/calendar/CalendarConnectHub';
import { ElevatedSurface } from '../../../src/theme';

/**
 * `CalendarConnectionView` (ios/App/CalendarConnectionView.swift:5): the Connect Your Calendar hub,
 * pushed from Settings' Calendars & Privacy card (ProfileView.swift:349-360). Each card pushes its
 * provider page.
 */
export default function CalendarConnect() {
  return (
    <ElevatedSurface>
      <CalendarConnectHub onBack={() => router.back()} onProvider={(provider) => router.push(`/account/calendar-connect/${provider}`)} />
    </ElevatedSurface>
  );
}

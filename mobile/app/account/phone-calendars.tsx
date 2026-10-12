import { router } from 'expo-router';

import { DeviceCalendarsScreen } from '../../src/features/calendar/DeviceCalendarsScreen';
import { ElevatedSurface } from '../../src/theme';

/**
 * `AppleCalendarSelectionView` (ios/App/AppleCalendarService.swift:68): pushed from the phone-calendar
 * provider page (`CalendarConnectionView.swift:176`), Settings' phone-calendar card (ProfileView.swift:464)
 * and the Calendar filters menu, where Swift presents it in a sheet with Done (CalendarView.swift:202-207).
 * "Import birthdays and anniversaries into Moments" is the existing Moments import screen.
 */
export default function PhoneCalendars() {
  return (
    <ElevatedSurface>
      <DeviceCalendarsScreen onBack={() => router.back()} onImportMoments={() => router.push('/wellness/moments/calendar-import')} />
    </ElevatedSurface>
  );
}

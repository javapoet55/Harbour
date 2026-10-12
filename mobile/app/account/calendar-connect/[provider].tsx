import { Redirect, router, useLocalSearchParams } from 'expo-router';

import { CalendarProviderScreen } from '../../../src/features/calendar/CalendarProviderScreen';
import { isCalendarConnectProvider } from '../../../src/features/calendar/calendarProviders';
import { ElevatedSurface } from '../../../src/theme';

/**
 * `CalendarProviderConnectionView` (ios/App/CalendarConnectionView.swift:86), pushed from the hub with
 * `.navigationDestination(item:)`. `provider` is `google`, `apple` (the phone's calendars) or
 * `microsoft`; anything else goes back to the hub. "Need help?" pushes Help (`:172`); the phone
 * provider's Choose calendars pushes the phone-calendar list (`:177`).
 */
export default function CalendarProvider() {
  const { provider } = useLocalSearchParams<{ provider: string }>();
  if (!isCalendarConnectProvider(provider)) return <Redirect href="/account/calendar-connect" />;
  return (
    <ElevatedSurface>
      <CalendarProviderScreen
        onBack={() => router.back()}
        onChooseCalendars={() => router.push('/account/phone-calendars')}
        onHelp={() => router.push('/account/help')}
        provider={provider}
      />
    </ElevatedSurface>
  );
}

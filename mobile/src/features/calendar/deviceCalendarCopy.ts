import { Platform } from 'react-native';

/**
 * The phone-calendar wording. iOS keeps Swift's (`AppleCalendarService.swift`, `CalendarConnectionView.swift`,
 * `ProfileView.swift`); Android says "Phone calendar" and "phone" wherever Swift says "Apple Calendar" or
 * "iPhone" (android-polish.md §33, the §37 Calendar run). The event `source` value stays `apple-device`.
 */
export type DevicePlatform = 'ios' | 'android';

export function devicePlatform(): DevicePlatform {
  return Platform.OS === 'android' ? 'android' : 'ios';
}

export function deviceCalendarCopy(platform: DevicePlatform = devicePlatform()) {
  const ios = platform === 'ios';
  return {
    /** The provider's name on the hub, the provider page, the Settings card and Event Details. */
    providerTitle: ios ? 'Apple Calendar' : 'Phone calendar',
    /** The selection screen's title (`.navigationTitle("Apple Calendars")`). */
    selectionTitle: ios ? 'Apple Calendars' : 'Phone calendars',
    /** The hub card's caption. */
    hubCaption: ios ? 'Connect your iPhone calendars' : 'Connect your phone’s calendars',
    selectionIntro: ios
      ? 'Selected calendars appear in NexDo’s Schedule, Week, and Month views on this iPhone. Events stay on this device. Edit them in Apple Calendar.'
      : 'Selected calendars appear in NexDo’s Schedule, Week, and Month views on this phone. Events stay on this device. Edit them in Phone calendar.',
    allowAccess: 'Allow calendar access',
    openSettings: ios ? 'Open iPhone Settings' : 'Open Settings',
    loading: 'Loading calendars…',
    calendarsToShow: 'Calendars to show',
    noCalendars: ios
      ? 'No calendars are available on this iPhone. Add an account in iPhone Settings → Apps → Calendar → Calendar Accounts.'
      : 'No calendars are available on this phone. Add a calendar account in your phone’s Settings.',
    allHidden: 'All calendars are hidden. Turn on a calendar to show its events.',
    importMoments: 'Import birthdays and anniversaries into Moments',
    accessNeeded: ios ? 'Full Calendar access is needed to read events. Enable it in iPhone Settings.' : 'Calendar access is needed to read events. Enable it in Settings.',
    accessUnavailable: ios ? 'Calendar access is unavailable. Check NexDo’s Calendar permission in iPhone Settings.' : 'Calendar access is unavailable. Check NexDo’s Calendar permission in Settings.',
    /** The Settings card (`appleCalendarCard`, ProfileView.swift:451-477). */
    settingsConnected: ios ? 'Connected on this iPhone' : 'Connected on this phone',
    manageCalendars: ios ? 'Manage Apple calendars' : 'Manage phone calendars',
    settingsFootnote: ios
      ? 'Selected events appear in NexDo. Manage calendar access in iPhone Settings. NexDo does not add tasks or events to Apple Calendar.'
      : 'Selected events appear in NexDo. Manage calendar access in your phone’s Settings. NexDo does not add tasks or events to Phone calendar.',
    /** The Calendar filters menu entry (`Button("Apple calendars…")`, CalendarView.swift:406). */
    filtersMenu: ios ? 'Apple calendars…' : 'Phone calendars…',
    /** The Calendar tab's "Connect your calendar" sheet (CalendarView.swift:287-290, fbce45b). */
    connectOfferBody: ios
      ? 'Connect your Google, Apple or Outlook calendar to sync your tasks and calendar events.'
      : 'Connect your Google, phone or Outlook calendar to sync your tasks and calendar events.',
    connectOfferFootnote: ios
      ? 'Apple Calendar displays your selected events in NexDo. Google and Outlook sync options are available in Settings.'
      : 'Phone calendar displays your selected events in NexDo. Google and Outlook sync options are available in Settings.',
  };
}

/** `"\(count) calendar\(count == 1 ? "" : "s") selected"`, or "No calendars selected" (ProfileView.swift:459). */
export function selectedCalendarsLabel(count: number): string {
  return count === 0 ? 'No calendars selected' : `${count} calendar${count === 1 ? '' : 's'} selected`;
}

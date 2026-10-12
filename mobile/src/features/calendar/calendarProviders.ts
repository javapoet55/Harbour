import type { CalendarConnection } from '../../api/types';
import { needsReconnect } from '../../lib/calendarConnections';
import type { CalendarConnectArt } from './connectArt';
import { deviceCalendarCopy, devicePlatform, type DevicePlatform } from './deviceCalendarCopy';

/**
 * `CalendarConnectProvider` (ios/App/CalendarConnectionView.swift:75-84) and the copy of the hub and
 * provider pages (`:5-84`, `:86-227`). `apple` is the phone's own calendars (EventKit there, expo-calendar
 * here); the raw value stays `apple` so the server's `provider` strings and the §23 captures line up.
 * On Android every "Apple Calendar" / "iPhone" becomes "Phone calendar" / "phone" (android-polish.md §33).
 */
export type CalendarConnectProvider = 'google' | 'apple' | 'microsoft';

/** `CaseIterable` order: Google, Apple, Microsoft. */
export const CALENDAR_CONNECT_PROVIDERS: readonly CalendarConnectProvider[] = ['google', 'apple', 'microsoft'];

export function isCalendarConnectProvider(value: string | undefined): value is CalendarConnectProvider {
  return value === 'google' || value === 'apple' || value === 'microsoft';
}

/** `name`: the OAuth provider's name; the phone provider is "Apple" on iOS and "Phone" on Android. */
export function providerName(provider: CalendarConnectProvider, platform: DevicePlatform = devicePlatform()): string {
  switch (provider) {
    case 'google':
      return 'Google';
    case 'microsoft':
      return 'Microsoft';
    default:
      return platform === 'ios' ? 'Apple' : 'Phone';
  }
}

/** `title`: "<name> Calendar"; the phone provider follows `deviceCalendarCopy().providerTitle`. */
export function providerTitle(provider: CalendarConnectProvider, platform: DevicePlatform = devicePlatform()): string {
  return provider === 'apple' ? deviceCalendarCopy(platform).providerTitle : `${providerName(provider, platform)} Calendar`;
}

/** `accent`: `.pink` for Apple, `.blue` otherwise (system colours, light). */
export function providerAccent(provider: CalendarConnectProvider): string {
  return provider === 'apple' ? '#FF2D55' : '#007AFF';
}

export function providerArt(provider: CalendarConnectProvider): CalendarConnectArt {
  return provider;
}

/** The hub card's caption (`:28`). */
export function providerHubCaption(provider: CalendarConnectProvider, platform: DevicePlatform = devicePlatform()): string {
  return provider === 'apple' ? deviceCalendarCopy(platform).hubCaption : `Connect your ${providerName(provider, platform)} account`;
}

/** The server connections for one OAuth provider (`provider.lowercased() == item.rawValue`). */
export function providerConnections(provider: CalendarConnectProvider, connections: CalendarConnection[]): CalendarConnection[] {
  return connections.filter((connection) => connection.provider.toLowerCase() === provider);
}

/** `isConnected` (`:70-72`): the phone provider is connected when calendar access is allowed. */
export function providerConnected(provider: CalendarConnectProvider, connections: CalendarConnection[], deviceAccess: boolean): boolean {
  if (provider === 'apple') return deviceAccess;
  return providerConnections(provider, connections).some((connection) => !needsReconnect(connection));
}

/** The hub's "Needs reconnecting" badge (`:33`). */
export function providerNeedsReconnect(provider: CalendarConnectProvider, connections: CalendarConnection[]): boolean {
  if (provider === 'apple') return false;
  return providerConnections(provider, connections).some(needsReconnect);
}

export type ProviderStep = { title: string; detail: string; art: CalendarConnectArt | 'allowAccess' };

/**
 * The provider page's strings (`CalendarProviderConnectionView`, `:107-164`, `:216-266`), in Swift's
 * order. The phone provider's text is Swift's on iOS and the §33 wording on Android.
 */
export function providerPageCopy(provider: CalendarConnectProvider, platform: DevicePlatform = devicePlatform()) {
  const ios = platform === 'ios';
  const name = providerName(provider, platform);
  const title = providerTitle(provider, platform);
  const settingsApp = ios ? 'iPhone Settings' : 'Settings';
  const phone = ios ? 'iPhone' : 'phone';
  const device = provider === 'apple';
  const steps: [ProviderStep, ProviderStep, ProviderStep] = device
    ? [
        {
          title: ios ? 'Use your Apple Calendar' : 'Use your Phone calendar',
          detail: ios
            ? 'Add your iCloud account in iPhone Settings if it isn’t already there. No Apple password is entered in NexDo.'
            : 'Add your calendar account in your phone’s Settings if it isn’t already there. No account password is entered in NexDo.',
          art: 'allowAccess',
        },
        {
          title: 'Review permissions',
          detail: `Allow calendar access when ${ios ? 'iOS' : 'Android'} asks. NexDo reads your selected calendars to display their events. It does not edit those events.`,
          art: 'applePermissions',
        },
        {
          title: 'Choose calendars',
          detail: 'Choose which calendars appear in Schedule, Week, and Month. You can also import birthday and anniversary suggestions into Moments.',
          art: 'complete',
        },
      ]
    : [
        { title: `Sign in to ${name}`, detail: `Tap Connect Now and choose the ${name} account you want to use.`, art: provider === 'google' ? 'googleSignIn' : 'microsoftSignIn' },
        {
          title: 'Review permissions',
          detail: 'Your provider requests access to read and manage events. NexDo can add your scheduled tasks and events. You can turn this off in Calendars & Privacy.',
          art: 'permissions',
        },
        { title: 'You’re all set!', detail: 'We’ll synchronize your calendar so your events appear alongside your plans.', art: 'complete' },
      ];
  return {
    title: `Connect ${title}`,
    subtitle: device
      ? `Show events from calendars already added to your ${phone} alongside your NexDo plans.`
      : `Connect your ${title} to organize your schedule and important events.`,
    steps,
    /** The step-1 badge under the phone provider's icon (`:198`). */
    allowAccess: 'Allow access',
    privacy: device ? `Calendar reading happens on this device. Change access in ${settingsApp}.` : 'You control access. Disconnect this calendar in NexDo Settings at any time.',
    connected: `${title} connected.`,
    connectedFootnote: device
      ? `Calendar access is allowed on this ${phone}. Choose which calendars appear in NexDo.`
      : 'This provider is already connected. Manage accounts in Calendars & Privacy.',
    connectAnother: 'Connect another account',
    openSettings: deviceCalendarCopy(platform).openSettings,
    connectNow: 'Connect Now',
    connecting: 'Connecting…',
    done: device ? 'Choose calendars' : 'Done',
    learnMore: 'Learn more',
    needHelp: 'Need help?',
    cancel: 'Cancel',
    /** `beginConnection()` for the phone provider (`:236-240`). */
    accessAllowed: 'Calendar access allowed. Choose calendars to display in NexDo.',
    accessNeeded: ios
      ? 'Full Calendar access is needed to display events. Enable it for NexDo in iPhone Settings.'
      : 'Calendar access is needed to display events. Enable it for NexDo in Settings.',
    accessUnavailable: ios
      ? 'Calendar access is unavailable. Allow Calendar access for NexDo in iPhone Settings, then try again.'
      : 'Calendar access is unavailable. Allow Calendar access for NexDo in Settings, then try again.',
    /** `.cancelled` from the browser (`:251`) and the toolbar Cancel (`:274`). */
    browserCancelled: 'Connection cancelled. Your existing calendars are unchanged.',
    cancelled: 'Connection cancelled.',
  };
}

/** The hub's own strings (`:17-19`, `:31-34`, `:46`, `:51-52`). */
export const HUB_COPY = {
  title: 'Connect Your Calendar',
  subtitle: 'Keep your events, reminders, and important moments together in NexDo.',
  connected: 'Connected',
  needsReconnect: 'Needs reconnecting',
  retry: 'Retry connection status',
  privacyTitle: 'Your data stays private',
  privacyDetail: 'We only access the calendar information you allow. You can disconnect anytime.',
} as const;

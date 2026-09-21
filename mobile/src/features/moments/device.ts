import * as Calendar from 'expo-calendar';
import * as Clipboard from 'expo-clipboard';
import * as Contacts from 'expo-contacts/legacy';
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import { Platform, Share } from 'react-native';

import type { MomentInput } from '../../api/moments';
import { composeMessageOutcome, canSendMessage, type MessageComposeOutcome } from '../../actions/composers';
import { TaskActionError } from '../../actions/errors';
import { ownerKeyFor } from '../../actions/persistence';
import { deviceZone, momentDay } from './dates';
import { newMomentInput } from './domain';

/**
 * Everything the Moments screens do on the PHONE rather than the server: the Messages composer, the
 * share sheet, the pasteboard, the greeting-card artwork on disk, the contact picker, the device
 * calendar and the Gmail consent session.
 */

// ---------------------------------------------------------------------------------------------
// Delivery (ImportantMomentsView.swift:417-434, :546-549)

export { canSendMessage };

/**
 * `ActionMessageComposer` → `planAction("sent" | "opened" | "failed" | "cancel")`.
 *
 * Swift's `MFMessageComposeViewController` reports `.sent` only when the person tapped Send, so iOS
 * records `sent` or `failed`. Android's SMS intent has no such callback — `expo-sms` resolves
 * `unknown` whatever happened — so the outcome is reported as `opened`, which keeps the plan
 * AWAITING_CONFIRMATION and shows the same "delivery not confirmed" state Copy and Share show.
 * `sent` is recorded only for a verified send; `failed` only for a real composer error.
 */
export async function openMessages(recipient: string, body: string): Promise<MessageComposeOutcome> {
  return composeMessageOutcome({ recipient, body });
}

/**
 * `MomentShareSheet` (ImportantMomentsView.swift:552-561): `UIActivityViewController` with the text,
 * reporting whether an activity completed.
 *
 * PLATFORM GAP: on Android `Share.share` always resolves `sharedAction`, even when the sheet was
 * dismissed, so a dismissed share is recorded as shared.
 */
export async function shareText(text: string): Promise<boolean> {
  const result = await Share.share({ message: text });
  return result.action === Share.sharedAction;
}

/** `UIPasteboard.general.string = …`. */
export async function copyText(text: string): Promise<void> {
  await Clipboard.setStringAsync(text);
}

// ---------------------------------------------------------------------------------------------
// Greeting-card artwork (FestivalServices.swift:35-47, `ProtectedFestivalImageStorage`)

const IMAGE_DIRECTORY = 'FestivalImages';

function imageFolder(): Directory {
  return new Directory(Paths.document, IMAGE_DIRECTORY);
}

function safeName(id: string): boolean {
  return id !== '' && !id.includes('/') && !id.includes('\\') && id !== '.' && id !== '..';
}

/**
 * The server keeps only the card SETTINGS; the artwork stays on this phone, under
 * `FestivalImages/<uuid>.png`, as Swift keeps it in Application Support.
 *
 * PLATFORM GAP: Swift writes with `.completeFileProtection` and `isExcludedFromBackup`. Android has no
 * per-file backup exclusion; the app's files directory is private, and whether it is backed up is an
 * app-wide manifest setting.
 */
export const imageStorage = {
  store(base64: string): string {
    const folder = imageFolder();
    if (!folder.exists) folder.create({ intermediates: true });
    const name = `${Crypto.randomUUID().toUpperCase()}.png`;
    new File(folder, name).write(base64, { encoding: 'base64' });
    return name;
  },
  /** The file's URI for `<Image>`, or `null` when there is none. */
  load(id: string): string | null {
    if (!safeName(id)) return null;
    const file = new File(imageFolder(), id);
    return file.exists ? file.uri : null;
  },
  delete(id: string): void {
    if (!safeName(id)) return;
    try {
      const file = new File(imageFolder(), id);
      if (file.exists) file.delete();
    } catch {
      // `try? FileManager.default.removeItem`
    }
  },
};

/**
 * "Share Card". Swift renders the finished card — artwork, greeting and signature — to an image with
 * `ImageRenderer` and shares that. React Native cannot snapshot a view without a further native module,
 * so the ARTWORK is shared as its own image and the greeting stays in the app. Recorded as a gap.
 */
export async function shareImage(uri: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('The card could not be prepared for sharing.');
  let fileUri = uri;
  // Artwork not yet chosen is still in memory; the share sheet needs a file.
  if (uri.startsWith('data:')) {
    const file = new File(new Directory(Paths.cache), `card-${Crypto.randomUUID()}.jpg`);
    file.write(uri.slice(uri.indexOf(',') + 1), { encoding: 'base64' });
    fileUri = file.uri;
  }
  await Sharing.shareAsync(fileUri, { mimeType: 'image/jpeg', dialogTitle: 'Share Card' });
}

// ---------------------------------------------------------------------------------------------
// Contacts (MomentEditor.swift:247-273, FestivalServices.swift:48-66)

/**
 * The system contact picker, one person at a time. It is a picker, not a read of the address book —
 * the same privacy model as `CNContactPickerViewController`.
 *
 * PLATFORM GAP: Swift's festival pickers allow selecting several contacts in one go; Android's
 * `ACTION_PICK` returns one, so each "Add Contact" adds one person.
 */
export async function pickContact(): Promise<Contacts.ExistingContact | null> {
  // PLATFORM GAP: on Android expo-contacts reads the picked person back from the contacts provider,
  // which needs READ_CONTACTS — `ACTION_PICK` alone does not grant it — so ask first.
  if (Platform.OS === 'android') {
    const current = await Contacts.getPermissionsAsync();
    const granted = current.granted || (current.canAskAgain && (await Contacts.requestPermissionsAsync()).granted);
    if (!granted) throw new TaskActionError('contactsDenied');
  }
  return Contacts.presentContactPickerAsync();
}

function birthdayDay(contact: Contacts.ExistingContact): string {
  const birthday = contact.birthday;
  if (!birthday || birthday.month === undefined || birthday.day === undefined) return '';
  // expo-contacts months are 0-based.
  return `2000-${String(birthday.month + 1).padStart(2, '0')}-${String(birthday.day).padStart(2, '0')}`;
}

/**
 * `MomentContactPicker`'s mapping (MomentEditor.swift:258-262): given name, the first phone, the first
 * email, the birthday as `2000-MM-DD`, and the source key `contact:<ownerKey(id)>:birthday`.
 */
export async function contactMomentInput(contact: Contacts.ExistingContact, zone: string = deviceZone()): Promise<MomentInput> {
  const firstName = contact.firstName ?? '';
  const input = newMomentInput(Crypto.randomUUID().toUpperCase(), zone);
  input.firstName = firstName;
  input.title = `${firstName === '' ? 'Contact' : firstName}’s Birthday`;
  input.phone = contact.phoneNumbers?.[0]?.number ?? '';
  input.email = contact.emails?.[0]?.email ?? '';
  input.source = 'contacts';
  input.sourceKey = `contact:${await ownerKeyFor(contact.id)}:birthday`;
  input.occurrenceDate = birthdayDay(contact);
  return input;
}

/** `CNContactFormatter.string(from:style: .fullName)`. */
export function contactFullName(contact: Contacts.ExistingContact): string {
  return contact.name || [contact.firstName, contact.lastName].filter(Boolean).join(' ');
}

/** `FestivalRecipient` (MomentEditor.swift:172-176, :191-201). */
export type FestivalRecipient = { id: string; displayName: string; firstName: string; phone: string; email: string };

export async function festivalRecipient(contact: Contacts.ExistingContact): Promise<FestivalRecipient> {
  const name = contactFullName(contact) || 'Contact';
  return {
    id: await ownerKeyFor(contact.id),
    displayName: name,
    firstName: contact.firstName ? contact.firstName : name,
    phone: contact.phoneNumbers?.[0]?.number ?? '',
    email: contact.emails?.[0]?.email ?? '',
  };
}

/** `FestivalContactChoice` (FestivalServices.swift:48-50, :62-64): every phone and email. */
export type ContactChoice = { id: string; name: string; phones: string[]; emails: string[] };

export function contactChoice(contact: Contacts.ExistingContact): ContactChoice {
  return {
    id: contact.id,
    name: contactFullName(contact) || contact.firstName || '',
    phones: (contact.phoneNumbers ?? []).map((phone) => phone.number ?? '').filter((value) => value !== ''),
    emails: (contact.emails ?? []).map((email) => email.email ?? '').filter((value) => value !== ''),
  };
}

/**
 * `FestivalContactsService.validate` (FestivalServices.swift:67-79): with FULL Contacts access, check a
 * picked person still exists and still has the saved address. Without it, trust the picker.
 */
export async function validatePickedContacts(
  recipients: { selected: boolean; contactIdentifier: string; phone: string; email: string }[],
  normalize: (phone: string) => string,
): Promise<void> {
  const permission = await Contacts.getPermissionsAsync();
  if (!permission.granted) return;
  for (const recipient of recipients) {
    if (!recipient.selected || recipient.contactIdentifier === '') continue;
    const contact = await Contacts.getContactByIdAsync(recipient.contactIdentifier, [Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails]).catch(
      () => undefined,
    );
    if (!contact) throw new Error('A selected contact was deleted. Re-select or enter the recipient manually.');
    if (recipient.phone !== '' && !(contact.phoneNumbers ?? []).some((phone) => normalize(phone.number ?? '') === normalize(recipient.phone))) {
      throw new Error('A contact’s phone number changed. Review their delivery address.');
    }
    if (recipient.email !== '' && !(contact.emails ?? []).some((email) => (email.email ?? '').toLowerCase() === recipient.email.toLowerCase())) {
      throw new Error('A contact’s email changed. Review their delivery address.');
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Device calendar (MomentEditor.swift:274-310, `MomentCalendarService`)

export type CalendarChoice = { id: string; title: string };
export type CalendarCandidate = { id: string; title: string; date: number };

/** `requestFullAccessToEvents()` then every event calendar. Throws when access is refused. */
export async function deviceCalendars(): Promise<CalendarChoice[]> {
  const permission = await Calendar.requestCalendarPermissionsAsync();
  if (!permission.granted) throw new TaskActionError('contactsDenied');
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  return calendars.map((calendar) => ({ id: calendar.id, title: calendar.title }));
}

/**
 * `candidates(calendarID:)`: recurring events in the next year from ONE calendar whose title contains
 * "birthday" or "anniversary", at most 100. Calendar data never leaves the phone except what the
 * person then saves.
 */
export async function calendarCandidates(calendarId: string, now: number = Date.now()): Promise<CalendarCandidate[]> {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setFullYear(end.getFullYear() + 1);
  const events = await Calendar.getEventsAsync([calendarId], start, end).catch(() => []);
  return events
    .filter((event) => {
      const title = (event.title ?? '').toLowerCase();
      return event.recurrenceRule != null && (title.includes('anniversary') || title.includes('birthday'));
    })
    .slice(0, 100)
    .map((event) => ({ id: event.id ?? Crypto.randomUUID(), title: event.title || 'Calendar moment', date: new Date(event.startDate).getTime() }));
}

/** `input(_:)` (MomentEditor.swift:307-309). No name, phone or email comes from the calendar. */
export async function calendarMomentInput(candidate: CalendarCandidate, zone: string = deviceZone()): Promise<MomentInput> {
  const input = newMomentInput(Crypto.randomUUID().toUpperCase(), zone);
  input.type = candidate.title.toLowerCase().includes('birthday') ? 'birthday' : 'anniversary';
  input.title = candidate.title;
  input.source = 'calendar';
  input.sourceKey = `calendar:${await ownerKeyFor(candidate.id)}`;
  input.occurrenceDate = momentDay(candidate.date, input.timeZoneID);
  return input;
}

/** `MomentFestivalView.input(_:)` (MomentEditor.swift:321). */
export function festivalMomentInput(name: string, zone: string = deviceZone()): MomentInput {
  const input = newMomentInput(Crypto.randomUUID().toUpperCase(), zone);
  input.type = 'festival';
  input.title = `${name} Wishes`;
  input.yearly = false;
  input.source = 'festivalCatalog';
  return input;
}

/**
 * The hard-coded region list (MomentEditor.swift:313), copied verbatim. Swift shows the keys sorted.
 */
export const FESTIVAL_REGIONS: Record<string, string[]> = {
  Global: ['New Year', 'International Friendship Day'],
  India: ['Diwali', 'Holi', 'Eid', 'Pongal'],
  'United States': ['Thanksgiving', 'Christmas'],
  'East Asia': ['Lunar New Year', 'Mid-Autumn Festival'],
};

// ---------------------------------------------------------------------------------------------
// Gmail (ImportantMomentsStore.swift:176-193, `MomentEmailOAuth`)

export const EMAIL_CALLBACK = 'nexdo://moments-email';

/**
 * The consent URL comes from the server's `connectEmail`; the callback route redirects to
 * `nexdo://moments-email?status=connected|error`. Resolves `true` only for `connected`.
 * `prefersEphemeralWebBrowserSession = true` in Swift, and the same here.
 */
export async function connectGmail(url: string): Promise<boolean> {
  const result = await WebBrowser.openAuthSessionAsync(url, EMAIL_CALLBACK, { preferEphemeralSession: true });
  if (result.type !== 'success') return false;
  return emailCallbackConnected(result.url);
}

export function emailCallbackConnected(url: string): boolean {
  const match = /^nexdo:\/\/([^/?#]*)\??([^#]*)/.exec(url);
  if (!match || match[1] !== 'moments-email') return false;
  const status = match[2]
    .split('&')
    .map((pair) => pair.split('='))
    .find(([key]) => key === 'status')?.[1];
  return status === 'connected';
}

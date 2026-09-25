import * as Contacts from 'expo-contacts/legacy';

import { TaskActionError } from './errors';

/**
 * `AppleTaskActionContacts` (ios/App/TaskActionContacts.swift:17-47) and the `ActionContact` shape
 * it returns (`:4-14`).
 */

export type ActionAddress = {
  id: string;
  /** The contact's own label ("home", "work"), or Swift's fallback. */
  label: string;
  value: string;
};

export type ActionContact = {
  id: string;
  name: string;
  phones: ActionAddress[];
  emails: ActionAddress[];
};

/**
 * `CNContactStore.authorizationStatus` plus `requestAccess` (TaskActionContacts.swift:19-26).
 *
 * The prompt appears at the SAME MOMENT Swift's does: the first time a channel is chosen on the
 * action screen, not at launch and not when the queue is built. An already-denied app is not
 * re-prompted — it throws the "Allow Nexdo to access Contacts" message instead.
 *
 * Swift also accepts iOS 18's `.limited` status. `expo-contacts` reports limited access as granted,
 * which is the same outcome: whatever was shared is searchable, and an unshared person simply is not
 * found, which is why the `noContact` copy mentions "which contacts you've shared with Nexdo".
 */
async function ensureContactsPermission(): Promise<void> {
  const current = await Contacts.getPermissionsAsync();
  if (current.granted) return;
  if (current.canAskAgain) {
    const asked = await Contacts.requestPermissionsAsync();
    if (asked.granted) return;
  }
  throw new TaskActionError('contactsDenied');
}

const FIELDS = [Contacts.Fields.ID, Contacts.Fields.Name, Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails];

/**
 * `resolve(name:identifier:)` (TaskActionContacts.swift:18-46).
 *
 * A remembered `identifier` wins: the person already chosen is looked up directly, so a second
 * reminder for the same task never asks again. Otherwise every contact matching the NAME is
 * returned, and the screen asks which one when there is more than one.
 */
export async function resolveContacts({
  name,
  identifier,
  fallbackName,
}: {
  name: string;
  identifier?: string | null;
  fallbackName?: string;
}): Promise<ActionContact[]> {
  await ensureContactsPermission();

  // `ExistingContact` is the plain record the legacy read API returns; `Contact` is the new mutable
  // class, which nothing here needs.
  let found: Contacts.ExistingContact[] = [];
  if (identifier) {
    // `try? store.unifiedContact(withIdentifier:)` — a stale identifier falls through to the search.
    const saved = await Contacts.getContactByIdAsync(identifier, FIELDS).catch(() => undefined);
    if (saved) found = [saved];
  }
  if (found.length === 0) {
    const page = await Contacts.getContactsAsync({ name, fields: FIELDS });
    found = page.data;
  }

  // `guard !contacts.isEmpty else { throw TaskActionServiceError.noContact }`
  if (found.length === 0) throw new TaskActionError('noContact');

  return found.map((contact) => toActionContact(contact, fallbackName ?? name));
}

/** The mapping at TaskActionContacts.swift:38-45. */
export function toActionContact(contact: Contacts.ExistingContact, fallbackName: string): ActionContact {
  return {
    id: contact.id ?? fallbackName,
    // `CNContactFormatter.string(from:style:.fullName) ?? name`
    name: contact.name && contact.name.trim().length > 0 ? contact.name : fallbackName,
    phones: (contact.phoneNumbers ?? [])
      .map((entry, index) => ({
        id: entry.id ?? `phone-${index}`,
        label: entry.label && entry.label.length > 0 ? entry.label : 'Phone',
        value: entry.number ?? '',
      }))
      .filter((address) => address.value.length > 0),
    emails: (contact.emails ?? [])
      .map((entry, index) => ({
        id: entry.id ?? `email-${index}`,
        label: entry.label && entry.label.length > 0 ? entry.label : 'Email',
        value: entry.email ?? '',
      }))
      .filter((address) => address.value.length > 0),
  };
}

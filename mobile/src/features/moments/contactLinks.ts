import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

import { normalizedPhone } from './domain';

/**
 * `ContactAddressLinks` (ios/Sources/NexdoCore/MomentRecipients.swift, 94a2ecd): which saved addresses
 * were taken from a contact card. The contact check only reports a changed card for those, so an address
 * the person typed (or picked and then edited) never reads as "changed".
 *
 * Keys are one-way hashes — SHA-256 of contact, field and normalized address, first 16 bytes — so no
 * address or contact identifier is stored. Contact identifiers only exist on this device, so the record
 * lives on the device too: AsyncStorage, under the key iOS uses for UserDefaults. Each entry is `true`
 * when the address came from the card and `false` when it was typed.
 */
export type AddressField = 'phone' | 'email';
export type ContactLinks = Record<string, boolean>;

export const CONTACT_LINKS_KEY = 'nexdo.moments.contactAddressLinks';
export const PHONE_CHANGED = 'A contact’s phone number changed. Review their delivery address.';
export const EMAIL_CHANGED = 'A contact’s email changed. Review their delivery address.';
export const CONTACT_DELETED = 'A selected contact was deleted. Re-select or enter the recipient manually.';

export async function linkID(contact: string, field: AddressField, address: string): Promise<string> {
  const normalized = field === 'phone' ? normalizedPhone(address) : address.trim().toLowerCase();
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, [contact, field, normalized].join('\u001f'));
  return digest.slice(0, 32);
}

async function readLinks(): Promise<ContactLinks> {
  try {
    const value: unknown = JSON.parse((await AsyncStorage.getItem(CONTACT_LINKS_KEY)) ?? '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean'));
  } catch {
    return {};
  }
}

// Updates run one after another, so two saves never overwrite each other's entries.
let queue: Promise<unknown> = Promise.resolve();

/** `ContactAddressLinkStore.update`: read, change and write back the device's record. */
export function updateContactLinks<T>(change: (links: ContactLinks) => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const links = await readLinks();
    const result = await change(links);
    await AsyncStorage.setItem(CONTACT_LINKS_KEY, JSON.stringify(links));
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}

/** A recipient from the sheet, with the picked contact's numbers and addresses when they are known. */
export type LinkedDraft = { contactIdentifier: string; phone: string; email: string; phoneChoices: string[]; emailChoices: string[] };

/**
 * `record(_:previous:)`: a recipient saved from the sheet. With the contact's choices, an address is
 * linked when it is one of them. Without them (editing later), a changed address was typed; an unchanged
 * one keeps what was recorded.
 */
export async function recordRecipient(links: ContactLinks, draft: LinkedDraft, previous?: { phone: string; email: string }): Promise<void> {
  if (draft.contactIdentifier === '') return;
  const fields: [AddressField, string, string[], string | undefined][] = [
    ['phone', draft.phone, draft.phoneChoices, previous?.phone],
    ['email', draft.email, draft.emailChoices, previous?.email],
  ];
  for (const [field, address, choices, before] of fields) {
    if (address.trim() === '') continue;
    const id = await linkID(draft.contactIdentifier, field, address);
    if (choices.length > 0) {
      const ids = await Promise.all(choices.map((choice) => linkID(draft.contactIdentifier, field, choice)));
      links[id] = ids.includes(id);
    } else if (before === undefined || (await linkID(draft.contactIdentifier, field, before)) !== id) {
      links[id] = false;
    }
  }
}

/**
 * `review(_:card:)`: the warning for a recipient chosen from Contacts, given its card now (`null` when the
 * contact was deleted) — only when an address taken from the card is no longer on it. An address with no
 * record (saved before links existed) is recorded from the card as it is now, without a warning.
 */
export async function reviewRecipient(
  links: ContactLinks,
  recipient: { contactIdentifier: string; phone: string; email: string },
  card: { phones: string[]; emails: string[] } | null,
): Promise<string | null> {
  if (recipient.contactIdentifier === '') return null;
  const fields: [AddressField, string, string][] = [
    ['phone', recipient.phone, PHONE_CHANGED],
    ['email', recipient.email, EMAIL_CHANGED],
  ];
  if (!card) {
    for (const [field, address] of fields) {
      if (address !== '' && links[await linkID(recipient.contactIdentifier, field, address)] === true) return CONTACT_DELETED;
    }
    return null;
  }
  for (const [field, address, warning] of fields) {
    if (address.trim() === '') continue;
    const id = await linkID(recipient.contactIdentifier, field, address);
    const onCard = (await Promise.all((field === 'phone' ? card.phones : card.emails).map((value) => linkID(recipient.contactIdentifier, field, value)))).includes(id);
    const recorded = links[id];
    if (recorded === true && !onCard) return warning;
    if (recorded === undefined) links[id] = onCard;
  }
  return null;
}

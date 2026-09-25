import * as Calendar from 'expo-calendar';
import * as Crypto from 'expo-crypto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Contacts from 'expo-contacts/legacy';

import { CONTACT_DELETED, EMAIL_CHANGED, linkID, PHONE_CHANGED, recordRecipient, reviewRecipient, updateContactLinks, type ContactLinks } from '../contactLinks';

import { calendarCandidates, calendarMomentInput, contactChoice, contactMomentInput, FESTIVAL_REGIONS, festivalMomentInput, festivalRecipient, validatePickedContacts } from '../device';
import { uniqueKeys } from '../form';

const digest = Crypto.digestStringAsync as jest.Mock;

beforeEach(() => {
  digest.mockImplementation(async (_algorithm: string, value: string) => `sha(${value})`);
});

const contact = {
  id: 'C1',
  name: 'Kate Bell',
  firstName: 'Kate',
  lastName: 'Bell',
  contactType: 'person',
  phoneNumbers: [{ number: '(555) 564-8583' }, { number: '(415) 555-3695' }],
  emails: [{ email: 'kate-bell@mac.com' }, { email: 'www.icloud.com' }],
  birthday: { day: 20, month: 0, year: 1978 },
} as never;

describe('contact import', () => {
  it('maps the picked person the way MomentContactPicker does', async () => {
    const input = await contactMomentInput(contact, 'America/Los_Angeles');
    expect(input).toMatchObject({
      type: 'birthday',
      title: 'Kate’s Birthday',
      firstName: 'Kate',
      phone: '(555) 564-8583',
      email: 'kate-bell@mac.com',
      occurrenceDate: '2000-01-20',
      source: 'contacts',
      sourceKey: 'contact:sha(C1):birthday',
      timeZoneID: 'America/Los_Angeles',
      yearly: true,
    });
  });

  it('leaves the date empty without a birthday, so it must be confirmed', async () => {
    const input = await contactMomentInput({ ...(contact as object), birthday: undefined, firstName: '' } as never);
    expect(input.occurrenceDate).toBe('');
    expect(input.title).toBe('Contact’s Birthday');
  });

  it('keeps every address for the delivery-address sheet, and one for a festival recipient', async () => {
    expect(contactChoice(contact)).toEqual({ id: 'C1', name: 'Kate Bell', phones: ['(555) 564-8583', '(415) 555-3695'], emails: ['kate-bell@mac.com', 'www.icloud.com'] });
    expect(await festivalRecipient(contact)).toEqual({ id: 'sha(C1)', displayName: 'Kate Bell', firstName: 'Kate', phone: '(555) 564-8583', email: 'kate-bell@mac.com' });
  });

  it('offers a number or address saved twice once, as first written', () => {
    const repeated = {
      ...(contact as object),
      phoneNumbers: [{ number: '(555) 564-8583' }, { number: '555-564 8583' }, { number: '5555648583' }, { number: '(415) 555-3695' }],
      emails: [{ email: 'Kate-Bell@mac.com' }, { email: 'kate-bell@MAC.com' }, { email: ' kate-bell@mac.com ' }, { email: 'kate@work.com' }],
    } as never;
    expect(contactChoice(repeated)).toMatchObject({ phones: ['(555) 564-8583', '(415) 555-3695'], emails: ['Kate-Bell@mac.com', 'kate@work.com'] });
  });
});

describe('uniqueKeys', () => {
  it('keeps each key and suffixes a repeat with its row', () => {
    expect(uniqueKeys(['', 'a', 'b', 'a', 'a'])).toEqual(['', 'a', 'b', 'a#3', 'a#4']);
  });
});

describe('calendar import', () => {
  it('suggests only recurring birthday or anniversary events, at most 100, without names or addresses', async () => {
    const events = [
      { id: 'e1', title: 'Mum birthday', recurrenceRule: { frequency: 'yearly' }, startDate: '2030-10-02T00:00:00Z' },
      { id: 'e2', title: 'Wedding ANNIVERSARY', recurrenceRule: { frequency: 'yearly' }, startDate: '2030-11-02T00:00:00Z' },
      { id: 'e3', title: 'Birthday party', recurrenceRule: null, startDate: '2030-10-05T00:00:00Z' },
      { id: 'e4', title: 'Standup', recurrenceRule: { frequency: 'daily' }, startDate: '2030-10-05T00:00:00Z' },
      ...Array.from({ length: 120 }, (_, index) => ({ id: `x${index}`, title: 'birthday', recurrenceRule: {}, startDate: '2030-12-01T00:00:00Z' })),
    ];
    (Calendar.getEventsAsync as jest.Mock).mockResolvedValueOnce(events);
    const candidates = await calendarCandidates('cal', Date.parse('2030-09-01T12:00:00Z'));
    expect(candidates).toHaveLength(100);
    expect(candidates.slice(0, 2).map((item) => item.title)).toEqual(['Mum birthday', 'Wedding ANNIVERSARY']);
    expect((Calendar.getEventsAsync as jest.Mock).mock.calls[0][0]).toEqual(['cal']);

    const anniversary = await calendarMomentInput(candidates[1], 'UTC');
    expect(anniversary).toMatchObject({ type: 'anniversary', title: 'Wedding ANNIVERSARY', firstName: '', phone: '', email: '', source: 'calendar', sourceKey: 'calendar:sha(e2)', occurrenceDate: '2030-11-02' });
  });
});

describe('festival import', () => {
  it('copies the hard-coded regions verbatim', () => {
    expect(Object.keys(FESTIVAL_REGIONS).sort()).toEqual(['East Asia', 'Global', 'India', 'United States']);
    expect(FESTIVAL_REGIONS.India).toEqual(['Diwali', 'Holi', 'Eid', 'Pongal']);
  });

  it('opens a "<name> Wishes" festival with no date and no yearly repeat', () => {
    expect(festivalMomentInput('Diwali', 'Asia/Kolkata')).toMatchObject({ type: 'festival', title: 'Diwali Wishes', yearly: false, source: 'festivalCatalog', occurrenceDate: '' });
  });
});

describe('contact address links (iOS ContactAddressLinks)', () => {
  it('keys each link by a 16-byte SHA-256 of contact, field and normalized address', async () => {
    digest.mockResolvedValueOnce('a'.repeat(64));
    expect(await linkID('C1', 'phone', '+1 (555) 010-0200')).toBe('a'.repeat(32));
    expect(digest).toHaveBeenLastCalledWith(Crypto.CryptoDigestAlgorithm.SHA256, 'C1\u001fphone\u001f+15550100200');
    await linkID('C1', 'email', ' Kate@Example.COM ');
    expect(digest).toHaveBeenLastCalledWith(Crypto.CryptoDigestAlgorithm.SHA256, 'C1\u001femail\u001fkate@example.com');
  });

  it('records an address as taken from the card only when it is one of the contact’s', async () => {
    const links: ContactLinks = {};
    await recordRecipient(links, { contactIdentifier: 'C1', phone: '+1 555 010 0200', email: 'kate@typed.com', phoneChoices: ['+1 (555) 010-0200'], emailChoices: ['kate@example.com'] });
    expect(links[await linkID('C1', 'phone', '+15550100200')]).toBe(true);
    expect(links[await linkID('C1', 'email', 'kate@typed.com')]).toBe(false);
    // Edited later without the choices: a changed address was typed, an unchanged one keeps its record.
    await recordRecipient(links, { contactIdentifier: 'C1', phone: '+15550100200', email: 'kate@new.com', phoneChoices: [], emailChoices: [] }, { phone: '+1 555 010 0200', email: 'kate@typed.com' });
    expect(links[await linkID('C1', 'phone', '+15550100200')]).toBe(true);
    expect(links[await linkID('C1', 'email', 'kate@new.com')]).toBe(false);
    // A manually entered recipient records nothing.
    const none: ContactLinks = {};
    await recordRecipient(none, { contactIdentifier: '', phone: '5550100200', email: '', phoneChoices: [], emailChoices: [] });
    expect(none).toEqual({});
  });

  it('warns only when a card-sourced address left the card, and never for a typed one', async () => {
    const links: ContactLinks = {};
    const kate = { contactIdentifier: 'C1', phone: '+15550100200', email: 'kate@typed.com' };
    await recordRecipient(links, { ...kate, phoneChoices: ['+1 (555) 010-0200'], emailChoices: ['kate@example.com'] });
    expect(await reviewRecipient(links, kate, { phones: ['+1 (555) 010-0200'], emails: ['kate@example.com'] })).toBeNull();
    expect(await reviewRecipient(links, kate, { phones: ['+1 (555) 010-9999'], emails: [] })).toBe(PHONE_CHANGED);
    expect(await reviewRecipient(links, { ...kate, phone: '' }, { phones: [], emails: [] })).toBeNull();
    expect(await reviewRecipient(links, kate, null)).toBe(CONTACT_DELETED);
    expect(await reviewRecipient(links, { ...kate, phone: '' }, null)).toBeNull();
    expect(await reviewRecipient(links, { ...kate, contactIdentifier: '' }, { phones: [], emails: [] })).toBeNull();
  });

  it('records an unrecorded address from the card as it is now, without a warning', async () => {
    const links: ContactLinks = {};
    const sam = { contactIdentifier: 'C9', phone: '+15555550100', email: 'sam@example.com' };
    expect(await reviewRecipient(links, sam, { phones: ['+1 (555) 555-0100'], emails: [] })).toBeNull();
    expect(links[await linkID('C9', 'phone', sam.phone)]).toBe(true);
    expect(links[await linkID('C9', 'email', sam.email)]).toBe(false);
    expect(await reviewRecipient(links, sam, { phones: [], emails: [] })).toBe(PHONE_CHANGED);
    expect(EMAIL_CHANGED).toBe('A contact’s email changed. Review their delivery address.');
  });
});

describe('validatePickedContacts', () => {
  const lookup = Contacts.getContactByIdAsync as jest.Mock;
  const permissions = Contacts.getPermissionsAsync as jest.Mock;
  beforeEach(() => AsyncStorage.clear());
  afterEach(() => lookup.mockReset().mockResolvedValue(undefined));

  it('checks the device’s record with full access, and trusts the picker without it', async () => {
    await updateContactLinks((links) => recordRecipient(links, { contactIdentifier: 'C1', phone: '', email: 'kate@example.com', phoneChoices: [], emailChoices: ['kate@example.com'] }));
    const kate = { selected: true, contactIdentifier: 'C1', phone: '', email: 'kate@example.com' };
    lookup.mockResolvedValue({ id: 'C1', phoneNumbers: [], emails: [{ email: ' Kate@Example.com ' }] });
    await expect(validatePickedContacts([kate])).resolves.toBeUndefined();
    lookup.mockResolvedValue({ id: 'C1', phoneNumbers: [], emails: [{ email: 'kate@new.com' }] });
    await expect(validatePickedContacts([kate])).rejects.toThrow(EMAIL_CHANGED);
    await expect(validatePickedContacts([{ ...kate, selected: false }])).resolves.toBeUndefined();
    permissions.mockResolvedValueOnce({ granted: false, canAskAgain: true });
    lookup.mockClear();
    await expect(validatePickedContacts([kate])).resolves.toBeUndefined();
    expect(lookup).not.toHaveBeenCalled();
  });
});

import * as Contacts from 'expo-contacts/legacy';
import * as MailComposer from 'expo-mail-composer';
import * as SMS from 'expo-sms';
import { Linking } from 'react-native';

import { canSendEmail, canSendMessage, composeEmail, composeMessage, emailDraft, messageBody, placeCall, telUrl } from './composers';
import { resolveContacts, toActionContact } from './contacts';

const mockedContacts = Contacts as unknown as Record<string, jest.Mock>;
const mockedSMS = SMS as unknown as Record<string, jest.Mock>;
const mockedMail = MailComposer as unknown as Record<string, jest.Mock>;

beforeEach(() => {
  jest.clearAllMocks();
  mockedContacts.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
  mockedContacts.getContactsAsync.mockResolvedValue({ data: [] });
  mockedContacts.getContactByIdAsync.mockResolvedValue(undefined);
  mockedSMS.isAvailableAsync.mockResolvedValue(true);
  mockedMail.isAvailableAsync.mockResolvedValue(true);
});

/** `AppleTaskActionContacts.resolve(name:identifier:)` (ios/App/TaskActionContacts.swift:18-46). */
describe('resolving a contact', () => {
  const DAMIEN = {
    id: 'c1',
    name: 'Damien Hall',
    phoneNumbers: [{ id: 'p1', label: 'mobile', number: '+15551234567' }],
    emails: [{ id: 'e1', label: 'work', email: 'damien@example.com' }],
  };

  it('searches by name and maps phones and emails', async () => {
    mockedContacts.getContactsAsync.mockResolvedValue({ data: [DAMIEN] });

    const result = await resolveContacts({ name: 'Damien' });

    expect(mockedContacts.getContactsAsync).toHaveBeenCalledWith({ name: 'Damien', fields: expect.any(Array) });
    expect(result).toEqual([
      {
        id: 'c1',
        name: 'Damien Hall',
        phones: [{ id: 'p1', label: 'mobile', value: '+15551234567' }],
        emails: [{ id: 'e1', label: 'work', value: 'damien@example.com' }],
      },
    ]);
  });

  /** A remembered identifier wins, so a second reminder never asks which person again. */
  it('looks a remembered contact up directly', async () => {
    mockedContacts.getContactByIdAsync.mockResolvedValue(DAMIEN);

    await resolveContacts({ name: 'Damien', identifier: 'c1' });

    expect(mockedContacts.getContactByIdAsync).toHaveBeenCalledWith('c1', expect.any(Array));
    expect(mockedContacts.getContactsAsync).not.toHaveBeenCalled();
  });

  it('falls back to a name search when the remembered identifier is stale', async () => {
    mockedContacts.getContactByIdAsync.mockRejectedValue(new Error('gone'));
    mockedContacts.getContactsAsync.mockResolvedValue({ data: [DAMIEN] });

    const result = await resolveContacts({ name: 'Damien', identifier: 'c1' });

    expect(mockedContacts.getContactsAsync).toHaveBeenCalled();
    expect(result).toHaveLength(1);
  });

  it('returns every match so the screen can ask which person', async () => {
    mockedContacts.getContactsAsync.mockResolvedValue({ data: [DAMIEN, { ...DAMIEN, id: 'c2', name: 'Damien Ross' }] });

    expect(await resolveContacts({ name: 'Damien' })).toHaveLength(2);
  });

  it('throws Swift’s "no matching contact" message when nothing matches', async () => {
    await expect(resolveContacts({ name: 'Nobody' })).rejects.toThrow(/No matching contact is available/);
  });

  /** The permission moment: the first time a channel is chosen, not at launch. */
  it('asks for permission once, and throws Swift’s message when refused', async () => {
    mockedContacts.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });
    mockedContacts.requestPermissionsAsync.mockResolvedValue({ granted: false });

    await expect(resolveContacts({ name: 'Damien' })).rejects.toThrow(/Allow Nexdo to access Contacts in Settings/);
    expect(mockedContacts.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('does not re-prompt when permission cannot be asked for again', async () => {
    mockedContacts.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false });

    await expect(resolveContacts({ name: 'Damien' })).rejects.toThrow(/Allow Nexdo to access Contacts/);
    expect(mockedContacts.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  /** The label fallbacks at TaskActionContacts.swift:41, `:43`. */
  it('falls back to the detected name and the generic labels', () => {
    const mapped = toActionContact(
      { id: 'c9', name: '', phoneNumbers: [{ number: '5551234' }], emails: [{ email: 'x@example.com' }] } as never,
      'Damien',
    );
    expect(mapped.name).toBe('Damien');
    expect(mapped.phones[0]).toMatchObject({ label: 'Phone', value: '5551234' });
    expect(mapped.emails[0]).toMatchObject({ label: 'Email', value: 'x@example.com' });
  });

  it('drops entries with no value at all', () => {
    const mapped = toActionContact({ id: 'c9', name: 'A', phoneNumbers: [{ id: 'p' }], emails: [] } as never, 'Damien');
    expect(mapped.phones).toEqual([]);
  });
});

/** `TaskActionComposers.swift`. */
describe('the composers', () => {
  it('builds Swift’s message body, with and without a context', () => {
    expect(messageBody({ name: 'Damien', context: 'the roof inspection' })).toBe(
      'Hi Damien, following up regarding the roof inspection.',
    );
    expect(messageBody({ name: 'Damien', context: null })).toBe('Hi Damien, just checking in.');
  });

  it('builds Swift’s email draft, with and without a context', () => {
    expect(emailDraft({ recipient: 'd@example.com', name: 'Damien', context: 'the roof' })).toEqual({
      recipient: 'd@example.com',
      subject: 'Follow-up: the roof',
      body: 'Hi Damien,\n\nJust following up regarding the roof.\n\nThanks.',
    });
    expect(emailDraft({ recipient: 'd@example.com', name: 'Damien', context: null })).toMatchObject({
      subject: 'Following up',
      body: 'Hi Damien,\n\nJust checking in.\n\nThanks.',
    });
  });

  /** `canSendText()` / `canSendMail()` (TaskActionView.swift:270, TaskActionComposers.swift:16). */
  it('reports availability from the platform', async () => {
    mockedSMS.isAvailableAsync.mockResolvedValue(false);
    mockedMail.isAvailableAsync.mockResolvedValue(false);
    expect(await canSendMessage()).toBe(false);
    expect(await canSendEmail()).toBe(false);
  });

  it('refuses to compose on a device that cannot, with Swift’s message', async () => {
    mockedSMS.isAvailableAsync.mockResolvedValue(false);
    await expect(composeMessage({ recipient: '+1555', body: 'hi' })).rejects.toThrow(/isn’t available on this device/);

    mockedMail.isAvailableAsync.mockResolvedValue(false);
    await expect(composeEmail(emailDraft({ recipient: 'a@b.c', name: 'A' }))).rejects.toThrow(/isn’t available on this device/);
  });

  it.each([
    ['sent', 'submitted'],
    ['cancelled', 'cancelled'],
    ['unknown', 'failed'],
  ])('maps the SMS result %s to %s', async (result, expected) => {
    mockedSMS.sendSMSAsync.mockResolvedValue({ result });
    expect(await composeMessage({ recipient: '+15551234567', body: 'hi' })).toBe(expected);
  });

  it.each([
    ['sent', 'submitted'],
    ['saved', 'saved'],
    ['cancelled', 'cancelled'],
    ['undetermined', 'failed'],
  ])('maps the mail status %s to %s', async (status, expected) => {
    mockedMail.composeAsync.mockResolvedValue({ status });
    expect(await composeEmail(emailDraft({ recipient: 'a@b.c', name: 'A' }))).toBe(expected);
  });

  it('treats a thrown composer as a failure, not a crash', async () => {
    mockedSMS.sendSMSAsync.mockRejectedValue(new Error('boom'));
    expect(await composeMessage({ recipient: '+1555', body: 'hi' })).toBe('failed');
  });
});

/**
 * `placeCall()`'s number check (TaskActionView.swift:278-288) —
 * "Do not turn an extension, pause, or vanity number into a different number."
 */
describe('placing a call', () => {
  it.each([
    ['+1 (555) 123-4567', 'tel:+15551234567'],
    ['555.123.4567', 'tel:5551234567'],
    ['555 1234', 'tel:5551234'],
  ])('dials %s as %s', (value, expected) => {
    expect(telUrl(value)).toBe(expected);
  });

  it.each([
    '1-800-FLOWERS',
    '+1555123456,,789',
    '5551234567 x22',
    '+1555+2',
    '12',
  ])('refuses %s', (value) => {
    expect(telUrl(value)).toBeNull();
  });

  it('opens the dialler and reports whether the system accepted it', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);

    expect(await placeCall('+1 (555) 123-4567')).toBe(true);
    expect(open).toHaveBeenCalledWith('tel:+15551234567');

    open.mockRejectedValue(new Error('no dialler'));
    expect(await placeCall('+15551234567')).toBe(false);
  });

  it('throws Swift’s message rather than dialling a mangled number', async () => {
    await expect(placeCall('1-800-FLOWERS')).rejects.toThrow(/can’t be used for a call/);
  });
});

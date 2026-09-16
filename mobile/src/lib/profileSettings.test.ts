import type { ProfilePreferences } from '../api';
import {
  formatClock,
  NAME_ERROR,
  normalizePhone,
  parseClock,
  PHONE_ERROR,
  timeZoneLabel,
  validateSettings,
  WORK_HOURS_ERROR,
} from './profileSettings';

function preferences(overrides: Partial<ProfilePreferences> = {}): ProfilePreferences {
  return {
    workStart: '09:00',
    workEnd: '17:00',
    quietStart: '21:00',
    quietEnd: '07:00',
    confirmationLevel: 'CHANGES_AND_DELETES',
    voiceEnabled: true,
    personalizationEnabled: false,
    pushEnabled: true,
    emailEnabled: true,
    smsEnabled: false,
    morningSummary: true,
    eveningSummary: true,
    phoneNumber: null,
    ...overrides,
  };
}

const DRAFT = {
  name: 'Ada Lovelace',
  preferences: preferences(),
  nextAction: { enabled: true, switchingThreshold: 10 },
  deviceTimeZone: 'Asia/Kolkata',
};

/** `normalizePhone(_:)` (ios/App/ProfileView.swift:358-366). */
describe('normalizePhone', () => {
  it('keeps an E.164 number, stripping punctuation', () => {
    expect(normalizePhone('+1 (555) 123-4567')).toBe('+15551234567');
    expect(normalizePhone('+44 20 7946 0958')).toBe('+442079460958');
  });

  it('assumes +1 for a bare 10-digit US number', () => {
    expect(normalizePhone('555 123 4567')).toBe('+15551234567');
    expect(normalizePhone('(555) 123-4567')).toBe('+15551234567');
  });

  it('is null for an empty value', () => {
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
    expect(normalizePhone('   ')).toBeNull();
  });

  it('rejects a + number that is too short, too long, or starts with zero', () => {
    expect(normalizePhone('+1234567')).toBeNull();
    expect(normalizePhone(`+${'1'.repeat(16)}`)).toBeNull();
    expect(normalizePhone('+0123456789')).toBeNull();
  });

  it('rejects a bare number that is not exactly ten digits', () => {
    expect(normalizePhone('5551234')).toBeNull();
    expect(normalizePhone('15551234567')).toBeNull();
  });
});

/** `settingsInput()` (ProfileView.swift:339-356). */
describe('validateSettings', () => {
  it('builds the PATCH body with the trimmed name and the DEVICE time zone', () => {
    const result = validateSettings({ ...DRAFT, name: '  Ada Lovelace  ' });
    expect(result).toMatchObject({
      ok: true,
      input: { name: 'Ada Lovelace', timeZone: 'Asia/Kolkata', nextAction: { enabled: true, switchingThreshold: 10 } },
    });
  });

  it('rejects an empty name and one over 80 characters', () => {
    expect(validateSettings({ ...DRAFT, name: '   ' })).toEqual({ ok: false, failure: NAME_ERROR });
    expect(validateSettings({ ...DRAFT, name: 'x'.repeat(81) })).toEqual({ ok: false, failure: NAME_ERROR });
    expect(validateSettings({ ...DRAFT, name: 'x'.repeat(80) })).toMatchObject({ ok: true });
  });

  it('rejects working hours that do not end after they start, including equal ones', () => {
    expect(validateSettings({ ...DRAFT, preferences: preferences({ workStart: '17:00', workEnd: '09:00' }) })).toEqual({
      ok: false,
      failure: WORK_HOURS_ERROR,
    });
    expect(validateSettings({ ...DRAFT, preferences: preferences({ workStart: '09:00', workEnd: '09:00' }) })).toEqual({
      ok: false,
      failure: WORK_HOURS_ERROR,
    });
  });

  it('does NOT constrain quiet hours, which Swift lets cross midnight', () => {
    expect(validateSettings({ ...DRAFT, preferences: preferences({ quietStart: '21:00', quietEnd: '07:00' }) })).toMatchObject({
      ok: true,
    });
  });

  it('normalises the stored phone number into the body', () => {
    const result = validateSettings({ ...DRAFT, preferences: preferences({ phoneNumber: '(555) 123-4567' }) });
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.input.preference.phoneNumber).toBe('+15551234567');
  });

  it('sends null rather than an empty string for a blank phone number', () => {
    const result = validateSettings({ ...DRAFT, preferences: preferences({ phoneNumber: '  ' }) });
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.input.preference.phoneNumber).toBeNull();
  });

  /** A legacy value the server would now reject blocks the save, exactly as in Swift (`:344-347`). */
  it('rejects a stored phone number that cannot be normalised', () => {
    expect(validateSettings({ ...DRAFT, preferences: preferences({ phoneNumber: '12345' }) })).toEqual({
      ok: false,
      failure: PHONE_ERROR,
    });
  });

  it('checks the name before the working hours', () => {
    expect(validateSettings({ ...DRAFT, name: '', preferences: preferences({ workStart: '17:00', workEnd: '09:00' }) })).toEqual({
      ok: false,
      failure: NAME_ERROR,
    });
  });
});

/** `clock(_:)` (ProfileView.swift:288-292). */
describe('clock helpers', () => {
  it('reads an "HH:mm" value', () => {
    expect(parseClock('09:30')).toEqual({ hour: 9, minute: 30 });
    expect(parseClock('00:00')).toEqual({ hour: 0, minute: 0 });
    expect(parseClock('23:59')).toEqual({ hour: 23, minute: 59 });
  });

  it('falls back to 09:00 the way Swift’s `?? 9` / `?? 0` do', () => {
    expect(parseClock('')).toEqual({ hour: 9, minute: 0 });
    expect(parseClock('nonsense')).toEqual({ hour: 9, minute: 0 });
  });

  it('writes back zero-padded', () => {
    expect(formatClock(9, 5)).toBe('09:05');
    expect(formatClock(0, 0)).toBe('00:00');
    expect(formatClock(23, 59)).toBe('23:59');
  });

  it('round-trips every hour and minute', () => {
    for (const hour of [0, 7, 12, 23]) {
      for (const minute of [0, 1, 30, 59]) {
        expect(parseClock(formatClock(hour, minute))).toEqual({ hour, minute });
      }
    }
  });
});

/** `TimeZone.autoupdatingCurrent.identifier.replacingOccurrences(of: "_", with: " ")` (`:195`). */
it('shows a time zone identifier with spaces instead of underscores', () => {
  expect(timeZoneLabel('America/Los_Angeles')).toBe('America/Los Angeles');
  expect(timeZoneLabel('Asia/Kolkata')).toBe('Asia/Kolkata');
});

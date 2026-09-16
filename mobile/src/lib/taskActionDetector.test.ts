import { detectTaskAction, parseTime } from './taskActionDetector';

/**
 * The cases are Swift's own, from `ios/Tests/NexdoCoreTests/TaskActionTests.swift:9-47`, with the
 * same `now` and the same zone: 2026-09-09T16:00:00Z is Wednesday 9 AM in America/Los_Angeles.
 */
const NOW = Date.parse('2026-09-09T16:00:00Z');
const ZONE = 'America/Los_Angeles';

/** `contactActionExamplesAndContext` (TaskActionTests.swift:9-28). */
describe('detectTaskAction', () => {
  it.each([
    ['Contact Damien at 10:00 AM.', 'contact', 'Damien', null, '2026-09-09T17:00:00Z'],
    ['Call Damien at 4 PM', 'call', 'Damien', 'call', '2026-09-09T23:00:00Z'],
    ['Contact Damien tomorrow at 10 AM', 'contact', 'Damien', null, '2026-09-10T17:00:00Z'],
    ['Email John Friday morning', 'email', 'John', 'email', '2026-09-11T16:00:00Z'],
    ['Message Robert tonight', 'message', 'Robert', 'message', '2026-09-10T02:00:00Z'],
    ['Follow up with Damien Thursday', 'followUp', 'Damien', null, '2026-09-10T16:00:00Z'],
  ])('reads %s', (title, intent, name, preferred, at) => {
    const result = detectTaskAction(title, NOW, ZONE);
    expect(result).not.toBeNull();
    expect(result?.intent).toBe(intent);
    expect(result?.contactName).toBe(name);
    expect(result?.preferredAction).toBe(preferred);
    expect(result?.scheduledAt).toBe(Date.parse(at as string));
  });

  it('pulls the context out, whether it comes before or after the time', () => {
    for (const title of ['Contact Damien at 10 AM about the roof inspection.', 'Contact Damien about the roof inspection at 10 AM.']) {
      expect(detectTaskAction(title, NOW, ZONE)?.context).toBe('the roof inspection');
    }
  });

  /** `actionDatesRespectTimezoneRolloverAndDST` (TaskActionTests.swift:30-38). */
  it('rolls past times to tomorrow, and reads 12 AM and 12 PM correctly', () => {
    expect(detectTaskAction('Call Ana at 8 AM', NOW, ZONE)?.scheduledAt).toBe(Date.parse('2026-09-10T15:00:00Z'));
    expect(detectTaskAction('Call Ana at 12 AM', NOW, ZONE)?.scheduledAt).toBe(Date.parse('2026-09-10T07:00:00Z'));
    expect(detectTaskAction('Call Ana at 12 PM', NOW, ZONE)?.scheduledAt).toBe(Date.parse('2026-09-09T19:00:00Z'));
  });

  it('keeps the wall-clock hour across a spring-forward boundary', () => {
    const beforeDST = Date.parse('2026-03-07T17:00:00Z');
    expect(detectTaskAction('Call Ana tomorrow at 10 AM', beforeDST, ZONE)?.scheduledAt).toBe(Date.parse('2026-03-08T17:00:00Z'));
  });

  it('uses the ACCOUNT zone, not the device one', () => {
    expect(detectTaskAction('Call Ana at 10 AM', NOW, 'Asia/Tokyo')?.scheduledAt).toBe(Date.parse('2026-09-10T01:00:00Z'));
  });

  /** `missingAndAmbiguousActionMetadataIsConservative` (TaskActionTests.swift:40-47). */
  it.each(['Buy groceries', 'Call', 'Contact at 10 AM', 'Contact 123 at 10 AM', ''])('detects nothing in %s', (title) => {
    expect(detectTaskAction(title, NOW, ZONE)).toBeNull();
  });

  it.each(['Call Damien', 'Call Damien at 10', 'Call Damien at 25 PM', 'Call Damien at 10:99 AM'])(
    'detects the contact but no time in %s',
    (title) => {
      const result = detectTaskAction(title, NOW, ZONE);
      expect(result).not.toBeNull();
      expect(result?.scheduledAt).toBeNull();
    },
  );

  it('refuses a name longer than five words', () => {
    expect(detectTaskAction('Call one two three four five six', NOW, ZONE)).toBeNull();
  });

  it('maps every verb to its intent and channel', () => {
    expect(detectTaskAction('Text Robert', NOW, ZONE)).toMatchObject({ intent: 'message', preferredAction: 'message' });
    expect(detectTaskAction('Follow up with Ana', NOW, ZONE)).toMatchObject({ intent: 'followUp', preferredAction: null });
    expect(detectTaskAction('Contact Ana', NOW, ZONE)).toMatchObject({ intent: 'contact', preferredAction: null });
  });
});

/** `parseTime` (TaskActionDetector.swift:35-76), exercised directly. */
describe('parseTime', () => {
  it('reads the three named parts of the day', () => {
    expect(parseTime(' tomorrow morning', NOW, ZONE)).toBe(Date.parse('2026-09-10T16:00:00Z'));
    expect(parseTime(' tomorrow afternoon', NOW, ZONE)).toBe(Date.parse('2026-09-10T21:00:00Z'));
    expect(parseTime(' tonight', NOW, ZONE)).toBe(Date.parse('2026-09-10T02:00:00Z'));
  });

  it('defaults a bare weekday to 9 AM', () => {
    // Wednesday → Thursday.
    expect(parseTime(' Thursday', NOW, ZONE)).toBe(Date.parse('2026-09-10T16:00:00Z'));
  });

  it('"next <weekday>" on that same weekday means a week later', () => {
    expect(parseTime(' next Wednesday', NOW, ZONE)).toBe(Date.parse('2026-09-16T16:00:00Z'));
  });

  it('a bare weekday that is today means today', () => {
    expect(parseTime(' Wednesday', NOW, ZONE)).toBe(Date.parse('2026-09-09T16:00:00Z'));
  });

  it('keeps an explicit day even when the time has already passed', () => {
    // 8 AM today is behind `now`, but "today" was said, so it is not rolled forward.
    expect(parseTime(' today at 8 AM', NOW, ZONE)).toBe(Date.parse('2026-09-09T15:00:00Z'));
  });

  it('is null without an hour', () => {
    expect(parseTime('', NOW, ZONE)).toBeNull();
    expect(parseTime(' about the roof', NOW, ZONE)).toBeNull();
  });
});

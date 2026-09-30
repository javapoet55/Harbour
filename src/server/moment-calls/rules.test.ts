import { describe, expect, it } from 'vitest';
import { agentTwiml, bridgeTwiml } from './twilio';
import { dueConnect, inWindow, nanpZone, nextConnectAt, previewConnect, suggestConnectTime, toE164 } from './rules';

const mom = { occurrenceDate: '1960-10-02', yearly: true, timeZoneID: 'Asia/Kolkata', connectTime: '09:00', connectTimeZone: '' };

describe('phone numbers', () => {
  it('normalizes international and US numbers, and rejects numbers without a country code', () => {
    expect(toE164('+91 98765 43210')).toBe('+919876543210');
    expect(toE164('0091 98765 43210')).toBe('+919876543210');
    expect(toE164('(650) 555-0123', true)).toBe('+16505550123');     // US/Canada time zone
    expect(toE164('1-650-555-0123', true)).toBe('+16505550123');
    expect(toE164('98765 43210', false)).toBeNull();                 // could be an Indian mobile: never guess +1
    expect(toE164('(650) 555-0123')).toBeNull();
    expect(toE164('+0123')).toBeNull();
    expect(nanpZone('America/Chicago')).toBe(true);
    expect(nanpZone('Asia/Kolkata')).toBe(false);
  });
});

describe('when the connect call happens', () => {
  it('uses the recipient time zone by default and the next yearly date', () => {
    const next = nextConnectAt(mom, new Date('2026-09-27T12:00:00Z'));
    expect(next.date).toBe('2026-10-02');
    expect(next.at.toISOString()).toBe('2026-10-02T03:30:00.000Z');      // 9:00 AM IST
  });
  it('is due from the chosen time for one hour on the moment day only', () => {
    expect(dueConnect(mom, new Date('2026-10-02T03:29:00Z'))).toBeNull();
    expect(dueConnect(mom, new Date('2026-10-02T03:30:30Z'))).toMatchObject({ date: '2026-10-02' });
    expect(dueConnect(mom, new Date('2026-10-02T04:31:00Z'))).toBeNull();
    expect(dueConnect(mom, new Date('2026-10-03T03:30:30Z'))).toBeNull();
  });
  it('previews the time for both people and checks both calling windows', () => {
    const p = previewConnect(new Date('2026-10-02T03:30:00Z'), 'America/Los_Angeles', 'Asia/Kolkata');
    expect(p.recipientLocal).toBe('Fri 2 Oct, 9:00 AM');
    expect(p.userLocal).toBe('Thu 1 Oct, 8:30 PM');
    expect(p).toMatchObject({ userOk: true, recipientOk: true });
    expect(inWindow('Asia/Tokyo', new Date('2026-10-02T13:00:00Z'))).toBe(false);   // 22:00 in Tokyo
  });
  it('defaults to 9:00 AM for the recipient, or the nearest time that also suits the user', () => {
    expect(suggestConnectTime(mom, 'America/Los_Angeles', new Date('2026-09-27T12:00:00Z'))).toBe('09:00');
    const july = { occurrenceDate: '1990-07-20', yearly: true, timeZoneID: 'America/New_York', connectTimeZone: '' };
    expect(suggestConnectTime(july, 'Asia/Tokyo', new Date('2026-09-27T12:00:00Z'))).toBe('08:30');     // 9 AM EDT = 10 PM Tokyo; 8:30 = 9:30 PM
    const november = { ...july, occurrenceDate: '1990-11-20' };
    expect(suggestConnectTime(november, 'Asia/Tokyo', new Date('2026-09-27T12:00:00Z'))).toBe('18:00'); // EST: mornings are all past 9:30 PM in Tokyo; 6 PM NY = 8 AM Tokyo
  });
});

describe('call instructions for Twilio', () => {
  it('asks via the agent, then redirects to learn the decision', () => {
    const xml = agentTwiml('wss://w.example.com/twilio-media', 'moment:c1.sig', 'https://app.example.com/api/moment-calls/after-agent?callId=c1');
    expect(xml).toContain('<Connect><Stream url="wss://w.example.com/twilio-media"><Parameter name="callToken" value="moment:c1.sig"/></Stream></Connect><Redirect method="POST">https://app.example.com/api/moment-calls/after-agent?callId=c1</Redirect>');
  });
  it('bridges showing the user’s own number', () => {
    const xml = bridgeTwiml({ callerId: '+16505550123', to: '+919876543210', actionUrl: 'https://a/x?callId=c1&y=2' });
    expect(xml).toContain('<Dial callerId="+16505550123" timeout="30" answerOnBridge="true" action="https://a/x?callId=c1&amp;y=2" method="POST"><Number>+919876543210</Number></Dial>');
  });
});

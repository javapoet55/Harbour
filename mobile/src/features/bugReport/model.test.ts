import { ApiError } from '../../api/client';
import {
  acceptShake,
  base64Bytes,
  BUG_FAILURE,
  BUG_SCREENSHOT_MAX_BYTES,
  bugDiagnostics,
  bugDraftValid,
  bugFailureMessage,
  bugShakeKey,
  bugSubmission,
  clampBugDescription,
  deviceModelForServer,
  includeScreenshot,
  newBugDraft,
  removeScreenshot,
  screenshotFits,
  SHAKE_NEVER,
  versionForServer,
  type BugDiagnostics,
} from './model';

/** The cases are Swift's own (ios/Tests/NexdoCoreTests/BugReportTests.swift). */

let counter = 0;
const newId = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;
beforeEach(() => {
  counter = 0;
});

const metadata: BugDiagnostics = { appVersion: '1', buildNumber: '1', deviceModel: 'iPhone18,2', iosVersion: '26', screen: 'tasks', timestamp: '2026-10-10T12:00:00Z', correlationID: newId() };

describe('BugReportDraft', () => {
  // bugDescriptionAndConsent (:6-16)
  it('needs a description of 1–2,000 units, and a screenshot is consent', () => {
    let draft = newBugDraft(newId);
    expect(bugDraftValid(draft)).toBe(false);
    expect(draft.screenshotConsent).toBe(false);
    expect(bugDraftValid({ description: '  \n' })).toBe(false);
    expect(bugDraftValid({ description: 'a'.repeat(2000) })).toBe(true);
    expect(bugDraftValid({ description: 'a'.repeat(2001) })).toBe(false);
    draft = includeScreenshot({ ...draft, description: 'Calendar issue' }, 'AQI=');
    expect(draft.screenshotConsent).toBe(true);
    draft = removeScreenshot(draft);
    expect(draft.screenshot).toBeNull();
    expect(draft.screenshotConsent).toBe(false);
    expect(draft.description).toBe('Calendar issue');
  });

  it('clamps the editor at 2,000 units', () => {
    expect(clampBugDescription('a'.repeat(2005))).toHaveLength(2000);
    expect(clampBugDescription('short')).toBe('short');
  });

  // bugRetryIsImmutable (:17-27)
  it('freezes the first request, so a retry repeats it exactly', () => {
    const first = bugSubmission({ ...newBugDraft(newId), description: '  Original  ' }, metadata);
    expect(first).not.toBeNull();
    const edited = includeScreenshot({ ...first!.draft, description: 'Edited' }, 'AQ==');
    const retry = bugSubmission(edited, metadata);
    expect(retry!.input).toBe(first!.input);
    expect(retry!.input).toMatchObject({ id: first!.input.id, description: 'Original' });
    expect('screenshot' in retry!.input).toBe(false);
    const cleared = newBugDraft(newId);
    expect(cleared.id).not.toBe(first!.input.id);
    expect(bugDraftValid(cleared)).toBe(false);
  });

  it('sends the screenshot only with consent, and omits the key otherwise', () => {
    const base = { ...newBugDraft(newId), description: 'Broken' };
    expect(bugSubmission(includeScreenshot(base, 'AQI='), metadata)!.input).toMatchObject({ screenshotConsent: true, screenshot: 'AQI=' });
    const without = bugSubmission(base, metadata)!.input;
    expect(without.screenshotConsent).toBe(false);
    expect(Object.keys(without)).toEqual(['id', 'description', 'metadata', 'screenshotConsent']);
  });

  it('refuses an invalid first attempt', () => {
    expect(bugSubmission(newBugDraft(newId), metadata)).toBeNull();
  });
});

// bugShakeDebounce (:28-43)
describe('BugShakeGate', () => {
  it('needs it on, active, nothing presented, a jolt over 2.7 and 8 seconds between', () => {
    let last = SHAKE_NEVER;
    const step = (input: { enabled: boolean; active: boolean; presenting: boolean; acceleration: number; now: number }) => {
      const result = acceptShake(last, input);
      last = result.last;
      return result.accepted;
    };
    expect(step({ enabled: false, active: true, presenting: false, acceleration: 4, now: 0 })).toBe(false);
    expect(step({ enabled: true, active: false, presenting: false, acceleration: 4, now: 0 })).toBe(false);
    expect(step({ enabled: true, active: true, presenting: true, acceleration: 4, now: 0 })).toBe(false);
    expect(step({ enabled: true, active: true, presenting: false, acceleration: 1, now: 0 })).toBe(false);
    expect(step({ enabled: true, active: true, presenting: false, acceleration: 4, now: 0 })).toBe(true);
    expect(step({ enabled: true, active: true, presenting: false, acceleration: 4, now: 7 })).toBe(false);
    expect(step({ enabled: true, active: true, presenting: false, acceleration: 4, now: 8 })).toBe(true);
  });

  it('keys the setting per account', () => {
    expect(bugShakeKey('u1')).toBe('bug.shake.u1');
  });
});

// bugSubmissionErrorsExplainTheActualFailure (:45-51), a13461a
describe('BugReportFailure', () => {
  it('explains the actual failure', () => {
    expect(bugFailureMessage(new ApiError({ status: 404, message: 'The request could not be completed (404). Refresh to check the current state before retrying.' }))).toContain('not available');
    expect(bugFailureMessage(new ApiError({ status: 404, message: 'Not found' }))).toContain('not available');
    expect(bugFailureMessage(new ApiError({ status: 401, code: 'SIGNED_OUT', message: 'Your session has expired. Please sign in again.' }))).toContain('sign in again before sending');
    expect(bugFailureMessage(new ApiError({ status: 429, message: 'Too many attempts. Please try again later.' }))).toBe('Too many attempts. Please try again later.');
    expect(bugFailureMessage(new ApiError({ status: 0, code: 'NETWORK', message: 'Nexdo could not reach the server.' }))).toContain('connection');
  });

  it('passes the server’s own words through, and has a fallback for anything else', () => {
    expect(bugFailureMessage(new ApiError({ status: 413, message: 'Screenshot is too large.' }))).toBe('Screenshot is too large.');
    expect(bugFailureMessage(new ApiError({ status: 409, message: 'Report ID is already in use.' }))).toBe('Report ID is already in use.');
    expect(bugFailureMessage(new Error('boom'))).toBe(BUG_FAILURE.other);
  });
});

describe('the screenshot cap', () => {
  it('measures the decoded size without decoding', () => {
    expect(base64Bytes('AQI=')).toBe(2);
    expect(base64Bytes('AQ==')).toBe(1);
    expect(base64Bytes('AQID')).toBe(3);
  });

  it('allows 2,000,000 decoded bytes and no more', () => {
    const at = 'A'.repeat(Math.ceil((BUG_SCREENSHOT_MAX_BYTES / 3) * 4) - 1) + '=';
    expect(base64Bytes(at)).toBeLessThanOrEqual(BUG_SCREENSHOT_MAX_BYTES);
    expect(screenshotFits(at)).toBe(true);
    expect(screenshotFits('AAAA'.repeat(BUG_SCREENSHOT_MAX_BYTES / 3 + 1))).toBe(false);
  });
});

describe('diagnostics', () => {
  it('builds what bugSchema accepts, from Android values', () => {
    const value = bugDiagnostics({ appVersion: '1.4.0', buildNumber: 42, model: 'Galaxy S23 Ultra (SM-S918B)', osVersion: '14' }, 'calendar', Date.parse('2026-10-10T12:00:00.500Z'), newId);
    expect(value).toEqual({
      appVersion: '1.4.0',
      buildNumber: '42',
      deviceModel: 'Galaxy S23 Ultra SM-S918B',
      iosVersion: '14',
      screen: 'calendar',
      timestamp: '2026-10-10T12:00:00Z',
      correlationID: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
  });

  it('falls back to "0" and "unknown" like Swift rather than sending a value the server refuses', () => {
    expect(versionForServer('UpsideDownCake')).toBe('0');
    // This app's own version: the numeric part goes, not "0".
    expect(versionForServer('1.0.0-rc.1')).toBe('1.0.0');
    expect(versionForServer(undefined)).toBe('0');
    expect(deviceModelForServer('Pixel 8 Pro')).toBe('Pixel 8 Pro');
    expect(deviceModelForServer('小米')).toBe('unknown');
    expect(deviceModelForServer('x'.repeat(80))).toHaveLength(60);
  });
});

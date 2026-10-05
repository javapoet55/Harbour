import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, StyleSheet } from 'react-native';

const mockPost = jest.fn();
jest.mock('../../../api/moments', () => ({
  ...jest.requireActual('../../../api/moments'),
  momentsApi: { snapshot: jest.fn(), post: (...args: unknown[]) => mockPost(...args), deleteAll: jest.fn() },
}));

import type { MomentConnectState, MomentConnectStatus } from '../connectCall';
import { MomentConnectSection } from '../MomentConnectSection';
import { momentsStore } from '../store';
import { moment } from '../testFixtures';

/**
 * "Connect me on the day", Verify caller ID and How it works (MomentConnectCall.swift:166-444). Every
 * server answer is mocked: nothing here can place a real call.
 */

const SAM = moment({ id: 'a', type: 'birthday', title: 'Sam’s Birthday', firstName: 'Sam', phone: '+15555550100' });
const preview = { userLocal: 'Tue 6 Oct, 9:00 AM', recipientLocal: 'Mon 5 Oct, 8:30 PM', userOk: true, recipientOk: true };
const state = (extra: Partial<MomentConnectState> = {}): MomentConnectState => ({
  momentId: 'a',
  enabled: false,
  time: '09:00',
  timeZone: 'America/New_York',
  recipientPhone: '+15555550100',
  passed: false,
  isToday: false,
  nextCallAt: '2030-09-20T13:00:00Z',
  preview,
  lastCall: null,
  ...extra,
});
const status = (extra: Partial<MomentConnectStatus> = {}, moments: MomentConnectState[] = [state()]): MomentConnectStatus => ({
  available: true,
  callerId: null,
  userTimeZone: 'America/New_York',
  moments,
  ...extra,
});
const VERIFIED = { callerId: { phone: '+14155550123', status: 'VERIFIED' } };

/** Answers each operation from `answers`, recording every call. */
function serve(answers: Record<string, unknown | ((input: Record<string, unknown>) => unknown)>) {
  mockPost.mockImplementation(async (operation: string, input: Record<string, unknown>) => {
    const answer = answers[operation];
    if (answer === undefined) throw new Error(`unexpected ${operation}`);
    return typeof answer === 'function' ? (answer as (value: Record<string, unknown>) => unknown)(input) : answer;
  });
}
const calls = (operation: string) => mockPost.mock.calls.filter(([name]) => name === operation).map(([, input]) => input);

let alert: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  momentsStore.setState({ owner: 'owner' });
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('Connect me on the day', () => {
  it('says calls are not available yet when the server has them off', async () => {
    serve({ connectStatus: status({ available: false }) });
    await render(<MomentConnectSection moments={[SAM]} />);
    await waitFor(() => expect(screen.getByText('Connect calls aren’t available yet.')).toBeTruthy());
    expect(calls('connectStatus')).toEqual([{ momentIds: ['a'] }]);
  });

  it('asks to verify first, and keeps the switch off with Swift’s reasons for a missing phone or a past day', async () => {
    serve({ connectStatus: status({}, [state(), state({ momentId: 'b', recipientPhone: null }), state({ momentId: 'c', passed: true })]) });
    const lee = moment({ id: 'b', firstName: 'Lee' });
    const old = moment({ id: 'c', firstName: 'Ana', phone: '+15555550111' });
    await render(<MomentConnectSection moments={[SAM, lee, old]} />);
    await waitFor(() => expect(screen.getByText('Verify your number first so Sam sees it’s you.')).toBeTruthy());
    // Unverified: disabled, as Swift draws it, with no reason at the switch (§22 "For the team").
    expect(screen.getByTestId('connect-toggle-a').props.accessibilityState).toMatchObject({ disabled: true });
    // Only the switch dims; its label stays at full colour (`moment-connect-section`).
    const dimmed = (node: { props: { style?: unknown }; parent: unknown } | null): boolean =>
      node ? StyleSheet.flatten(node.props.style as never)?.opacity === 0.4 || dimmed(node.parent as never) : false;
    expect(dimmed(screen.getByText('Connect me to Sam') as never)).toBe(false);
    expect(screen.getByText('Add Lee’s phone number with its country code (for example +91 98765 43210) to use this.')).toBeTruthy();
    expect(screen.getByText('This moment has already passed.')).toBeTruthy();
    expect(screen.queryByTestId('connect-now-a')).toBeNull();
  });

  it('turns a call on, previews it after the edits settle, and saves it', async () => {
    serve({
      connectStatus: status(VERIFIED),
      connectPreview: { time: '09:00', timeZone: 'America/New_York', nextCallAt: '2030-09-20T13:00:00Z', preview },
      connectSave: (input: Record<string, unknown>) => status(VERIFIED, [state({ enabled: true, time: input.time as string })]),
    });
    await render(<MomentConnectSection moments={[SAM]} />);
    await waitFor(() => expect(screen.getByText('Your number is verified')).toBeTruthy());
    expect(screen.getByText('Sam will see +14155550123')).toBeTruthy();
    jest.useFakeTimers();
    await fireEvent(screen.getByTestId('connect-toggle-a'), 'valueChange', true);
    expect(screen.getByTestId('connect-time-a')).toBeTruthy();
    expect(calls('connectPreview')).toHaveLength(0);
    await act(async () => {
      jest.advanceTimersByTime(350);
    });
    jest.useRealTimers();
    await waitFor(() => expect(calls('connectPreview')).toEqual([{ momentId: 'a', enabled: true, time: '09:00', timeZone: 'America/New_York' }]));
    expect(screen.getByText('On Sam’s day, Nexdo calls you at Mon 5 Oct, 8:30 PM their time (Tue 6 Oct, 9:00 AM your time) and connects you. Sam sees your number.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Save call time'));
    await waitFor(() => expect(calls('connectSave')).toEqual([{ momentId: 'a', enabled: true, time: '09:00', timeZone: 'America/New_York' }]));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Connect me on the day', 'Saved. Nexdo will call you Tue 6 Oct, 9:00 AM your time.', expect.any(Array)));
  });

  it('warns about a time outside 8:00 AM–9:30 PM and will not save it', async () => {
    const late = { ...preview, userLocal: 'Tue 6 Oct, 11:30 PM', userOk: false };
    serve({ connectStatus: status(VERIFIED, [state({ enabled: false })]), connectPreview: { time: '23:30', timeZone: 'America/New_York', nextCallAt: '', preview: late } });
    await render(<MomentConnectSection moments={[SAM]} />);
    await waitFor(() => expect(screen.getByTestId('connect-toggle-a')).toBeTruthy());
    jest.useFakeTimers();
    await fireEvent(screen.getByTestId('connect-toggle-a'), 'valueChange', true);
    await act(async () => {
      jest.advanceTimersByTime(350);
    });
    jest.useRealTimers();
    await waitFor(() => expect(screen.getByText('That’s Tue 6 Oct, 11:30 PM for you. Choose a time between 8:00 AM and 9:30 PM your time.')).toBeTruthy());
    expect(screen.getByTestId('connect-save-a').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('offers Connect now only on the day, verified, with a phone — and asks the server, never the phone, to call', async () => {
    serve({ connectStatus: status(VERIFIED, [state({ enabled: true, isToday: true, lastCall: { status: 'MISSED', date: '2030-09-20', at: '' } })]), connectNow: { callId: 'c1', status: 'dialing' } });
    await render(<MomentConnectSection moments={[SAM]} />);
    await waitFor(() => expect(screen.getByTestId('connect-now-a')).toBeTruthy());
    expect(screen.getByText('Last call (2030-09-20): You missed the call')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('connect-now-a'));
    await waitFor(() => expect(calls('connectNow')).toEqual([{ momentId: 'a' }]));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Connect me on the day', 'Calling you now. Answer and Nexdo will connect you.', expect.any(Array)));
  });
});

describe('Verify caller ID', () => {
  it('needs 8 digits, shows the code to type, and finishes when Twilio reports VERIFIED', async () => {
    let verified = false;
    serve({
      connectStatus: () => status(verified ? VERIFIED : {}),
      callerIdStart: { phone: '+14155550123', status: 'PENDING', validationCode: '123456' },
      callerIdStatus: () => {
        verified = true;
        return VERIFIED;
      },
    });
    await render(<MomentConnectSection moments={[SAM]} />);
    await waitFor(() => expect(screen.getByTestId('connect-verify-number')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('connect-verify-number'));
    expect(screen.getByText('Show my number')).toBeTruthy();
    expect(screen.getByText('Include your country code. Twilio will call this number once; you type a 6-digit code to prove it’s yours.')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('caller-id-phone'), '+1 415');
    expect(screen.getByTestId('caller-id-start').props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.changeText(screen.getByTestId('caller-id-phone'), '+1 415 555 0123');
    jest.useFakeTimers();
    await fireEvent.press(screen.getByTestId('caller-id-start'));
    expect(calls('callerIdStart')).toEqual([{ phone: '+1 415 555 0123' }]);
    await waitFor(() => expect(screen.getByTestId('caller-id-code').props.children).toBe('1 2 3 4 5 6'));
    expect(screen.getByText('Waiting for the call to finish…')).toBeTruthy();
    expect(screen.getByText('The verification call is in English.')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    jest.useRealTimers();
    await waitFor(() => expect(screen.getByText('Verified: +14155550123')).toBeTruthy());
    expect(calls('callerIdStatus')).toHaveLength(1);
  });

  it('says the verification failed, and offers to call again', async () => {
    serve({ connectStatus: status(), callerIdStart: { phone: '+14155550123', status: 'PENDING', validationCode: '654321' }, callerIdStatus: { callerId: { phone: '+14155550123', status: 'FAILED' } } });
    await render(<MomentConnectSection moments={[SAM]} />);
    await waitFor(() => expect(screen.getByTestId('connect-verify-number')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('connect-verify-number'));
    await fireEvent.changeText(screen.getByTestId('caller-id-phone'), '+14155550123');
    jest.useFakeTimers();
    await fireEvent.press(screen.getByTestId('caller-id-start'));
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    jest.useRealTimers();
    await waitFor(() => expect(screen.getByText('That didn’t work. Try again.')).toBeTruthy());
    expect(screen.getByTestId('caller-id-again')).toBeTruthy();
  });

  it('removes a verified number, turning connect calls off', async () => {
    serve({ connectStatus: status(VERIFIED), callerIdRemove: { removed: true } });
    await render(<MomentConnectSection moments={[SAM]} />);
    await waitFor(() => expect(screen.getByTestId('connect-change-number')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('connect-change-number'));
    expect(screen.getByText('Verified: +14155550123')).toBeTruthy();
    expect(screen.getByText('When Nexdo connects you, the person you call sees this number.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('caller-id-remove'));
    await waitFor(() => expect(calls('callerIdRemove')).toEqual([{}]));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Connect me on the day', 'Your number was removed and connect calls are off.', expect.any(Array)));
  });
});

describe('How it works', () => {
  it('walks through the three steps, wraps the title, and closes on Got it!', async () => {
    serve({ connectStatus: status() });
    await render(<MomentConnectSection moments={[SAM]} />);
    await waitFor(() => expect(screen.getByTestId('connect-how-it-works-a')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('connect-how-it-works-a'));
    expect(screen.getByText('How It Works')).toBeTruthy();
    const title = screen.getByText('We call for you on special days');
    // Swift truncates this to one line ("We call for you on s…"); it wraps here.
    expect(title.props.numberOfLines).toBeUndefined();
    for (const step of ['Set it up', 'We call you', 'You’re connected']) expect(screen.getByText(step)).toBeTruthy();
    expect(screen.getByText('• If you don’t answer or confirm, we won’t call your loved one.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('calling-guide-done'));
    await waitFor(() => expect(screen.queryByText('We call for you on special days')).toBeNull());
  });
});

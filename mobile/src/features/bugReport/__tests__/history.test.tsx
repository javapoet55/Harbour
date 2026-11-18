import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, Platform } from 'react-native';

import { ApiError } from '../../../api/client';
import type { BugReportSession } from '../coordinator';

const mockSubmit = jest.fn();
const mockHistory = jest.fn();
jest.mock('../../../api/feedback', () => ({
  ...jest.requireActual('../../../api/feedback'),
  bugReportApi: {
    submit: (...args: unknown[]) => mockSubmit(...args),
    history: (...args: unknown[]) => mockHistory(...args),
  },
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true), getStringAsync: jest.fn(async () => '') }));

import { bugReportApi } from '../../../api/feedback';
import { BugReportScreen } from '../BugReportScreen';
import { bugReportStatusTitle, historyFailureMessage } from '../model';

/**
 * fbe38a9 "Show open and closed bug reports in iOS settings" and a61b01a's detailed status
 * (ios/App/BugReportView.swift:21-22, :30, :40-59, :92-112, :229-303; Sources/NexdoCore/BugReport.swift:24-65).
 */

const DIAGNOSTICS = {
  appVersion: '1.0.1',
  buildNumber: '7',
  deviceModel: 'Pixel 8',
  iosVersion: '15',
  screen: 'settings' as const,
  timestamp: '2026-11-18T05:40:31Z',
  correlationID: '37251480-3ddd-4725-8e3b-14168521333e',
};
const FROM_SETTINGS: BugReportSession = { diagnostics: DIAGNOSTICS, capture: { kind: 'refused' } };
const FROM_TASKS: BugReportSession = { diagnostics: { ...DIAGNOSTICS, screen: 'tasks' }, capture: { kind: 'refused' } };

const REPORT = { id: 'f1', reference: 'BR-123456', description: 'The calendar froze on Monday.', createdAt: '2026-11-15T12:00:00.000Z', status: 'open' as const, detailedStatus: 'in_progress' };
const onDone = jest.fn();

async function show(session: BugReportSession = FROM_SETTINGS) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: 0 } } });
  await render(
    <QueryClientProvider client={queryClient}>
      <BugReportScreen onDone={onDone} session={session} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockSubmit.mockReset();
  mockHistory.mockReset();
  onDone.mockClear();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

describe('Report Bugs from Settings (Phase 15)', () => {
  it('opens on the history, titled Report Bugs, with Open selected and the open reports listed', async () => {
    mockHistory.mockResolvedValue({ reports: [REPORT], nextCursor: null });
    await show();

    expect(screen.getByText('Report Bugs')).toBeTruthy();
    expect(screen.queryByText('Report a bug?')).toBeNull();
    expect(screen.getByTestId('bug.history.status-open').props.accessibilityState.selected).toBe(true);
    await waitFor(() => expect(screen.getByText('The calendar froze on Monday.')).toBeTruthy());
    expect(mockHistory).toHaveBeenCalledWith('open', undefined);
    // `detailedStatus?.title ?? status.title` (a61b01a).
    expect(screen.getByText('In Progress')).toBeTruthy();
    expect(screen.getByText('Submitted Nov 15, 2026')).toBeTruthy();
    expect(screen.getByText('BR-123456')).toBeTruthy();
    expect(screen.getByTestId('bug.history.refresh')).toHaveTextContent('Refresh reports');
    expect(screen.queryByTestId('bug.history.more')).toBeNull();
    // The shake toggle moves under the list; Report Bug still opens the form.
    expect(screen.getByTestId('bug.shake')).toBeTruthy();
    expect(screen.getByTestId('bug.primary')).toHaveTextContent('Report Bug');
  });

  it('says "phone" in the shake toggle on Android', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    mockHistory.mockResolvedValue({ reports: [], nextCursor: null });
    await show();
    expect(screen.getByText('Shake phone to report a bug')).toBeTruthy();
  });

  it('switches to Closed and loads that list from the start', async () => {
    mockHistory.mockResolvedValueOnce({ reports: [REPORT], nextCursor: null }).mockResolvedValueOnce({ reports: [], nextCursor: null });
    await show();
    await waitFor(() => expect(screen.getByText('The calendar froze on Monday.')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('bug.history.status-closed'));

    await waitFor(() => expect(screen.getByText('No closed bug reports.')).toBeTruthy());
    expect(mockHistory).toHaveBeenLastCalledWith('closed', undefined);
    expect(screen.queryByText('The calendar froze on Monday.')).toBeNull();
  });

  it('says when there are no open reports', async () => {
    mockHistory.mockResolvedValue({ reports: [], nextCursor: null });
    await show();
    await waitFor(() => expect(screen.getByText('No open bug reports.')).toBeTruthy());
  });

  it('loads more from the cursor, and appends', async () => {
    mockHistory
      .mockResolvedValueOnce({ reports: [REPORT], nextCursor: '2026-11-15T18:30:00.000Z,f1' })
      .mockResolvedValueOnce({ reports: [{ ...REPORT, id: 'f0', reference: 'BR-000001', description: 'Older report.', detailedStatus: 'future' }], nextCursor: null });
    await show();
    await waitFor(() => expect(screen.getByTestId('bug.history.more')).toHaveTextContent('Load more reports'));

    await fireEvent.press(screen.getByTestId('bug.history.more'));

    await waitFor(() => expect(screen.getByText('Older report.')).toBeTruthy());
    expect(mockHistory).toHaveBeenLastCalledWith('open', '2026-11-15T18:30:00.000Z,f1');
    expect(screen.getByText('The calendar froze on Monday.')).toBeTruthy();
    expect(screen.getByText('Future')).toBeTruthy();
    expect(screen.queryByTestId('bug.history.more')).toBeNull();
  });

  it('shows a failed first load with Retry, and recovers', async () => {
    mockHistory.mockRejectedValueOnce(new ApiError({ status: 500, message: 'Request failed.' })).mockResolvedValueOnce({ reports: [REPORT], nextCursor: null });
    await show();
    await waitFor(() => expect(screen.getByTestId('bug.history.error')).toHaveTextContent('Couldn’t load your bug reports. Try again.'));
    expect(screen.getByTestId('bug.history.refresh')).toHaveTextContent('Retry');

    await fireEvent.press(screen.getByTestId('bug.history.refresh'));

    await waitFor(() => expect(screen.getByText('The calendar froze on Monday.')).toBeTruthy());
    expect(screen.queryByTestId('bug.history.error')).toBeNull();
  });

  it('after sending, Done returns to the history (Open) instead of closing', async () => {
    mockHistory.mockResolvedValue({ reports: [], nextCursor: null });
    mockSubmit.mockResolvedValue({ reference: 'BR-654321' });
    await show();
    await fireEvent.press(screen.getByTestId('bug.history.status-closed'));
    await fireEvent.press(screen.getByTestId('bug.primary'));
    await fireEvent.changeText(screen.getByTestId('bug.description'), 'Something broke.');
    await fireEvent.press(screen.getByTestId('bug.primary'));
    await waitFor(() => expect(screen.getByTestId('bug.reference')).toHaveTextContent('BR-654321'));
    expect(screen.queryByText('Report Bugs')).toBeNull();

    await fireEvent.press(screen.getByTestId('bug.primary'));

    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByText('Report Bugs')).toBeTruthy();
    expect(screen.getByTestId('bug.history.status-open').props.accessibilityState.selected).toBe(true);
    await waitFor(() => expect(mockHistory).toHaveBeenLastCalledWith('open', undefined));
  });

  it('keeps the introduction, and Done closing, everywhere else', async () => {
    mockSubmit.mockResolvedValue({ reference: 'BR-654321' });
    await show(FROM_TASKS);
    expect(screen.getByText('Report a bug?')).toBeTruthy();
    expect(screen.queryByText('Report Bugs')).toBeNull();
    expect(mockHistory).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('bug.primary'));
    await fireEvent.changeText(screen.getByTestId('bug.description'), 'Something broke.');
    await fireEvent.press(screen.getByTestId('bug.primary'));
    await waitFor(() => expect(screen.getByTestId('bug.reference')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('bug.primary'));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe('the history’s pure parts', () => {
  it('titles each status as Swift, falling back to Open / Closed', () => {
    expect(bugReportStatusTitle({ status: 'open', detailedStatus: 'open' })).toBe('Open');
    expect(bugReportStatusTitle({ status: 'open', detailedStatus: 'in_progress' })).toBe('In Progress');
    expect(bugReportStatusTitle({ status: 'open', detailedStatus: 'future' })).toBe('Future');
    expect(bugReportStatusTitle({ status: 'closed', detailedStatus: 'not_applicable' })).toBe('Not Applicable');
    expect(bugReportStatusTitle({ status: 'closed', detailedStatus: 'closed' })).toBe('Closed');
    expect(bugReportStatusTitle({ status: 'closed' })).toBe('Closed');
    // An unknown status keeps the page (Swift would fail the whole decode, §25 Swift bug 8).
    expect(bugReportStatusTitle({ status: 'open', detailedStatus: 'triaged' })).toBe('Open');
  });

  it('words each failure as Swift', () => {
    expect(historyFailureMessage(new ApiError({ status: 401, code: 'SIGNED_OUT', message: 'x' }))).toBe('Your session has expired. Sign in again to view your reports.');
    expect(historyFailureMessage(new ApiError({ status: 404, message: 'x' }))).toBe('Report history is unavailable on this server.');
    expect(historyFailureMessage(new ApiError({ status: 405, message: 'x' }))).toBe('Report history is unavailable on this server.');
    expect(historyFailureMessage(new ApiError({ status: 0, code: 'NETWORK', message: 'x' }))).toBe('Couldn’t load your bug reports. Try again.');
    expect(historyFailureMessage(new Error('x'))).toBe('Couldn’t load your bug reports. Try again.');
  });

  it('asks the server for one status, with the cursor encoded', async () => {
    const get = jest.fn(async () => ({ reports: [], nextCursor: null }));
    const actual = jest.requireActual('../../../api/feedback') as typeof import('../../../api/feedback');
    await actual.bugReportApi.history('closed', '2026-11-15T18:30:00.000Z,f1', { get } as never);
    expect(get).toHaveBeenCalledWith('/api/feedback/bugs?status=closed&cursor=2026-11-15T18%3A30%3A00.000Z%2Cf1');
    await actual.bugReportApi.history('open', undefined, { get } as never);
    expect(get).toHaveBeenLastCalledWith('/api/feedback/bugs?status=open');
    expect(bugReportApi.history).toBeDefined();
  });
});

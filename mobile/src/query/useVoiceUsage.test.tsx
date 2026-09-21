import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react-native';

import type { Profile, VoiceUsage } from '../api';
import { useSession } from '../store/session';
import { queryKeys } from './keys';

const mockVoiceUsage = jest.fn();
const mockRecord = jest.fn();
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  endpoints: {
    voiceUsage: (...args: unknown[]) => mockVoiceUsage(...args),
    recordVoiceUsage: (...args: unknown[]) => mockRecord(...args),
  },
}));

import { recordVoiceUsage, useVoiceUsage } from './useVoiceUsage';

const RECEIPT: VoiceUsage = { month: '2026-09', usedSeconds: 75, limitMinutes: 100, remainingSeconds: 5925, asOf: '2026-09-21T10:00:00.000Z' };

function signIn(id: string) {
  useSession.getState().setProfile({ id, name: 'Ada', email: 'ada@example.com', timeZone: 'UTC' } as Profile);
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

beforeEach(() => {
  mockVoiceUsage.mockReset();
  mockRecord.mockReset();
  useSession.getState().clear();
});

describe('useVoiceUsage', () => {
  it('loads the receipt under the signed-in account', async () => {
    signIn('u1');
    mockVoiceUsage.mockResolvedValue(RECEIPT);
    const queryClient = makeClient();
    const seen: (VoiceUsage | undefined)[] = [];
    function Probe() {
      seen.push(useVoiceUsage().data);
      return null;
    }
    await render(
      <QueryClientProvider client={queryClient}>
        <Probe />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(seen.at(-1)).toEqual(RECEIPT));
    expect(queryClient.getQueryData(queryKeys.voiceUsage('u1'))).toEqual(RECEIPT);
  });

  it('does not ask while signed out', async () => {
    const queryClient = makeClient();
    function Probe() {
      useVoiceUsage();
      return null;
    }
    await render(
      <QueryClientProvider client={queryClient}>
        <Probe />
      </QueryClientProvider>,
    );
    expect(mockVoiceUsage).not.toHaveBeenCalled();
  });
});

describe('recordVoiceUsage', () => {
  it('posts the cumulative seconds and keeps the answer for the same account', async () => {
    signIn('u1');
    mockRecord.mockResolvedValue(RECEIPT);
    const queryClient = makeClient();
    await recordVoiceUsage(queryClient, 'S1', 75);
    expect(mockRecord).toHaveBeenCalledWith({ sessionId: 'S1', durationSeconds: 75 });
    expect(queryClient.getQueryData(queryKeys.voiceUsage('u1'))).toEqual(RECEIPT);
  });

  it('drops an answer that arrives after the account changed (Swift’s owner check)', async () => {
    signIn('u1');
    mockRecord.mockImplementation(async () => {
      signIn('u2');
      return RECEIPT;
    });
    const queryClient = makeClient();
    await recordVoiceUsage(queryClient, 'S1', 75);
    expect(queryClient.getQueryData(queryKeys.voiceUsage('u1'))).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.voiceUsage('u2'))).toBeUndefined();
  });

  it('sends nothing for zero seconds and swallows a failure', async () => {
    signIn('u1');
    const queryClient = makeClient();
    await recordVoiceUsage(queryClient, 'S1', 0);
    expect(mockRecord).not.toHaveBeenCalled();
    mockRecord.mockRejectedValue(new Error('offline'));
    await expect(recordVoiceUsage(queryClient, 'S1', 15)).resolves.toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.voiceUsage('u1'))).toBeUndefined();
  });
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react-native';

import type { Profile } from '../api';
import { useConsent } from '../store/consent';
import { useSession } from '../store/session';
import type { ConversationOptions, VoicePhase } from './conversation';

/**
 * The voice-usage wiring of `useVoiceSession`: `AddTaskByVoiceView`'s clock handler and
 * `voice.onTelemetry` (ios/App/AddTaskByVoiceView.swift:125-138). The conversation, transport and
 * executor are stand-ins; the meter and the hook's lifecycle are real.
 */

const mockRecord = jest.fn(async () => undefined);
jest.mock('../query/useVoiceUsage', () => ({ recordVoiceUsage: (...args: unknown[]) => mockRecord(...(args as [])) }));
jest.mock('../query/useProfile', () => ({ synchronizeDeviceTimeZone: jest.fn(async () => undefined) }));
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  getApi: () => ({ request: jest.fn(async () => ({ value: 'ek', expiresAt: 9e9, model: 'm' })) }),
}));
jest.mock('./nativeDriver', () => ({ isWebRtcAvailable: () => true, createNativeDriver: () => ({}) }));
jest.mock('./transport', () => ({ WebRtcTransport: jest.fn().mockImplementation(() => ({ applyVolume: jest.fn() })) }));
jest.mock('./toolExecutor', () => ({ VoiceToolExecutor: jest.fn().mockImplementation(() => ({ clear: jest.fn() })) }));

type FakeConversation = { options: ConversationOptions; phase: VoicePhase; closed: boolean };
const mockConversations: FakeConversation[] = [];
jest.mock('./conversation', () => {
  const actual = jest.requireActual('./conversation');
  class VoiceConversation {
    private readonly fake: FakeConversation;
    constructor(options: ConversationOptions) {
      this.fake = { options, phase: 'idle', closed: false };
      mockConversations.push(this.fake);
    }
    get snapshot() {
      return { ...actual.INITIAL_STATE, phase: this.fake.phase };
    }
    start() {
      this.fake.phase = 'connecting';
    }
    tick() {}
    background() {}
    toggleMute() {}
    finish() {}
    close() {
      if (this.fake.closed) return;
      this.fake.closed = true;
      this.fake.options.onTelemetry?.({} as never);
      this.fake.phase = 'disconnected';
    }
  }
  return { ...actual, VoiceConversation };
});

import { useVoiceSession } from './useVoiceSession';

function Probe() {
  useVoiceSession({ scope: 'tasks' as never, enabled: true, onClose: () => undefined });
  return null;
}

beforeEach(() => {
  jest.useFakeTimers();
  mockRecord.mockClear();
  mockConversations.length = 0;
  useConsent.getState().setConsent({ ai: true, voice: true });
  useSession.getState().setProfile({ id: 'u1', name: 'Ada', email: 'ada@example.com', timeZone: 'UTC' } as Profile);
});

afterEach(() => {
  jest.useRealTimers();
});

async function mount() {
  const queryClient = new QueryClient();
  const view = await render(
    <QueryClientProvider client={queryClient}>
      <Probe />
    </QueryClientProvider>,
  );
  await act(async () => {
    await Promise.resolve();
  });
  return { view, queryClient, conversation: mockConversations[0] };
}

async function seconds(count: number) {
  await act(async () => {
    jest.advanceTimersByTime(count * 1000);
  });
}

describe('useVoiceSession voice metering', () => {
  it('meters active seconds on the clock and posts every 15 under one session id', async () => {
    const { queryClient, conversation } = await mount();
    conversation.phase = 'connecting';
    await seconds(10);
    expect(mockRecord).not.toHaveBeenCalled();
    conversation.phase = 'listening';
    await seconds(15);
    expect(mockRecord).toHaveBeenCalledTimes(1);
    const [client, sessionId, duration] = mockRecord.mock.calls[0] as unknown as [QueryClient, string, number];
    expect(client).toBe(queryClient);
    expect(sessionId).toBe('TEST-NONCE');
    expect(duration).toBe(15);
    conversation.phase = 'assistantSpeaking';
    await seconds(15);
    expect(mockRecord).toHaveBeenLastCalledWith(queryClient, 'TEST-NONCE', 30);
  });

  it('posts the total once more when the session ends, through onTelemetry', async () => {
    const { view, queryClient, conversation } = await mount();
    conversation.phase = 'userSpeaking';
    await seconds(20);
    expect(mockRecord).toHaveBeenCalledTimes(1);
    await act(async () => view.unmount());
    expect(conversation.closed).toBe(true);
    expect(mockRecord).toHaveBeenLastCalledWith(queryClient, 'TEST-NONCE', 20);
    expect(mockRecord).toHaveBeenCalledTimes(2);
  });

  it('reports nothing for a session that never went live', async () => {
    const { view, conversation } = await mount();
    conversation.phase = 'connecting';
    await seconds(30);
    await act(async () => view.unmount());
    expect(mockRecord).not.toHaveBeenCalled();
  });
});

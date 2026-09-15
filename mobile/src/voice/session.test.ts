import { OPENAI_CALLS_URL, UNCONFIRMED_TOOL_RESULT } from './protocol';
import { VoiceSession, type DataChannelLike, type PeerLike, type StreamLike, type VoiceLatency, type VoiceStatus } from './session';

// WebRTC is fully faked: these tests exercise the PoC's call sequence and turn-taking, not native code.

const SECRET = { value: 'ek_secret', expiresAt: 2_000_000_000, model: 'gpt-realtime-2.1' };
const SESSION_ID = '11111111-1111-4111-8111-111111111111';

type Handler = (event: { data?: unknown; track?: { kind?: string } | null }) => void;

class FakeChannel implements DataChannelLike {
  readyState = 'connecting';
  sent: Record<string, unknown>[] = [];
  closed = false;
  private handlers: Record<string, Handler[]> = {};
  constructor(readonly label: string, readonly init: { ordered: boolean }) {}
  addEventListener(type: string, listener: Handler) {
    (this.handlers[type] ??= []).push(listener);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.closed = true;
    this.readyState = 'closed';
  }
  open() {
    this.readyState = 'open';
    this.handlers.open?.forEach((h) => h({}));
  }
  message(event: object) {
    this.handlers.message?.forEach((h) => h({ data: JSON.stringify(event) }));
  }
  sentTypes() {
    return this.sent.map((event) => event.type);
  }
}

class FakePeer implements PeerLike {
  connectionState = 'new';
  iceConnectionState = 'new';
  channel?: FakeChannel;
  closed = false;
  remote?: { type: string; sdp: string };
  private handlers: Record<string, Handler[]> = {};
  constructor(private readonly calls: string[]) {}
  addEventListener(type: string, listener: Handler) {
    (this.handlers[type] ??= []).push(listener);
  }
  addTrack() {
    this.calls.push('addTrack');
    return {};
  }
  createDataChannel(label: string, init: { ordered: boolean }) {
    this.calls.push(`createDataChannel:${label}`);
    this.channel = new FakeChannel(label, init);
    return this.channel;
  }
  async createOffer(options: { offerToReceiveAudio: boolean }) {
    this.calls.push(`createOffer:${options.offerToReceiveAudio}`);
    return { type: 'offer', sdp: 'v=0\r\no=offer' };
  }
  async setLocalDescription() {
    this.calls.push('setLocalDescription');
  }
  async setRemoteDescription(description: { type: 'answer'; sdp: string }) {
    this.calls.push('setRemoteDescription');
    this.remote = description;
  }
  close() {
    this.closed = true;
  }
  ice(state: string) {
    this.iceConnectionState = state;
    this.handlers.iceconnectionstatechange?.forEach((h) => h({}));
  }
}

function setup(options: { toolResult?: () => Promise<unknown>; session?: unknown; sdpStatus?: number } = {}) {
  const calls: string[] = [];
  const peers: FakePeer[] = [];
  const tracks: { kind: string; stop: jest.Mock }[] = [];
  let clock = 1_000;
  const statuses: VoiceStatus[] = [];
  let latency: VoiceLatency = {};

  const post = jest.fn(async (path: string, body?: unknown) => {
    calls.push(`post:${path}`);
    if (path === '/api/realtime/task-session') return options.session ?? SECRET;
    return options.toolResult ? options.toolResult() : { success: true, task: { id: 'task_1', title: (body as { arguments: { title?: string } }).arguments.title } };
  });
  const fetch = jest.fn(async (url: string) => {
    calls.push(`fetch:${url}`);
    return { status: options.sdpStatus ?? 201, text: async () => (options.sdpStatus && options.sdpStatus >= 300 ? 'denied' : 'v=0\r\no=answer') };
  }) as unknown as jest.Mock & typeof globalThis.fetch;
  const audioRoute = { start: jest.fn(() => calls.push('route:start')), stop: jest.fn(() => calls.push('route:stop')) };
  let uuidCount = 0;

  const session = new VoiceSession({
    api: { post: post as never },
    fetch,
    now: () => clock,
    uuid: () => (uuidCount++ === 0 ? SESSION_ID : `22222222-2222-4222-8222-22222222222${uuidCount}`),
    onStatus: (status) => statuses.push(status),
    onLatency: (value) => (latency = value),
    driver: {
      createPeer: () => {
        const peer = new FakePeer(calls);
        peers.push(peer);
        return peer;
      },
      getMicrophone: async () => {
        calls.push('getMicrophone');
        const track = { kind: 'audio', stop: jest.fn() };
        tracks.push(track);
        const stream: StreamLike = { getTracks: () => [track], getAudioTracks: () => [track], release: jest.fn() };
        return stream;
      },
      audioRoute,
    },
  });

  return {
    session,
    calls,
    post,
    fetch,
    peers,
    tracks,
    audioRoute,
    statuses,
    latency: () => latency,
    tick: (ms: number) => (clock += ms),
    peer: () => peers[peers.length - 1],
    channel: () => peers[peers.length - 1].channel!,
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function connected(options?: Parameters<typeof setup>[0]) {
  const t = setup(options);
  await t.session.start();
  t.tick(850);
  t.channel().open();
  return t;
}

describe('VoiceSession start', () => {
  it('follows the Swift transport sequence', async () => {
    const t = setup();
    await t.session.start();

    expect(t.calls).toEqual([
      'post:/api/realtime/task-session',
      'getMicrophone',
      'route:start',
      'addTrack',
      'createDataChannel:oai-events',
      'createOffer:true',
      'setLocalDescription',
      `fetch:${OPENAI_CALLS_URL}`,
      'setRemoteDescription',
    ]);
    expect(t.post).toHaveBeenCalledWith('/api/realtime/task-session', { consent: true, scope: 'general' }, { timeoutMs: 25_000 });
    expect(t.channel().init).toEqual({ ordered: true });
    expect(t.fetch.mock.calls[0][1]).toMatchObject({ headers: { Authorization: 'Bearer ek_secret' }, body: 'v=0\r\no=offer' });
    expect(t.peer().remote).toEqual({ type: 'answer', sdp: 'v=0\r\no=answer' });
    expect(t.session.currentStatus).toBe('starting');
  });

  it('is connected when the data channel opens and records the latency', async () => {
    const t = await connected();
    expect(t.session.currentStatus).toBe('connected');
    expect(t.latency().channelOpenMs).toBe(850);
    t.tick(150);
    t.channel().message({ type: 'session.created', session: {} });
    expect(t.latency().sessionCreatedMs).toBe(1000);
  });

  it('fails cleanly when OpenAI rejects the offer', async () => {
    const t = setup({ sdpStatus: 401 });
    await t.session.start();
    expect(t.session.currentStatus).toBe('failed');
    expect(t.peer().closed).toBe(true);
    expect(t.tracks[0].stop).toHaveBeenCalled();
    expect(t.audioRoute.stop).toHaveBeenCalled();
  });

  it('fails before opening the microphone when the secret has expired', async () => {
    const t = setup({ session: { ...SECRET, expiresAt: 1 } });
    await t.session.start();
    expect(t.session.currentStatus).toBe('failed');
    expect(t.calls).toEqual(['post:/api/realtime/task-session']);
  });

  it('fails when ICE disconnects, like the Swift transport', async () => {
    const t = await connected();
    t.peer().ice('disconnected');
    expect(t.session.currentStatus).toBe('failed');
    expect(t.channel().closed).toBe(true);
  });
});

describe('turn-taking', () => {
  it('asks for a reply after each committed user turn, once', async () => {
    const t = await connected();
    t.channel().message({ type: 'input_audio_buffer.committed', item_id: 'item_1' });
    t.channel().message({ type: 'input_audio_buffer.committed', item_id: 'item_1' });
    expect(t.channel().sentTypes()).toEqual(['response.create']);
  });

  it('waits for the active response before asking again', async () => {
    const t = await connected();
    t.channel().message({ type: 'input_audio_buffer.committed', item_id: 'item_1' });
    t.channel().message({ type: 'response.created', response: { id: 'resp_1' } });
    t.channel().message({ type: 'input_audio_buffer.committed', item_id: 'item_2' });
    expect(t.channel().sentTypes()).toEqual(['response.create']);
    t.channel().message({ type: 'response.done', response: { id: 'resp_1', status: 'completed', output: [] } });
    expect(t.channel().sentTypes()).toEqual(['response.create', 'response.create']);
  });

  it('measures end of speech to first audio', async () => {
    const t = await connected();
    t.channel().message({ type: 'input_audio_buffer.speech_stopped' });
    t.tick(640);
    t.channel().message({ type: 'output_audio_buffer.started', response_id: 'resp_1' });
    expect(t.latency().lastReplyMs).toBe(640);
  });
});

describe('tool calls', () => {
  const done = (output: object[]) => ({ type: 'response.done', response: { id: 'resp_1', status: 'completed', output } });

  it('posts the call to /api/realtime/tool, returns the result, then asks for a reply', async () => {
    const t = await connected();
    t.channel().message({ type: 'response.created', response: { id: 'resp_1' } });
    t.channel().message(done([{ type: 'function_call', call_id: 'call_a', name: 'create_task', arguments: '{"title":"Test","scheduledAt":"2026-09-16T15:00:00-07:00","durationMin":30}' }]));
    await flush();

    expect(t.post).toHaveBeenCalledWith(
      '/api/realtime/tool',
      {
        consent: true,
        scope: 'general',
        sessionId: SESSION_ID,
        callId: 'call_a',
        name: 'create_task',
        arguments: { title: 'Test', scheduledAt: '2026-09-16T15:00:00-07:00', durationMin: 30 },
      },
      { timeoutMs: 30_000 },
    );
    expect(t.channel().sent).toEqual([
      { type: 'conversation.item.create', item: { type: 'function_call_output', call_id: 'call_a', output: '{"success":true,"task":{"id":"task_1","title":"Test"}}' } },
      { type: 'response.create', response: {} },
    ]);
  });

  it('resolves taskId "last" from an earlier result and ignores repeated call IDs', async () => {
    const t = await connected();
    t.channel().message(done([{ type: 'function_call', call_id: 'call_a', name: 'create_task', arguments: '{"title":"Test"}' }]));
    await flush();
    t.channel().message(done([{ type: 'function_call', call_id: 'call_b', name: 'update_task', arguments: '{"taskId":"last","durationMin":45}' }]));
    await flush();
    t.channel().message(done([{ type: 'function_call', call_id: 'call_b', name: 'update_task', arguments: '{"taskId":"last","durationMin":45}' }]));
    await flush();

    const toolCalls = t.post.mock.calls.filter(([path]) => path === '/api/realtime/tool');
    expect(toolCalls).toHaveLength(2);
    expect(toolCalls[1][1]).toMatchObject({ name: 'update_task', arguments: { taskId: 'task_1', durationMin: 45 } });
  });

  it('sends the unconfirmed result when the tool request fails', async () => {
    const t = await connected({ toolResult: () => Promise.reject(new Error('500')) });
    t.channel().message(done([{ type: 'function_call', call_id: 'call_a', name: 'delete_task', arguments: '{"taskId":"task_1"}' }]));
    await flush();
    expect(t.channel().sent[0]).toEqual({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: 'call_a', output: UNCONFIRMED_TOOL_RESULT } });
  });

  it('answers set_conversation_context on the device', async () => {
    const t = await connected();
    t.channel().message(done([{ type: 'function_call', call_id: 'call_a', name: 'set_conversation_context', arguments: '{"question":"schedule","pendingIntent":"x"}' }]));
    await flush();
    expect(t.post.mock.calls.some(([path]) => path === '/api/realtime/tool')).toBe(false);
    expect(t.channel().sent[0]).toMatchObject({ item: { call_id: 'call_a', output: '{"success":true}' } });
  });
});

describe('stop', () => {
  it('closes the channel, stops the microphone and closes the peer', async () => {
    const t = await connected();
    t.session.stop();
    expect(t.channel().closed).toBe(true);
    expect(t.tracks[0].stop).toHaveBeenCalled();
    expect(t.peer().closed).toBe(true);
    expect(t.audioRoute.stop).toHaveBeenCalledTimes(1);
    expect(t.session.currentStatus).toBe('idle');
  });

  it('ignores events that arrive after stop', async () => {
    const t = await connected();
    const channel = t.channel();
    t.session.stop();
    channel.readyState = 'open';
    channel.message({ type: 'input_audio_buffer.committed', item_id: 'late' });
    expect(channel.sent).toEqual([]);
  });

  it('can start again with a new peer connection and session ID', async () => {
    const t = await connected();
    t.channel().message({ type: 'response.done', response: { id: 'r', status: 'completed', output: [{ type: 'function_call', call_id: 'call_a', name: 'create_task', arguments: '{"title":"A"}' }] } });
    await flush();
    t.session.stop();

    await t.session.start();
    t.channel().open();
    expect(t.peers).toHaveLength(2);
    expect(t.session.currentStatus).toBe('connected');
    expect(t.session.currentSessionId).not.toBe(SESSION_ID);
    // State from the first conversation does not leak: the same call ID runs again, and "last" is unknown.
    t.channel().message({ type: 'response.done', response: { id: 'r2', status: 'completed', output: [{ type: 'function_call', call_id: 'call_a', name: 'update_task', arguments: '{"taskId":"last"}' }] } });
    await flush();
    expect(t.channel().sent[0]).toMatchObject({ item: { call_id: 'call_a', output: UNCONFIRMED_TOOL_RESULT } });
  });

  it('abandons a start that is stopped midway', async () => {
    const t = setup();
    const starting = t.session.start();
    t.session.stop();
    await starting;
    expect(t.session.currentStatus).toBe('idle');
    expect(t.calls).not.toContain('createOffer:true');
  });
});

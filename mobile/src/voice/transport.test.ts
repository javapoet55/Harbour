import { WebRtcTransport, VOICE_OUTPUT_GAIN, type DataChannelLike, type PeerLike, type StreamLike, type TrackLike, type WebRtcDriver } from './transport';

/** `VoiceWebRTCTransport` (ios/App/VoiceWebRTCTransport.swift:5-146), with the natives faked. */

const CREDENTIAL = { value: 'ephemeral-secret', expiresAt: 2_000_000_000, model: 'gpt-realtime' };

function track(kind = 'audio'): TrackLike {
  return { kind, enabled: true, stop: jest.fn() };
}

function harness({ answer = 'v=0\r\n', status = 200 } = {}) {
  const listeners = new Map<string, ((event: never) => void)[]>();
  const channel: DataChannelLike & { sent: string[] } = {
    readyState: 'open',
    sent: [],
    send(data) {
      this.sent.push(data);
    },
    close: jest.fn(),
    addEventListener: (type, listener) => {
      listeners.set(`channel:${type}`, [...(listeners.get(`channel:${type}`) ?? []), listener as never]);
    },
  };
  const microphoneTrack = track();
  const microphone: StreamLike = {
    getTracks: () => [microphoneTrack],
    getAudioTracks: () => [microphoneTrack],
    release: jest.fn(),
  };
  const remoteTrack = track();

  const peer: PeerLike = {
    iceConnectionState: 'connected',
    addTrack: jest.fn(),
    createDataChannel: jest.fn(() => channel),
    createOffer: jest.fn(async () => ({ type: 'offer', sdp: 'v=0 offer' })),
    setLocalDescription: jest.fn(async () => undefined),
    setRemoteDescription: jest.fn(async () => undefined),
    addEventListener: (type, listener) => {
      listeners.set(`peer:${type}`, [...(listeners.get(`peer:${type}`) ?? []), listener as never]);
    },
    close: jest.fn(),
  };

  const audioRoute = { start: jest.fn(), stop: jest.fn(), setVolume: jest.fn() };
  const driver: WebRtcDriver = { createPeer: () => peer, getMicrophone: async () => microphone, audioRoute };

  const fetchImpl = jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => answer,
  })) as unknown as typeof fetch;

  let volume = 1;
  const transport = new WebRtcTransport({ driver, fetchImpl, volume: () => volume });
  const received: unknown[] = [];
  transport.onEvent = (data) => received.push(data);
  const failed = jest.fn();
  transport.onFailure = failed;

  return {
    transport,
    peer,
    channel,
    microphoneTrack,
    remoteTrack,
    audioRoute,
    fetchImpl: fetchImpl as unknown as jest.Mock,
    received,
    failed,
    setVolume: (value: number) => {
      volume = value;
    },
    fire: (key: string, event: unknown) => {
      for (const listener of listeners.get(key) ?? []) (listener as (value: unknown) => void)(event);
    },
    addRemote: () => {
      for (const listener of listeners.get('peer:track') ?? []) (listener as (value: unknown) => void)({ track: remoteTrack });
    },
  };
}

describe('connecting', () => {
  it('follows Swift’s order and POSTs the offer to OpenAI with the ephemeral secret', async () => {
    const context = harness();

    await context.transport.connect(CREDENTIAL);

    expect(context.audioRoute.start).toHaveBeenCalled();
    expect(context.peer.addTrack).toHaveBeenCalledWith(context.microphoneTrack, expect.anything());
    expect(context.peer.createDataChannel).toHaveBeenCalledWith('oai-events', { ordered: true });
    const [url, init] = context.fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/realtime/calls');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer ephemeral-secret', 'Content-Type': 'application/sdp' });
    // No Nexdo cookie goes to OpenAI: Swift uses an ephemeral URLSession.
    expect(init.credentials).toBe('omit');
    expect(init.body).toBe('v=0 offer');
    expect(context.peer.setRemoteDescription).toHaveBeenCalledWith({ type: 'answer', sdp: 'v=0\r\n' });
  });

  it('throws when OpenAI rejects the offer', async () => {
    const context = harness({ status: 401, answer: 'nope' });
    await expect(context.transport.connect(CREDENTIAL)).rejects.toThrow(/rejected the SDP offer/);
  });

  it('applies the ×3 output gain at connect', async () => {
    const context = harness();
    context.setVolume(0.5);

    await context.transport.connect(CREDENTIAL);

    expect(context.audioRoute.setVolume).toHaveBeenCalledWith(0.5 * VOICE_OUTPUT_GAIN);
  });
});

describe('sending', () => {
  it('serialises the event onto the data channel', async () => {
    const context = harness();
    await context.transport.connect(CREDENTIAL);

    context.transport.send({ type: 'response.create', response: {} });

    expect(JSON.parse(context.channel.sent[0])).toEqual({ type: 'response.create', response: {} });
  });

  it('throws when the channel is not open, so the session fails rather than dropping the event', async () => {
    const context = harness();
    await context.transport.connect(CREDENTIAL);
    context.channel.readyState = 'closed';

    expect(() => context.transport.send({ type: 'ping' })).toThrow(/not open/);
  });
});

describe('mute and playback', () => {
  it('mute disables the MICROPHONE track', async () => {
    const context = harness();
    await context.transport.connect(CREDENTIAL);

    context.transport.setMuted(true);
    expect(context.microphoneTrack.enabled).toBe(false);

    context.transport.setMuted(false);
    expect(context.microphoneTrack.enabled).toBe(true);
  });

  it('silencePlayback disables the REMOTE track', async () => {
    const context = harness();
    await context.transport.connect(CREDENTIAL);
    context.addRemote();

    context.transport.silencePlayback();

    expect(context.remoteTrack.enabled).toBe(false);
  });

  /** `deliver(_:)` (VoiceWebRTCTransport.swift:107-116): a barge-in must not mute every later reply. */
  it('un-silences when a NEW response starts playing, but not the interrupted one', async () => {
    const context = harness();
    await context.transport.connect(CREDENTIAL);
    context.addRemote();

    context.fire('channel:message', { data: JSON.stringify({ type: 'response.created', response: { id: 'r1' } }) });
    context.transport.silencePlayback();

    context.fire('channel:message', { data: JSON.stringify({ type: 'output_audio_buffer.started', response_id: 'r1' }) });
    expect(context.remoteTrack.enabled).toBe(false);

    context.fire('channel:message', { data: JSON.stringify({ type: 'response.created', response: { id: 'r2' } }) });
    context.fire('channel:message', { data: JSON.stringify({ type: 'output_audio_buffer.started', response_id: 'r2' }) });
    expect(context.remoteTrack.enabled).toBe(true);
  });

  it('passes every frame through to the session', async () => {
    const context = harness();
    await context.transport.connect(CREDENTIAL);

    context.fire('channel:message', { data: '{"type":"session.created"}' });

    expect(context.received).toEqual(['{"type":"session.created"}']);
  });
});

describe('failures and teardown', () => {
  it('reports a closed data channel as a failure', async () => {
    const context = harness();
    await context.transport.connect(CREDENTIAL);

    context.fire('channel:close', {});

    expect(context.failed).toHaveBeenCalled();
  });

  it('reports a failed ICE connection', async () => {
    const context = harness();
    await context.transport.connect(CREDENTIAL);
    (context.peer as { iceConnectionState?: string }).iceConnectionState = 'failed';

    context.fire('peer:iceconnectionstatechange', {});

    expect(context.failed).toHaveBeenCalled();
  });

  it('close stops the microphone, the peer and the audio route', async () => {
    const context = harness();
    await context.transport.connect(CREDENTIAL);

    context.transport.close();

    expect(context.microphoneTrack.stop).toHaveBeenCalled();
    expect(context.peer.close).toHaveBeenCalled();
    expect(context.channel.close).toHaveBeenCalled();
    expect(context.audioRoute.stop).toHaveBeenCalled();
  });

  it('a frame arriving after close reaches nobody', async () => {
    const context = harness();
    await context.transport.connect(CREDENTIAL);
    context.transport.close();

    context.fire('channel:message', { data: '{"type":"session.created"}' });

    expect(context.received).toEqual([]);
  });

  it('runs the completion only after the audio session is released', async () => {
    const context = harness();
    await context.transport.connect(CREDENTIAL);
    const done = jest.fn();

    context.transport.closeAfterReleasingAudio(done);
    expect(done).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(done).toHaveBeenCalled();
  });
});

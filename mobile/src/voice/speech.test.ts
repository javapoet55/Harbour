import { createAudioPlayer } from 'expo-audio';

import { useAppearance } from '../store/appearance';
import { fetchSpeech, playSpeech } from './speech';

jest.mock('../config', () => ({ getApiUrl: () => 'https://api.example.com' }));

const mockedCreatePlayer = createAudioPlayer as unknown as jest.Mock;

/** `VoicePlayback` (ios/App/VoicePlayback.swift) and `speakChunks` (ios/App/AskNexdoView.swift:428-445). */

function audioResponse(ok = true, type = 'audio/mpeg') {
  return {
    ok,
    status: ok ? 200 : 500,
    headers: { get: () => type },
    arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 0xff]).buffer,
  } as unknown as Response;
}

beforeEach(() => {
  jest.clearAllMocks();
  useAppearance.setState({ appearance: 'system', voiceVolume: 1 });
});

describe('fetchSpeech', () => {
  it('POSTs the text to /api/speech with the session cookie', async () => {
    const fetchImpl = jest.fn(async () => audioResponse()) as unknown as typeof fetch;

    await fetchSpeech('Read this aloud', fetchImpl);

    const [url, init] = (fetchImpl as unknown as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.com/api/speech');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(String(init.body))).toEqual({ text: 'Read this aloud' });
  });

  /** `expectedMimeType: "audio/mpeg"` (NexdoApp.swift:685): a JSON error page is not audio. */
  it('refuses a response that is not audio', async () => {
    const json = jest.fn(async () => audioResponse(true, 'application/json')) as unknown as typeof fetch;
    await expect(fetchSpeech('x', json)).rejects.toThrow(/could not play the voice response/);

    const failed = jest.fn(async () => audioResponse(false)) as unknown as typeof fetch;
    await expect(fetchSpeech('x', failed)).rejects.toThrow(/could not play the voice response/);
  });
});

describe('playSpeech', () => {
  function player() {
    const listeners: ((status: { didJustFinish: boolean }) => void)[] = [];
    const instance = {
      volume: 1,
      play: jest.fn(),
      remove: jest.fn(),
      addListener: jest.fn((_event: string, listener: (status: { didJustFinish: boolean }) => void) => {
        listeners.push(listener);
        return { remove: jest.fn() };
      }),
    };
    return { instance, finish: () => listeners.forEach((listener) => listener({ didJustFinish: true })) };
  }

  async function settle() {
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
  }

  it('plays each chunk in order, one request at a time', async () => {
    const first = player();
    const second = player();
    mockedCreatePlayer.mockReturnValueOnce(first.instance).mockReturnValueOnce(second.instance);
    const fetchImpl = jest.fn(async () => audioResponse()) as unknown as typeof fetch;
    const handlers = { onPreparing: jest.fn(), onPlaying: jest.fn(), onFinished: jest.fn(), onError: jest.fn() };

    playSpeech(['one', 'two'], handlers, fetchImpl);
    await settle();

    expect((fetchImpl as unknown as jest.Mock)).toHaveBeenCalledTimes(1);
    expect(first.instance.play).toHaveBeenCalled();
    expect(handlers.onPlaying).toHaveBeenCalledWith(true);

    first.finish();
    await settle();

    expect((fetchImpl as unknown as jest.Mock)).toHaveBeenCalledTimes(2);
    expect(second.instance.play).toHaveBeenCalled();

    second.finish();
    await settle();
    expect(handlers.onFinished).toHaveBeenCalled();
  });

  /** `next.volume = Float(AppVoice.volume)` (VoicePlayback.swift:31) — the plain slider, no ×3 gain. */
  it('plays at the stored volume, with no gain applied', async () => {
    useAppearance.setState({ appearance: 'system', voiceVolume: 0.35 });
    const one = player();
    mockedCreatePlayer.mockReturnValue(one.instance);
    const fetchImpl = jest.fn(async () => audioResponse()) as unknown as typeof fetch;

    playSpeech(['one'], { onPreparing: jest.fn(), onPlaying: jest.fn(), onFinished: jest.fn(), onError: jest.fn() }, fetchImpl);
    await settle();

    expect(one.instance.volume).toBe(0.35);
  });

  /** The `volumeDidChange` observer (VoicePlayback.swift:15-19). */
  it('follows the slider while a chunk is playing', async () => {
    const one = player();
    mockedCreatePlayer.mockReturnValue(one.instance);
    const fetchImpl = jest.fn(async () => audioResponse()) as unknown as typeof fetch;

    playSpeech(['one'], { onPreparing: jest.fn(), onPlaying: jest.fn(), onFinished: jest.fn(), onError: jest.fn() }, fetchImpl);
    await settle();

    useAppearance.setState({ appearance: 'system', voiceVolume: 0.2 });
    expect(one.instance.volume).toBe(0.2);
  });

  it('reports a failed request and stops', async () => {
    const fetchImpl = jest.fn(async () => audioResponse(false)) as unknown as typeof fetch;
    const handlers = { onPreparing: jest.fn(), onPlaying: jest.fn(), onFinished: jest.fn(), onError: jest.fn() };

    playSpeech(['one'], handlers, fetchImpl);
    await settle();

    expect(handlers.onError).toHaveBeenCalledWith(expect.stringMatching(/could not play the voice response/));
    expect(handlers.onFinished).not.toHaveBeenCalled();
  });

  it('stop() releases the player and asks for nothing more', async () => {
    const one = player();
    mockedCreatePlayer.mockReturnValue(one.instance);
    const fetchImpl = jest.fn(async () => audioResponse()) as unknown as typeof fetch;
    const handlers = { onPreparing: jest.fn(), onPlaying: jest.fn(), onFinished: jest.fn(), onError: jest.fn() };

    const playback = playSpeech(['one', 'two'], handlers, fetchImpl);
    await settle();
    playback.stop();
    one.finish();
    await settle();

    expect(one.instance.remove).toHaveBeenCalled();
    expect((fetchImpl as unknown as jest.Mock)).toHaveBeenCalledTimes(1);
    expect(handlers.onPlaying).toHaveBeenLastCalledWith(false);
  });

  it('an empty list finishes at once', async () => {
    const handlers = { onPreparing: jest.fn(), onPlaying: jest.fn(), onFinished: jest.fn(), onError: jest.fn() };
    playSpeech([], handlers, jest.fn() as unknown as typeof fetch);
    await settle();
    expect(handlers.onFinished).toHaveBeenCalled();
  });
});

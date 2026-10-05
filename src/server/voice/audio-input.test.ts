import { afterEach, describe, expect, it, vi } from 'vitest';
import { voiceAudioInput } from './audio-input';

afterEach(() => vi.unstubAllEnvs());
describe('voice input profile', () => {
  it('reduces noise before tuned server VAD for every voice scope', () => {
    vi.stubEnv('VOICE_NOISE_REDUCTION', '');
    vi.stubEnv('VOICE_VAD_THRESHOLD', '');
    expect(voiceAudioInput()).toEqual({
      noise_reduction: { type: 'near_field' },
      turn_detection: { type: 'server_vad', threshold: 0.65, prefix_padding_ms: 400, silence_duration_ms: 800 },
    });
  });
  it('accepts internal far-field road-test settings', () => {
    vi.stubEnv('VOICE_NOISE_REDUCTION', 'far_field');
    vi.stubEnv('VOICE_VAD_THRESHOLD', '0.75');
    expect(voiceAudioInput().noise_reduction.type).toBe('far_field');
    expect(voiceAudioInput().turn_detection.threshold).toBe(0.75);
  });
  it.each(['NaN', '0.59', '0.76', 'Infinity'])('rejects invalid threshold %s', value => {
    vi.stubEnv('VOICE_VAD_THRESHOLD', value);
    vi.stubEnv('VOICE_NOISE_REDUCTION', 'invalid');
    expect(voiceAudioInput().turn_detection.threshold).toBe(0.65);
    expect(voiceAudioInput().noise_reduction.type).toBe('near_field');
  });
});

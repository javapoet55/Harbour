/** Internal road-test controls; invalid overrides fall back to production defaults. */
export function voiceAudioInput() {
  const requested = Number(process.env.VOICE_VAD_THRESHOLD ?? '0.65');
  const threshold = Number.isFinite(requested) && requested >= 0.6 && requested <= 0.75 ? requested : 0.65;
  return {
    noise_reduction: { type: process.env.VOICE_NOISE_REDUCTION === 'far_field' ? 'far_field' : 'near_field' },
    turn_detection: { type: 'server_vad', threshold, prefix_padding_ms: 400, silence_duration_ms: 800 },
  };
}

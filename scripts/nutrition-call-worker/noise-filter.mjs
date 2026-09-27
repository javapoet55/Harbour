// Noise handling for the call audio. Launch configuration: OpenAI Realtime's own near-field noise
// reduction (set in the session). This hook is where a server-side filter such as Krisp plugs in
// later: return cleaned 20 ms μ-law frames from process() and a different name.
export function createNoiseFilter() {
  return { name: 'openai_only', reason: null, process: bytes => [bytes], close() {} };
}

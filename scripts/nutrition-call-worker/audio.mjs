// G.711 μ-law codec (ITU-T G.711). Twilio Media Streams carry 8 kHz mono μ-law in ~20 ms frames.
const BIAS = 0x84, CLIP = 32635;

export function mulawDecodeSample(byte) {
  const u = ~byte & 0xff;
  const sign = u & 0x80, exponent = (u >> 4) & 0x07, mantissa = u & 0x0f;
  const magnitude = (((mantissa << 3) + BIAS) << exponent) - BIAS;
  return sign ? -magnitude : magnitude;
}

export function mulawEncodeSample(sample) {
  let s = Math.max(-32768, Math.min(32767, Math.round(sample)));
  const sign = s < 0 ? 0x80 : 0;
  if (sign) s = -s;
  if (s > CLIP) s = CLIP;
  s += BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (s & mask) === 0 && exponent > 0; mask >>= 1) exponent--;
  const mantissa = (s >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

export function mulawToPcm16(bytes) {
  const out = new Int16Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = mulawDecodeSample(bytes[i]);
  return out;
}

export function pcm16ToMulaw(samples) {
  const out = new Uint8Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = mulawEncodeSample(samples[i]);
  return out;
}

/** Re-chunks a byte stream into fixed-size frames; the remainder waits for the next push. */
export class FrameChunker {
  constructor(frameBytes) { this.frameBytes = frameBytes; this.pending = new Uint8Array(0); }
  push(bytes) {
    const joined = new Uint8Array(this.pending.length + bytes.length);
    joined.set(this.pending, 0); joined.set(bytes, this.pending.length);
    const frames = [];
    let offset = 0;
    for (; offset + this.frameBytes <= joined.length; offset += this.frameBytes) frames.push(joined.slice(offset, offset + this.frameBytes));
    this.pending = joined.slice(offset);
    return frames;
  }
}

export const MULAW_BYTES_PER_MS = 8; // 8000 samples/s, one byte per sample

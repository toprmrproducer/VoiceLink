/**
 * Audio helpers for telephony pipelines.
 *
 * Voicelink (and Twilio) carry G.711 µ-law at 8 kHz, 8-bit samples.
 * Realtime models speak PCM16 at 24 kHz. The pipeline translates
 * between them at the WS boundary.
 *
 * For Phase 1 we implement only the decode/encode primitives; the
 * resampler (8 kHz <-> 24 kHz) is wired in once we have a real call
 * to test against (S1 with real Voicelink + S2 with real OpenAI).
 */

const MU = 0xff;
const BIAS = 0x84;

export function mulawDecodeSample(mu: number): number {
  mu = ~mu & MU;
  const sign = mu & 0x80;
  const exponent = (mu >> 4) & 0x07;
  const mantissa = mu & 0x0f;
  let sample = ((mantissa << 3) + BIAS) << exponent;
  sample -= BIAS;
  return sign ? -sample : sample;
}

export function mulawEncodeSample(pcm: number): number {
  const sign = pcm < 0 ? 0x80 : 0;
  if (pcm < 0) pcm = -pcm;
  if (pcm > 0x7fff) pcm = 0x7fff;
  pcm = pcm + BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (pcm & mask) === 0 && exponent > 0; exponent--, mask >>= 1) {
    // noop — find segment
  }
  const mantissa = (pcm >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & MU;
}

export function mulawToPcm16(mulaw: Buffer): Buffer {
  const out = Buffer.alloc(mulaw.length * 2);
  for (let i = 0; i < mulaw.length; i++) {
    out.writeInt16LE(mulawDecodeSample(mulaw[i]), i * 2);
  }
  return out;
}

export function pcm16ToMulaw(pcm: Buffer): Buffer {
  const samples = pcm.length / 2;
  const out = Buffer.alloc(samples);
  for (let i = 0; i < samples; i++) {
    out[i] = mulawEncodeSample(pcm.readInt16LE(i * 2));
  }
  return out;
}

/** Rough VAD — barge-in trips when energy exceeds threshold for N frames. */
export class EnergyVAD {
  private aboveCount = 0;
  constructor(
    private threshold = 600,
    private requiredFrames = 3,
  ) {}

  /** Returns true on the frame that crosses the barge-in threshold. */
  feed(pcm16: Buffer): boolean {
    let sum = 0;
    for (let i = 0; i < pcm16.length; i += 2) {
      const s = pcm16.readInt16LE(i);
      sum += Math.abs(s);
    }
    const energy = sum / (pcm16.length / 2);
    if (energy >= this.threshold) {
      this.aboveCount++;
      if (this.aboveCount === this.requiredFrames) return true;
    } else {
      this.aboveCount = 0;
    }
    return false;
  }

  reset(): void {
    this.aboveCount = 0;
  }
}

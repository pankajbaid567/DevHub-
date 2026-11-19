/**
 * PCM helpers for the voice interviewer. The Gemini Live API takes 16-bit little-endian
 * mono PCM at 16 kHz and answers with 16-bit PCM at 24 kHz. Microphones run at the device
 * rate (usually 48 kHz), so input is downsampled here, in plain functions that are unit tested.
 */

export const INPUT_RATE = 16_000;
export const OUTPUT_RATE = 24_000;

/** Box-filter downsampling: averages each output sample's input window (cheap anti-aliasing). */
export function downsample(
  input: Float32Array,
  fromRate: number,
  toRate = INPUT_RATE,
): Float32Array {
  if (fromRate === toRate) return input;
  if (fromRate < toRate) throw new Error('Upsampling is not supported');
  const ratio = fromRate / toRate;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j]!;
    out[i] = sum / Math.max(1, end - start);
  }
  return out;
}

export function floatToPcm16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]!));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

export function pcm16ToFloat(input: Int16Array): Float32Array {
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) out[i] = input[i]! / (input[i]! < 0 ? 0x8000 : 0x7fff);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Microphone frame → base64 PCM16 at 16 kHz, ready for `sendRealtimeInput`. */
export function encodeMicFrame(frame: Float32Array, deviceRate: number): string {
  const pcm = floatToPcm16(downsample(frame, deviceRate));
  return bytesToBase64(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength));
}

/** Model audio (base64 PCM16, little-endian) → float samples for an AudioBuffer. */
export function decodeModelAudio(b64: string): Float32Array {
  const bytes = base64ToBytes(b64);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const pcm = new Int16Array(bytes.byteLength >> 1);
  for (let i = 0; i < pcm.length; i++) pcm[i] = view.getInt16(i * 2, true);
  return pcm16ToFloat(pcm);
}

/** Root-mean-square level (0..1) for the microphone meter. */
export function rms(frame: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i]! * frame[i]!;
  return Math.sqrt(sum / Math.max(1, frame.length));
}

/** Countdown text, e.g. 754_000 → "12:34", negative → "-0:05" (overtime). */
export function formatClock(ms: number): string {
  const sign = ms < 0 ? '-' : '';
  const total = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${sign}${h}:${String(m).padStart(2, '0')}:${s}` : `${sign}${m}:${s}`;
}

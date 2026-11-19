import { describe, expect, it } from 'vitest';
import {
  base64ToBytes,
  bytesToBase64,
  decodeModelAudio,
  downsample,
  encodeMicFrame,
  floatToPcm16,
  formatClock,
  rms,
} from './audio';
import { appendTranscript } from './useVoiceInterviewer';

describe('PCM helpers', () => {
  it('downsamples 48 kHz to 16 kHz by averaging each window', () => {
    const input = Float32Array.from({ length: 48 }, (_, i) => i % 3); // 0,1,2 repeating
    const out = downsample(input, 48_000);
    expect(out).toHaveLength(16);
    expect([...out].every((v) => Math.abs(v - 1) < 1e-6)).toBe(true);
    expect(downsample(input, 16_000)).toBe(input);
    expect(() => downsample(input, 8_000)).toThrow();
  });

  it('clips and scales floats to signed 16-bit', () => {
    expect([...floatToPcm16(Float32Array.from([0, 1, -1, 2, -2, 0.5]))]).toEqual([
      0, 32767, -32768, 32767, -32768, 16383,
    ]);
  });

  it('round-trips base64 and decodes little-endian model audio', () => {
    const bytes = Uint8Array.from({ length: 70_000 }, (_, i) => i % 256);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes); // chunked btoa for large frames
    const le = bytesToBase64(Uint8Array.from([0xff, 0x7f, 0x00, 0x80, 0x00, 0x00]));
    const f = decodeModelAudio(le);
    expect(f[0]).toBeCloseTo(1);
    expect(f[1]).toBeCloseTo(-1);
    expect(f[2]).toBe(0);
  });

  it('encodes a microphone frame as 16 kHz PCM16', () => {
    const frame = new Float32Array(1_920).fill(0.25); // 40 ms at 48 kHz
    const bytes = base64ToBytes(encodeMicFrame(frame, 48_000));
    expect(bytes.byteLength).toBe(640 * 2); // 40 ms at 16 kHz, 2 bytes per sample
    expect(new DataView(bytes.buffer).getInt16(0, true)).toBe(8191);
  });

  it('measures level', () => {
    expect(rms(new Float32Array(10))).toBe(0);
    expect(rms(new Float32Array(10).fill(0.5))).toBeCloseTo(0.5);
  });
});

describe('formatClock', () => {
  it('formats a countdown, with hours and overtime', () => {
    expect(formatClock(754_000)).toBe('12:34');
    expect(formatClock(5_000)).toBe('0:05');
    expect(formatClock(3_725_000)).toBe('1:02:05');
    expect(formatClock(-5_400)).toBe('-0:05');
  });
});

describe('appendTranscript', () => {
  it('merges streamed chunks into turns and starts a new turn on a speaker change', () => {
    let t = appendTranscript([], 'interviewer', ' Hi, ');
    t = appendTranscript(t, 'interviewer', 'welcome.');
    t = appendTranscript(t, 'candidate', ' Thanks');
    t = appendTranscript(t, 'candidate', '');
    t = appendTranscript(t, 'interviewer', 'Approach?');
    expect(t).toEqual([
      { role: 'interviewer', text: 'Hi, welcome.' },
      { role: 'candidate', text: 'Thanks' },
      { role: 'interviewer', text: 'Approach?' },
    ]);
  });
});

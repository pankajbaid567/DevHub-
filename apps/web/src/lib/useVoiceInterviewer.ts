import { useCallback, useEffect, useRef, useState } from 'react';
import type { CodeRunDto, SubmissionDto, TranscriptEntry, VoiceTokenDto } from '@devhub/shared';
import { api, errorMessage } from './api';
import { getSocket } from './socket';
import { decodeModelAudio, encodeMicFrame, INPUT_RATE, OUTPUT_RATE, rms } from './audio';

export type VoiceStatus = 'idle' | 'connecting' | 'live' | 'ended' | 'error';

/** Minimal surface of the SDK's live session that we use (keeps the SDK out of the main bundle). */
interface LiveSession {
  sendRealtimeInput(input: { audio?: { data: string; mimeType: string }; text?: string }): void;
  close(): void;
}

interface LiveMessage {
  serverContent?: {
    modelTurn?: { parts?: { inlineData?: { data?: string } }[] };
    interrupted?: boolean;
    inputTranscription?: { text?: string };
    outputTranscription?: { text?: string };
  };
  goAway?: unknown;
}

const CODE_SYNC_MS = 30_000;
const MAX_CONTEXT_CHARS = 8_000;

/** Appends a transcription chunk, merging it into the current turn when the speaker is unchanged. */
export function appendTranscript(
  list: TranscriptEntry[],
  role: TranscriptEntry['role'],
  chunk: string,
): TranscriptEntry[] {
  if (!chunk) return list;
  const last = list[list.length - 1];
  if (last?.role === role) return [...list.slice(0, -1), { role, text: last.text + chunk }];
  return [...list, { role, text: chunk.trimStart() }];
}

interface Options {
  sessionId: string;
  /** Current text of the shared editor. */
  getCode: () => string;
  /** Interview deadline (server time) and the local clock's offset from the server. */
  endsAt: string | null;
  clockOffsetMs: number;
}

/**
 * A live, spoken mock interview with Gemini. The browser streams the microphone straight
 * to Google using a single-use token from our API (the prompt, the model and audio-only
 * output are locked into it), plays the replies gaplessly, stops playback the moment the
 * candidate talks over it, and keeps the interviewer up to date with the code, runs and time left.
 */
export function useVoiceInterviewer({ sessionId, getCode, endsAt, clockOffsetMs }: Options) {
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [level, setLevel] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);

  const live = useRef<LiveSession | null>(null);
  const mutedRef = useRef(false);
  const cleanup = useRef<(() => void) | null>(null);
  const getCodeRef = useRef(getCode);
  useEffect(() => {
    getCodeRef.current = getCode;
  }, [getCode]);

  const send = useCallback((text: string) => {
    try {
      live.current?.sendRealtimeInput({ text });
    } catch {
      /* socket already closing */
    }
  }, []);

  const stop = useCallback(() => {
    cleanup.current?.();
    cleanup.current = null;
    setStatus((s) => (s === 'live' || s === 'connecting' ? 'ended' : s));
  }, []);

  const start = useCallback(async () => {
    if (live.current) return;
    setError(null);
    setStatus('connecting');
    const disposers: (() => void)[] = [];
    const dispose = () => {
      live.current = null;
      while (disposers.length) {
        try {
          disposers.pop()!();
        } catch {
          /* best effort */
        }
      }
      setSpeaking(false);
      setLevel(0);
    };
    cleanup.current = dispose;
    try {
      // Microphone first: the token must be used within a minute, and the permission prompt can take a while.
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      disposers.push(() => mic.getTracks().forEach((t) => t.stop()));

      const input = new AudioContext();
      disposers.push(() => void input.close());
      await input.audioWorklet.addModule('/audio/mic-capture.worklet.js');
      const capture = new AudioWorkletNode(input, 'mic-capture');
      const silent = input.createGain();
      silent.gain.value = 0; // keeps the graph pulled without echoing the mic
      input
        .createMediaStreamSource(mic)
        .connect(capture)
        .connect(silent)
        .connect(input.destination);

      const output = new AudioContext();
      disposers.push(() => void output.close());
      let playhead = 0;
      const playing = new Set<AudioBufferSourceNode>();
      const play = (b64: string) => {
        const samples = decodeModelAudio(b64);
        if (!samples.length) return;
        const buffer = output.createBuffer(1, samples.length, OUTPUT_RATE);
        buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
        const src = output.createBufferSource();
        src.buffer = buffer;
        src.connect(output.destination);
        playhead = Math.max(playhead, output.currentTime + 0.05);
        src.start(playhead);
        playhead += buffer.duration;
        playing.add(src);
        setSpeaking(true);
        src.onended = () => {
          playing.delete(src);
          if (!playing.size) setSpeaking(false);
        };
      };
      const interrupt = () => {
        for (const src of playing) src.stop();
        playing.clear();
        playhead = 0;
        setSpeaking(false);
      };

      const token = await api<VoiceTokenDto>(`/sessions/${sessionId}/interview/voice-token`, {
        method: 'POST',
      });
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: token.token, httpOptions: { apiVersion: 'v1alpha' } });
      const session = (await ai.live.connect({
        model: token.model,
        config: {}, // everything is locked into the token server-side
        callbacks: {
          onmessage: (m: LiveMessage) => {
            const sc = m.serverContent;
            if (!sc) return;
            if (sc.interrupted) interrupt();
            for (const part of sc.modelTurn?.parts ?? [])
              if (part.inlineData?.data) play(part.inlineData.data);
            if (sc.inputTranscription?.text)
              setTranscript((t) => appendTranscript(t, 'candidate', sc.inputTranscription!.text!));
            if (sc.outputTranscription?.text)
              setTranscript((t) =>
                appendTranscript(t, 'interviewer', sc.outputTranscription!.text!),
              );
          },
          onerror: (e: ErrorEvent) => {
            setError(e.message || 'The voice connection failed');
            setStatus('error');
          },
          onclose: (e: CloseEvent) => {
            if (live.current) {
              dispose();
              cleanup.current = null;
              setStatus('ended');
              if (e.code !== 1000 && e.reason) setError(e.reason);
            }
          },
        },
      })) as unknown as LiveSession;
      live.current = session;
      disposers.push(() => session.close());
      disposers.push(interrupt);

      capture.port.onmessage = (e: MessageEvent<Float32Array>) => {
        setLevel(rms(e.data));
        if (mutedRef.current || !live.current) return;
        live.current.sendRealtimeInput({
          audio: {
            data: encodeMicFrame(e.data, input.sampleRate),
            mimeType: `audio/pcm;rate=${INPUT_RATE}`,
          },
        });
      };

      // Context: the code so far, then updates when it changes, runs and the clock.
      let lastCode = getCodeRef.current();
      send(
        `[code]\n${lastCode.slice(0, MAX_CONTEXT_CHARS) || '(empty editor)'}\n\nThe candidate has joined. Greet them and start the interview.`,
      );
      const codeTimer = window.setInterval(() => {
        const code = getCodeRef.current();
        if (code !== lastCode) {
          lastCode = code;
          send(`[code]\n${code.slice(0, MAX_CONTEXT_CHARS)}`);
        }
      }, CODE_SYNC_MS);
      disposers.push(() => window.clearInterval(codeTimer));

      const socket = getSocket();
      const onRun = (r: CodeRunDto) => {
        if (r.sessionId !== sessionId) return;
        const out = `${r.stdout}${r.stderr ? `\n[stderr]\n${r.stderr}` : ''}`.slice(0, 2_000);
        send(`[run] ${r.language}, exit code ${r.exitCode ?? 'none'} (${r.status})\n${out}`);
      };
      socket.on('run:finished', onRun);
      disposers.push(() => socket.off('run:finished', onRun));
      const onTests = (t: SubmissionDto) => {
        if (t.sessionId !== sessionId) return;
        const failed = t.cases.filter((c) => !c.passed);
        const detail = failed
          .slice(0, 2)
          .map((c) =>
            c.hidden
              ? `a hidden test${c.error ? ` (${c.error})` : ''}`
              : `${c.input} expected ${c.expected} got ${c.actual ?? c.error}`,
          )
          .join('; ');
        send(
          `[tests] ${t.passed}/${t.total} passed (${t.status})${detail ? `. Failing: ${detail}` : ''}`,
        );
      };
      socket.on('submission:finished', onTests);
      disposers.push(() => socket.off('submission:finished', onTests));

      if (endsAt) {
        const warnAt = Date.parse(endsAt) - 5 * 60_000 - (Date.now() + clockOffsetMs);
        if (warnAt > 0) {
          const t = window.setTimeout(() => send('[time] Five minutes left.'), warnAt);
          disposers.push(() => window.clearTimeout(t));
        }
      }
      setStatus('live');
    } catch (err) {
      dispose();
      cleanup.current = null;
      setStatus('error');
      setError(
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Microphone access was blocked. Allow it in the browser to talk to the interviewer.'
          : errorMessage(err),
      );
    }
  }, [sessionId, endsAt, clockOffsetMs, send]);

  const toggleMute = useCallback(() => {
    mutedRef.current = !mutedRef.current;
    setMuted(mutedRef.current);
  }, []);

  useEffect(() => () => cleanup.current?.(), []);

  return {
    status,
    error,
    transcript,
    level,
    speaking,
    muted,
    start,
    stop,
    toggleMute,
    reset: () => {
      setTranscript([]);
      setStatus('idle');
      setError(null);
    },
  };
}

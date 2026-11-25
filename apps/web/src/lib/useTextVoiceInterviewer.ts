import { useCallback, useEffect, useRef, useState } from 'react';
import type { CodeRunDto, SubmissionDto, TranscriptEntry } from '@devhub/shared';
import { api, errorMessage } from './api';
import { getSocket } from './socket';
import { appendTranscript } from './useVoiceInterviewer';

export type TextVoiceStatus = 'idle' | 'connecting' | 'live' | 'ended' | 'error';

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

const CODE_SYNC_MS = 30_000;
const SILENCE_FOLLOWUP_MS = 15_000;
const MAX_CONTEXT_CHARS = 8_000;

interface Options {
  sessionId: string;
  getCode: () => string;
  endsAt: string | null;
  clockOffsetMs: number;
}

interface ChatResponse {
  reply: string;
  transcript: TranscriptEntry[];
}

export function useTextVoiceInterviewer({ sessionId, getCode, endsAt, clockOffsetMs }: Options) {
  const [status, setStatus] = useState<TextVoiceStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [interimText, setInterimText] = useState('');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const getCodeRef = useRef(getCode);
  const mutedRef = useRef(false);
  const speakerRef = useRef(true);
  const sendingRef = useRef(false);
  const silenceTimerRef = useRef<number | null>(null);
  const statusRef = useRef<TextVoiceStatus>('idle');

  useEffect(() => {
    getCodeRef.current = getCode;
  }, [getCode]);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const speakText = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!speakerRef.current || !window.speechSynthesis) {
        resolve();
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1;
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => {
        setSpeaking(false);
        resolve();
      };
      utterance.onerror = () => {
        setSpeaking(false);
        resolve();
      };
      window.speechSynthesis.speak(utterance);
    });
  }, []);

  const resetSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = null;
  }, []);

  const sendMessage = useCallback(
    async (message: string, context?: { code?: string; runOutput?: string }) => {
      if (sendingRef.current) return;
      sendingRef.current = true;
      resetSilenceTimer();
      try {
        const res = await api<ChatResponse>(`/sessions/${sessionId}/interview/chat`, {
          method: 'POST',
          body: { message, context },
        });
        setTranscript(res.transcript);
        await speakText(res.reply);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        sendingRef.current = false;
        if (statusRef.current === 'live') {
          silenceTimerRef.current = window.setTimeout(() => {
            if (statusRef.current === 'live' && !sendingRef.current) {
              void sendMessage('[silence] The candidate has been quiet for a while. Ask a follow-up question or check how they are progressing.');
            }
          }, SILENCE_FOLLOWUP_MS);
        }
      }
    },
    [sessionId, speakText, resetSilenceTimer],
  );

  const stop = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    setListening(false);
    setInterimText('');
    resetSilenceTimer();
    setStatus((s) => (s === 'live' || s === 'connecting' ? 'ended' : s));
  }, [resetSilenceTimer]);

  const start = useCallback(async () => {
    if (statusRef.current === 'live' || statusRef.current === 'connecting') return;
    setError(null);
    setStatus('connecting');

    const disposers: (() => void)[] = [];
    const dispose = () => {
      recognitionRef.current = null;
      while (disposers.length) {
        try {
          disposers.pop()!();
        } catch { /* best effort */ }
      }
      setSpeaking(false);
      setListening(false);
      setInterimText('');
      resetSilenceTimer();
    };
    cleanupRef.current = dispose;

    try {
      const SpeechRecognition =
        (window as unknown as Record<string, unknown>).SpeechRecognition ??
        (window as unknown as Record<string, unknown>).webkitSpeechRecognition;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let recognition: any = null;

      if (SpeechRecognition) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recognition = new (SpeechRecognition as any)();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (e: SpeechRecognitionEvent) => {
          let interim = '';
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const result = e.results[i];
            if (result?.isFinal) {
              const finalText = result[0]?.transcript?.trim();
              if (finalText && !mutedRef.current) {
                setTranscript((t) => appendTranscript(t, 'candidate', finalText));
                void sendMessage(finalText, { code: getCodeRef.current().slice(0, MAX_CONTEXT_CHARS) });
              }
              setInterimText('');
            } else if (result?.[0]) {
              interim += result[0].transcript;
            }
          }
          if (interim) setInterimText(interim);
        };

        recognition.onend = () => {
          setListening(false);
          if (statusRef.current === 'live') {
            try {
              recognition?.start();
              setListening(true);
            } catch { /* already running */ }
          }
        };

        recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
          if (e.error === 'not-allowed') {
            setError('Microphone access was blocked. Allow it in browser settings.');
            setStatus('error');
            dispose();
            cleanupRef.current = null;
          }
        };

        recognition.start();
        recognitionRef.current = recognition;
        setListening(true);
        disposers.push(() => {
          try { recognition?.stop(); } catch { /* ignore */ }
        });
      }

      // Code sync timer
      let lastCode = getCodeRef.current();
      const codeTimer = window.setInterval(() => {
        const code = getCodeRef.current();
        if (code !== lastCode && statusRef.current === 'live') {
          lastCode = code;
          void sendMessage(`[code]\n${code.slice(0, MAX_CONTEXT_CHARS)}`);
        }
      }, CODE_SYNC_MS);
      disposers.push(() => window.clearInterval(codeTimer));

      // Listen for run results and test submissions via socket
      const socket = getSocket();
      const onRun = (r: CodeRunDto) => {
        if (r.sessionId !== sessionId) return;
        const out = `${r.stdout}${r.stderr ? `\n[stderr]\n${r.stderr}` : ''}`.slice(0, 2_000);
        void sendMessage(`[run] ${r.language}, exit code ${r.exitCode ?? 'none'} (${r.status})\n${out}`);
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
        void sendMessage(
          `[tests] ${t.passed}/${t.total} passed (${t.status})${detail ? `. Failing: ${detail}` : ''}`,
        );
      };
      socket.on('submission:finished', onTests);
      disposers.push(() => socket.off('submission:finished', onTests));

      // Time warning
      if (endsAt) {
        const warnAt = Date.parse(endsAt) - 5 * 60_000 - (Date.now() + clockOffsetMs);
        if (warnAt > 0) {
          const t = window.setTimeout(() => {
            void sendMessage('[time] Five minutes left.');
          }, warnAt);
          disposers.push(() => window.clearTimeout(t));
        }
      }

      setStatus('live');

      // Greeting: send initial message
      const code = getCodeRef.current();
      void sendMessage(
        `[code]\n${code.slice(0, MAX_CONTEXT_CHARS) || '(empty editor)'}\n\nThe candidate has joined. Greet them and start the interview.`,
      );
    } catch (err) {
      dispose();
      cleanupRef.current = null;
      setStatus('error');
      setError(errorMessage(err));
    }
  }, [sessionId, endsAt, clockOffsetMs, sendMessage, resetSilenceTimer]);

  const toggleMute = useCallback(() => {
    mutedRef.current = !mutedRef.current;
    setMuted(mutedRef.current);
  }, []);

  const toggleSpeaker = useCallback(() => {
    speakerRef.current = !speakerRef.current;
    setSpeakerOn(speakerRef.current);
    if (!speakerRef.current) {
      window.speechSynthesis?.cancel();
      setSpeaking(false);
    }
  }, []);

  const sendTyped = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      setTranscript((t) => appendTranscript(t, 'candidate', text.trim()));
      void sendMessage(text.trim(), { code: getCodeRef.current().slice(0, MAX_CONTEXT_CHARS) });
    },
    [sendMessage],
  );

  useEffect(() => () => cleanupRef.current?.(), []);

  const hasSpeechRecognition = typeof window !== 'undefined' &&
    Boolean(
      (window as unknown as Record<string, unknown>).SpeechRecognition ??
        (window as unknown as Record<string, unknown>).webkitSpeechRecognition,
    );

  return {
    status,
    error,
    transcript,
    speaking,
    listening,
    muted,
    speakerOn,
    interimText,
    hasSpeechRecognition,
    start,
    stop,
    toggleMute,
    toggleSpeaker,
    sendTyped,
    reset: () => {
      setTranscript([]);
      setStatus('idle');
      setError(null);
      setInterimText('');
    },
  };
}

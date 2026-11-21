import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProctoringConfigDto, ProctoringEventType } from '@devhub/shared';
import { getSocket } from './socket';

interface ProctoringState {
  violations: number;
  lastWarning: string | null;
  cameraStream: MediaStream | null;
  screenStream: MediaStream | null;
  cameraError: string | null;
  screenError: string | null;
}

/**
 * Enforces proctoring rules on the candidate side: fullscreen, focus tracking,
 * copy-paste blocking, camera capture and screen share. Violations are reported
 * through the socket and the interviewer sees them in real time.
 */
export function useProctoring(
  sessionId: string,
  config: ProctoringConfigDto | null,
  isInterviewer: boolean,
  started: boolean,
) {
  const active = Boolean(config?.enabled && !isInterviewer && started);
  const [state, setState] = useState<ProctoringState>({
    violations: 0,
    lastWarning: null,
    cameraStream: null,
    screenStream: null,
    cameraError: null,
    screenError: null,
  });
  const disposers = useRef<Array<() => void>>([]);

  const emit = useCallback(
    (type: ProctoringEventType, detail = '') => {
      const socket = getSocket();
      socket.emit('proctoring:event', { sessionId, type, detail }, () => {});
      setState((s) => ({ ...s, violations: s.violations + 1 }));
    },
    [sessionId],
  );

  // Start proctoring when interview starts and config is enabled.
  useEffect(() => {
    if (!config?.enabled || isInterviewer || !started) return;

    const cleanup: Array<() => void> = [];

    // Tab switch / focus lost detection via visibilitychange.
    const onVisibility = () => {
      if (document.hidden) emit('TAB_SWITCH', 'Tab became hidden');
    };
    document.addEventListener('visibilitychange', onVisibility);
    cleanup.push(() => document.removeEventListener('visibilitychange', onVisibility));

    // Window blur detection.
    const onBlur = () => emit('FOCUS_LOST', 'Window lost focus');
    window.addEventListener('blur', onBlur);
    cleanup.push(() => window.removeEventListener('blur', onBlur));

    // Fullscreen enforcement.
    if (config.enforceFullscreen) {
      const onFullscreenChange = () => {
        if (!document.fullscreenElement) {
          emit('FULLSCREEN_EXIT', 'Left fullscreen mode');
        }
      };
      document.addEventListener('fullscreenchange', onFullscreenChange);
      cleanup.push(() => document.removeEventListener('fullscreenchange', onFullscreenChange));

      // Request fullscreen on start.
      document.documentElement.requestFullscreen?.().catch(() => {});
    }

    // Copy-paste blocking.
    if (config.blockCopyPaste) {
      const block = (e: ClipboardEvent) => {
        e.preventDefault();
        emit('COPY_PASTE', `Blocked ${e.type} attempt`);
      };
      document.addEventListener('copy', block);
      document.addEventListener('cut', block);
      document.addEventListener('paste', block);
      cleanup.push(() => {
        document.removeEventListener('copy', block);
        document.removeEventListener('cut', block);
        document.removeEventListener('paste', block);
      });
    }

    // Listen for server warnings.
    const socket = getSocket();
    const onWarning = (p: { sessionId: string; message: string }) => {
      if (p.sessionId === sessionId) {
        setState((s) => ({ ...s, lastWarning: p.message }));
      }
    };
    socket.on('proctoring:warning', onWarning);
    cleanup.push(() => socket.off('proctoring:warning', onWarning));

    disposers.current = cleanup;
    return () => {
      cleanup.forEach((fn) => fn());
      disposers.current = [];
    };
  }, [config, isInterviewer, started, sessionId, emit]);

  // Camera stream.
  useEffect(() => {
    if (!config?.requireCamera || isInterviewer || !started) return;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        setState((s) => ({ ...s, cameraStream: stream, cameraError: null }));
      })
      .catch(() => {
        if (!cancelled) setState((s) => ({ ...s, cameraError: 'Camera access denied' }));
      });
    return () => {
      cancelled = true;
      setState((prev) => {
        prev.cameraStream?.getTracks().forEach((t) => t.stop());
        return { ...prev, cameraStream: null };
      });
    };
  }, [config?.requireCamera, isInterviewer, started]);

  // Screen share stream.
  useEffect(() => {
    if (!config?.requireScreenShare || isInterviewer || !started) return;
    let cancelled = false;
    navigator.mediaDevices
      .getDisplayMedia({ video: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        // Detect when user stops sharing.
        stream.getVideoTracks()[0]?.addEventListener('ended', () => {
          emit('SCREEN_SHARE_STOPPED', 'Screen share ended by user');
          setState((s) => ({ ...s, screenStream: null }));
        });
        setState((s) => ({ ...s, screenStream: stream, screenError: null }));
      })
      .catch(() => {
        if (!cancelled) setState((s) => ({ ...s, screenError: 'Screen share denied' }));
      });
    return () => {
      cancelled = true;
      setState((prev) => {
        prev.screenStream?.getTracks().forEach((t) => t.stop());
        return { ...prev, screenStream: null };
      });
    };
  }, [config?.requireScreenShare, isInterviewer, started, emit]);

  return { active, ...state };
}

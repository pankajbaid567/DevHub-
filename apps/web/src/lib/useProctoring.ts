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
  const cameraRef = useRef<MediaStream | null>(null);

  const emit = useCallback(
    (type: ProctoringEventType, detail = '') => {
      const socket = getSocket();
      socket.emit('proctoring:event', { sessionId, type, detail }, () => {});
      if (type !== 'CAMERA_SNAPSHOT') {
        setState((s) => ({ ...s, violations: s.violations + 1 }));
      }
    },
    [sessionId],
  );

  useEffect(() => {
    if (!config?.enabled || isInterviewer || !started) return;

    const cleanup: Array<() => void> = [];

    // --- Tab switch / visibility ---
    const onVisibility = () => {
      if (document.hidden) emit('TAB_SWITCH', 'Tab became hidden');
    };
    document.addEventListener('visibilitychange', onVisibility);
    cleanup.push(() => document.removeEventListener('visibilitychange', onVisibility));

    // --- Window blur ---
    const onBlur = () => emit('FOCUS_LOST', 'Window lost focus');
    window.addEventListener('blur', onBlur);
    cleanup.push(() => window.removeEventListener('blur', onBlur));

    // --- Fullscreen enforcement ---
    if (config.enforceFullscreen) {
      const onFullscreenChange = () => {
        if (!document.fullscreenElement) {
          emit('FULLSCREEN_EXIT', 'Left fullscreen mode');
        }
      };
      document.addEventListener('fullscreenchange', onFullscreenChange);
      cleanup.push(() => document.removeEventListener('fullscreenchange', onFullscreenChange));
      document.documentElement.requestFullscreen?.().catch(() => {});
    }

    // --- Copy-paste blocking ---
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

    // --- Right-click blocking ---
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      emit('RIGHT_CLICK', 'Right-click blocked');
    };
    document.addEventListener('contextmenu', onContextMenu);
    cleanup.push(() => document.removeEventListener('contextmenu', onContextMenu));

    // --- DevTools detection (key combos) ---
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(e.key.toUpperCase())) ||
        (e.metaKey && e.altKey && ['I', 'J', 'C'].includes(e.key.toUpperCase()))
      ) {
        e.preventDefault();
        emit('DEVTOOLS_OPEN', 'DevTools shortcut blocked');
      }
    };
    document.addEventListener('keydown', onKeyDown);
    cleanup.push(() => document.removeEventListener('keydown', onKeyDown));

    // --- DevTools detection (resize heuristic) ---
    let devToolsOpen = false;
    const devToolsCheck = setInterval(() => {
      const widthDiff = window.outerWidth - window.innerWidth;
      const heightDiff = window.outerHeight - window.innerHeight;
      const isOpen = widthDiff > 200 || heightDiff > 200;
      if (isOpen && !devToolsOpen) {
        devToolsOpen = true;
        emit('DEVTOOLS_OPEN', 'DevTools detected via window size');
      } else if (!isOpen) {
        devToolsOpen = false;
      }
    }, 2000);
    cleanup.push(() => clearInterval(devToolsCheck));

    // --- Multiple tab detection via BroadcastChannel ---
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(`devhub-proctor-${sessionId}`);
      channel.postMessage({ type: 'join' });
      channel.onmessage = (e) => {
        if (e.data?.type === 'join') {
          emit('MULTIPLE_TABS', 'Session opened in another tab');
          channel?.postMessage({ type: 'ack' });
        } else if (e.data?.type === 'ack') {
          emit('MULTIPLE_TABS', 'Session already open in another tab');
        }
      };
    } catch {
      // BroadcastChannel not supported
    }
    cleanup.push(() => {
      try { channel?.close(); } catch {}
    });

    // --- Periodic camera snapshots (every 30s) ---
    const snapshotInterval = setInterval(() => {
      const stream = cameraRef.current;
      if (!stream) return;
      const track = stream.getVideoTracks()[0];
      if (!track || track.readyState !== 'live') return;
      try {
        const canvas = document.createElement('canvas');
        const video = document.createElement('video');
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        video.play().then(() => {
          canvas.width = 160;
          canvas.height = 120;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, 160, 120);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.3);
            emit('CAMERA_SNAPSHOT', dataUrl);
          }
          video.srcObject = null;
        }).catch(() => {});
      } catch {}
    }, 30_000);
    cleanup.push(() => clearInterval(snapshotInterval));

    // --- Idle detection (60s no activity) ---
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let idleFired = false;
    const resetIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleFired = false;
      idleTimer = setTimeout(() => {
        if (!idleFired) {
          idleFired = true;
          emit('IDLE_DETECTED', 'No activity for 60 seconds');
        }
      }, 60_000);
    };
    resetIdle();
    const idleEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const;
    idleEvents.forEach((evt) => document.addEventListener(evt, resetIdle));
    cleanup.push(() => {
      if (idleTimer) clearTimeout(idleTimer);
      idleEvents.forEach((evt) => document.removeEventListener(evt, resetIdle));
    });

    // --- Server warnings ---
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
        cameraRef.current = stream;
        setState((s) => ({ ...s, cameraStream: stream, cameraError: null }));
      })
      .catch(() => {
        if (!cancelled) setState((s) => ({ ...s, cameraError: 'Camera access denied' }));
      });
    return () => {
      cancelled = true;
      cameraRef.current = null;
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

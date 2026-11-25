import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Camera, Monitor, ShieldCheck } from 'lucide-react';
import { cn } from '../../lib/utils';

interface Props {
  active: boolean;
  violations: number;
  lastWarning: string | null;
  cameraStream: MediaStream | null;
  screenStream: MediaStream | null;
  cameraError: string | null;
  screenError: string | null;
}

function violationColor(count: number) {
  if (count >= 5) return 'bg-red-500';
  if (count >= 3) return 'bg-orange-500';
  if (count >= 1) return 'bg-yellow-500';
  return 'bg-emerald-500';
}

export function ProctoringOverlay({
  active,
  violations,
  lastWarning,
  cameraStream,
  cameraError,
  screenError,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

  useEffect(() => {
    if (lastWarning) {
      setShowWarning(true);
      const t = setTimeout(() => setShowWarning(false), 5000);
      return () => clearTimeout(t);
    }
  }, [lastWarning]);

  if (!active) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {/* Warning toast (auto-dismiss after 5s) */}
      {showWarning && lastWarning && (
        <div className="animate-in fade-in slide-in-from-right flex items-center gap-2 rounded-lg border border-warning bg-warning-soft px-3 py-2 text-sm text-warning shadow-lg transition-opacity">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {lastWarning}
        </div>
      )}

      {/* Status bar */}
      <div className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2 shadow-lg">
        {/* Recording indicator + Proctored label */}
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
          </span>
          <ShieldCheck className="h-3.5 w-3.5 text-blue-500" />
          Proctored
        </div>

        <div className="h-4 w-px bg-line" />

        <div className="flex items-center gap-1.5 text-xs">
          <Monitor className={cn('h-3.5 w-3.5', screenError ? 'text-danger' : 'text-success')} />
          {screenError ? 'Off' : 'Sharing'}
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <Camera className={cn('h-3.5 w-3.5', cameraError ? 'text-danger' : 'text-success')} />
          {cameraError ? 'Off' : 'On'}
        </div>
        {violations > 0 && (
          <span
            className={cn(
              'rounded px-1.5 py-0.5 text-xs font-semibold text-white',
              violationColor(violations),
            )}
          >
            {violations} violation{violations !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Camera preview */}
      {cameraStream && (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="h-24 w-32 rounded-lg border border-line object-cover shadow-lg"
        />
      )}
    </div>
  );
}

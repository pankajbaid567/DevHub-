import { useEffect, useRef } from 'react';
import { AlertTriangle, Camera, Monitor } from 'lucide-react';
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

/** Small floating overlay for candidates: camera preview, violation count, warnings. */
export function ProctoringOverlay({
  active,
  violations,
  lastWarning,
  cameraStream,
  cameraError,
  screenError,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

  if (!active) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {/* Warning toast */}
      {lastWarning && (
        <div className="animate-in fade-in slide-in-from-right flex items-center gap-2 rounded-lg border border-warning bg-warning-soft px-3 py-2 text-sm text-warning shadow-lg">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {lastWarning}
        </div>
      )}

      {/* Status bar */}
      <div className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2 shadow-lg">
        <div className="flex items-center gap-1.5 text-xs">
          <Monitor className={cn('h-3.5 w-3.5', screenError ? 'text-danger' : 'text-success')} />
          {screenError ? 'Off' : 'Sharing'}
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <Camera className={cn('h-3.5 w-3.5', cameraError ? 'text-danger' : 'text-success')} />
          {cameraError ? 'Off' : 'On'}
        </div>
        {violations > 0 && (
          <span className="rounded bg-danger px-1.5 py-0.5 text-xs font-semibold text-white">
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

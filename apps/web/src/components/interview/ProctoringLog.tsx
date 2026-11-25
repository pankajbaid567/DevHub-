import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Ban,
  Camera,
  Clock,
  Copy,
  Eye,
  EyeOff,
  Layers,
  Monitor,
  MonitorX,
  MousePointer,
  Shield,
  Wrench,
} from 'lucide-react';
import type { ProctoringEventDto, ProctoringEventType, ProctoringStatusDto } from '@devhub/shared';
import { api } from '../../lib/api';
import { qk } from '../../lib/queryClient';
import { getSocket } from '../../lib/socket';
import { cn } from '../../lib/utils';
import { Badge } from '../ui/primitives';

const EVENT_META: Record<string, { label: string; icon: typeof AlertTriangle; severity: 'low' | 'medium' | 'high' }> = {
  TAB_SWITCH:           { label: 'Tab switch',           icon: EyeOff,     severity: 'high' },
  FULLSCREEN_EXIT:      { label: 'Fullscreen exit',      icon: MonitorX,   severity: 'high' },
  COPY_PASTE:           { label: 'Copy/paste',           icon: Copy,       severity: 'medium' },
  FOCUS_LOST:           { label: 'Focus lost',           icon: Eye,        severity: 'medium' },
  SCREEN_SHARE_STOPPED: { label: 'Screen share stopped', icon: Monitor,    severity: 'high' },
  RIGHT_CLICK:          { label: 'Right-click',          icon: MousePointer, severity: 'low' },
  DEVTOOLS_OPEN:        { label: 'DevTools opened',      icon: Wrench,     severity: 'high' },
  MULTIPLE_TABS:        { label: 'Multiple tabs',        icon: Layers,     severity: 'high' },
  CAMERA_SNAPSHOT:      { label: 'Camera snapshot',      icon: Camera,     severity: 'low' },
  IDLE_DETECTED:        { label: 'Idle detected',        icon: Clock,      severity: 'medium' },
};

const SEVERITY_COLORS = {
  low: 'text-blue-500',
  medium: 'text-yellow-500',
  high: 'text-red-500',
} as const;

const SEVERITY_BG = {
  low: 'bg-blue-50 dark:bg-blue-950/30',
  medium: 'bg-yellow-50 dark:bg-yellow-950/30',
  high: 'bg-red-50 dark:bg-red-950/30',
} as const;

export function ProctoringLog({ sessionId }: { sessionId: string }) {
  const { data } = useQuery({
    queryKey: [...qk.sessions.detail(sessionId), 'proctoring'],
    queryFn: () => api<ProctoringStatusDto>(`/sessions/${sessionId}/interview/proctoring`),
    refetchInterval: 30_000,
  });

  const [live, setLive] = useState<ProctoringEventDto[]>([]);

  useEffect(() => {
    const socket = getSocket();
    const handler = (e: ProctoringEventDto) => {
      if (e.sessionId === sessionId) setLive((prev) => [e, ...prev].slice(0, 50));
    };
    socket.on('proctoring:violation', handler);
    return () => {
      socket.off('proctoring:violation', handler);
    };
  }, [sessionId]);

  const events = [...live, ...(data?.events ?? [])];
  const seen = new Set<string>();
  const unique = events.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });

  // Filter out CAMERA_SNAPSHOT from the visible list (they're informational)
  const visible = unique.filter((e) => e.type !== 'CAMERA_SNAPSHOT');

  const enabled = data?.config?.enabled ?? false;

  // Violation summary counts by type
  const counts = new Map<string, number>();
  for (const e of visible) {
    counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
  }

  const startTime = visible.length > 0
    ? new Date(visible[visible.length - 1]!.createdAt).getTime()
    : Date.now();

  const relativeTime = (ts: string) => {
    const diff = Math.round((new Date(ts).getTime() - startTime) / 1000);
    const m = Math.floor(diff / 60);
    const s = diff % 60;
    return `+${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Shield className="h-4 w-4" />
          Proctoring
        </div>
        <Badge tone={enabled ? 'success' : 'neutral'}>{enabled ? 'Enabled' : 'Disabled'}</Badge>
      </div>

      {/* Violation summary */}
      {visible.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Array.from(counts.entries()).map(([type, count]) => {
            const meta = EVENT_META[type];
            const Icon = meta?.icon ?? AlertTriangle;
            const severity = meta?.severity ?? 'medium';
            return (
              <span
                key={type}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                  SEVERITY_BG[severity],
                  SEVERITY_COLORS[severity],
                )}
              >
                <Icon className="h-3 w-3" />
                {count}
              </span>
            );
          })}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">
          {enabled ? 'No violations yet' : 'Proctoring is not enabled for this session'}
        </p>
      ) : (
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {visible.map((e) => {
            const meta = EVENT_META[e.type];
            const Icon = meta?.icon ?? AlertTriangle;
            const severity = meta?.severity ?? 'medium';
            return (
              <li
                key={e.id}
                className={cn(
                  'flex items-start gap-2 rounded-md px-2 py-1.5 text-xs',
                  e.id === live[0]?.id && 'animate-in fade-in',
                  SEVERITY_BG[severity],
                )}
              >
                <Icon className={cn('mt-0.5 h-3 w-3 shrink-0', SEVERITY_COLORS[severity])} />
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{meta?.label ?? e.type}</span>
                  {e.detail && <span className="ml-1 text-muted">— {e.detail}</span>}
                  <div className="text-muted">
                    {e.username} · {relativeTime(e.createdAt)}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="border-t border-line pt-2 text-xs text-muted">
        Total violations: {data?.violations ?? visible.length}
      </div>
    </div>
  );
}

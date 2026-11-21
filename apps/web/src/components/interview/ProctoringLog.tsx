import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Shield } from 'lucide-react';
import type { ProctoringEventDto, ProctoringStatusDto } from '@devhub/shared';
import { api } from '../../lib/api';
import { qk } from '../../lib/queryClient';
import { getSocket } from '../../lib/socket';
import { cn } from '../../lib/utils';
import { Badge } from '../ui/primitives';

const EVENT_LABELS: Record<string, string> = {
  TAB_SWITCH: 'Tab switch',
  FULLSCREEN_EXIT: 'Fullscreen exit',
  COPY_PASTE: 'Copy/paste',
  FOCUS_LOST: 'Focus lost',
  SCREEN_SHARE_STOPPED: 'Screen share stopped',
};

/** Interviewer-only panel: live violation feed with counts. */
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
  // Deduplicate by id.
  const seen = new Set<string>();
  const unique = events.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });

  const enabled = data?.config?.enabled ?? false;

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Shield className="h-4 w-4" />
          Proctoring
        </div>
        <Badge tone={enabled ? 'success' : 'neutral'}>{enabled ? 'Enabled' : 'Disabled'}</Badge>
      </div>
      {unique.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">
          {enabled ? 'No violations yet' : 'Proctoring is not enabled for this session'}
        </p>
      ) : (
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {unique.map((e) => (
            <li
              key={e.id}
              className={cn(
                'flex items-start gap-2 rounded-md px-2 py-1.5 text-xs',
                e.id === live[0]?.id && 'animate-in fade-in bg-danger-soft',
              )}
            >
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-danger" />
              <div className="min-w-0 flex-1">
                <span className="font-medium">{EVENT_LABELS[e.type] ?? e.type}</span>
                {e.detail && <span className="ml-1 text-muted">— {e.detail}</span>}
                <div className="text-muted">
                  {e.username} · {new Date(e.createdAt).toLocaleTimeString()}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="border-t border-line pt-2 text-xs text-muted">
        Total violations: {data?.violations ?? unique.length}
      </div>
    </div>
  );
}

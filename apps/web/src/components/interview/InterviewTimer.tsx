import { Timer } from 'lucide-react';
import type { InterviewStateDto } from '@devhub/shared';
import { formatClock } from '../../lib/audio';
import { cn } from '../../lib/utils';
import { useServerNow } from '../../lib/interview';

/**
 * Counts down to the server's deadline, so every participant sees the same time regardless
 * of when they joined or how wrong their clock is.
 */
export function InterviewTimer({
  state,
  offsetMs,
  className,
}: {
  state: InterviewStateDto;
  offsetMs: number;
  className?: string;
}) {
  const running = Boolean(state.startedAt && !state.endedAt);
  const now = useServerNow(offsetMs, running);
  const remaining = state.endsAt
    ? Date.parse(state.endsAt) - (state.endedAt ? Date.parse(state.endedAt) : now)
    : state.durationMinutes * 60_000;
  const text = state.startedAt
    ? formatClock(remaining)
    : formatClock(state.durationMinutes * 60_000);
  const tone = !state.startedAt
    ? 'text-muted'
    : state.endedAt
      ? 'text-muted'
      : remaining <= 0
        ? 'text-danger'
        : remaining <= 5 * 60_000
          ? 'text-warning'
          : 'text-fg';
  const label = !state.startedAt
    ? `Interview not started, ${state.durationMinutes} minutes`
    : state.endedAt
      ? 'Interview ended'
      : remaining <= 0
        ? `Over time by ${formatClock(-remaining)}`
        : `${formatClock(remaining)} left`;
  return (
    <span
      role="timer"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2.5 py-1 font-mono text-sm tabular-nums',
        tone,
        className,
      )}
    >
      <Timer className="h-3.5 w-3.5" aria-hidden />
      {state.endedAt ? 'Ended' : text}
    </span>
  );
}

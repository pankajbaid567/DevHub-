import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, CheckCircle2, ShieldAlert, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ModerationItemDto } from '@devhub/shared';
import { api, errorMessage } from '../../lib/api';
import { useDocumentTitle } from '../../lib/hooks';
import { displayName, timeAgo } from '../../lib/utils';
import { Badge, Card, EmptyState, ErrorState, Skeleton } from '../../components/ui/primitives';
import { Button } from '../../components/ui/Button';

const VERDICT = {
  likely_violation: { label: 'Likely violation', tone: 'danger' },
  unclear: { label: 'Unclear', tone: 'warning' },
  likely_ok: { label: 'Likely fine', tone: 'success' },
} as const;

/**
 * Admin moderation queue. Items are ordered by the AI triage verdict, then report count, then
 * age; the AI only prioritises, the moderator decides.
 */
export default function Moderation() {
  useDocumentTitle('Moderation');
  const qc = useQueryClient();
  const queue = useQuery({
    queryKey: ['moderation'],
    queryFn: () => api<ModerationItemDto[]>('/admin/moderation'),
    refetchInterval: 15_000,
  });
  const resolve = useMutation({
    mutationFn: (v: { item: ModerationItemDto; action: 'dismiss' | 'remove' }) =>
      api<{ resolved: number }>('/admin/moderation/resolve', {
        method: 'POST',
        body: { targetType: v.item.targetType, targetId: v.item.targetId, action: v.action },
      }),
    onSuccess: (r, v) => {
      toast.success(
        `${v.action === 'remove' ? 'Removed' : 'Dismissed'} (${r.resolved} report${r.resolved === 1 ? '' : 's'} closed)`,
      );
      void qc.invalidateQueries({ queryKey: ['moderation'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <ShieldAlert className="h-6 w-6 text-accent" aria-hidden /> Moderation queue
      </h1>
      <p className="mt-1 text-sm text-muted">
        Reported posts, ordered by AI triage, number of reports and age. Decisions apply to every
        open report on the item.
      </p>
      <div className="mt-6 space-y-4">
        {queue.isPending ? (
          <Skeleton className="h-32" />
        ) : queue.isError ? (
          <ErrorState message={errorMessage(queue.error)} onRetry={() => void queue.refetch()} />
        ) : queue.data.length === 0 ? (
          <EmptyState icon={<CheckCircle2 />} title="All clear">
            No open reports.
          </EmptyState>
        ) : (
          queue.data.map((item) => (
            <Card key={`${item.targetType}:${item.targetId}`} className="p-5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <Badge>{item.targetType.toLowerCase()}</Badge>
                <span>
                  {item.reportCount} report{item.reportCount === 1 ? '' : 's'} ·{' '}
                  {item.reasons.join(', ').toLowerCase().replace(/_/g, ' ')}
                </span>
                <span aria-hidden>·</span>
                <span>first {timeAgo(item.firstReportedAt)}</span>
                {item.triage ? (
                  <Badge tone={VERDICT[item.triage.verdict].tone} className="ml-auto">
                    <Bot className="h-3 w-3" aria-hidden /> {VERDICT[item.triage.verdict].label} ·{' '}
                    {Math.round(item.triage.confidence * 100)}%
                  </Badge>
                ) : (
                  <Badge className="ml-auto">AI triage pending</Badge>
                )}
              </div>
              <Link to={item.link} className="mt-2 block font-semibold hover:text-accent">
                {item.title}
              </Link>
              <p className="mt-1 line-clamp-3 text-sm whitespace-pre-wrap text-muted">
                {item.excerpt}
              </p>
              {item.author && (
                <p className="mt-2 text-xs text-muted">
                  by {displayName(item.author)} · {item.author.reputation} rep
                </p>
              )}
              {item.triage && (
                <p className="mt-2 text-xs italic text-muted">AI: {item.triage.reason}</p>
              )}
              {item.details.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-xs text-muted">
                  {item.details.map((d, i) => (
                    <li key={i}>“{d}”</li>
                  ))}
                </ul>
              )}
              <div className="mt-4 flex gap-2">
                <Button
                  size="sm"
                  variant="danger"
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  loading={
                    resolve.isPending &&
                    resolve.variables?.item === item &&
                    resolve.variables.action === 'remove'
                  }
                  onClick={() => resolve.mutate({ item, action: 'remove' })}
                >
                  Remove content
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => resolve.mutate({ item, action: 'dismiss' })}
                >
                  Dismiss reports
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

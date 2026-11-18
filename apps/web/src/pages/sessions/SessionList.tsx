import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CalendarClock, Lock, Plus, Radio, Users } from 'lucide-react';
import type { Paginated, SessionDto } from '@devhub/shared';
import { api, errorMessage } from '../../lib/api';
import { qk } from '../../lib/queryClient';
import { useAuth } from '../../auth/context';
import { useDocumentTitle, useUrlState } from '../../lib/hooks';
import { formatDateTime, timeAgo } from '../../lib/utils';
import { ButtonLink } from '../../components/ui/Button';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Pagination,
  SegmentedControl,
  Skeleton,
  TagLink,
} from '../../components/ui/primitives';
import { UserChip } from '../../components/UserChip';

function SessionCard({ s }: { s: SessionDto }) {
  const full = s.participantCount >= s.maxParticipants;
  return (
    <Card className="flex flex-col p-5 transition-shadow hover:shadow-glow">
      <div className="flex items-center gap-2">
        {s.status === 'LIVE' ? (
          <Badge tone="danger">
            <Radio className="h-3 w-3" /> Live
          </Badge>
        ) : s.status === 'SCHEDULED' ? (
          <Badge tone="accent">
            <CalendarClock className="h-3 w-3" />{' '}
            {s.scheduledFor ? formatDateTime(s.scheduledFor) : 'Scheduled'}
          </Badge>
        ) : (
          <Badge>Ended</Badge>
        )}
        {s.visibility === 'PRIVATE' && (
          <Badge>
            <Lock className="h-3 w-3" /> Private
          </Badge>
        )}
        <Badge className="ml-auto font-mono">{s.language}</Badge>
      </div>
      <Link to={`/sessions/${s.id}`} className="mt-3 text-lg font-semibold hover:text-accent">
        {s.title}
      </Link>
      {s.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{s.description}</p>}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {s.tags.map((t) => (
          <TagLink key={t} name={t} />
        ))}
      </div>
      <div className="mt-auto flex items-center justify-between pt-4 text-sm">
        <UserChip
          user={s.host}
          size={22}
          meta={s.status === 'LIVE' && s.startedAt ? `started ${timeAgo(s.startedAt)}` : undefined}
        />
        <span className={full ? 'text-danger' : 'text-muted'}>
          <Users className="mr-1 inline h-4 w-4" />
          {s.participantCount}/{s.maxParticipants}
        </span>
      </div>
      <ButtonLink
        to={`/sessions/${s.id}`}
        variant={s.myRole ? 'primary' : 'outline'}
        className="mt-4"
        aria-disabled={full && !s.myRole}
      >
        {s.myRole ? 'Open room' : s.status === 'ENDED' ? 'View' : full ? 'Full' : 'Join'}
      </ButtonLink>
    </Card>
  );
}

export default function SessionList() {
  const { status } = useAuth();
  const [url, setUrl] = useUrlState({ scope: 'public', page: '1' });
  useDocumentTitle('Live sessions');
  const params = {
    scope: status === 'authenticated' ? url.scope : 'public',
    page: Number(url.page) || 1,
    limit: 12,
  };
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: qk.sessions.list(params),
    queryFn: () => api<Paginated<SessionDto>>('/sessions', { query: params }),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000, // participant counts change; poll gently
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Live coding sessions</h1>
          <p className="mt-1 text-sm text-muted">
            Pair-program in a shared editor with real-time cursors and chat.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {status === 'authenticated' && (
            <SegmentedControl
              label="Which sessions"
              value={url.scope as 'public' | 'mine'}
              onChange={(scope) => setUrl({ scope })}
              options={[
                { value: 'public', label: 'Discover' },
                { value: 'mine', label: 'Mine' },
              ]}
            />
          )}
          <ButtonLink to="/sessions/new" icon={<Plus className="h-4 w-4" />}>
            New session
          </ButtonLink>
        </div>
      </div>
      <div className="mt-6">
        {isPending ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-56" />
            ))}
          </div>
        ) : isError ? (
          <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
        ) : data.items.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title="No sessions right now"
            action={<ButtonLink to="/sessions/new">Start one</ButtonLink>}
          >
            Host a session and invite others to code with you.
          </EmptyState>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((s) => (
              <SessionCard key={s.id} s={s} />
            ))}
          </div>
        )}
      </div>
      {data && (
        <Pagination
          page={data.meta.page}
          totalPages={data.meta.totalPages}
          onChange={(p) => setUrl({ page: String(p) })}
        />
      )}
    </div>
  );
}

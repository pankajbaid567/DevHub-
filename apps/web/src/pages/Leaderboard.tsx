import { useQuery } from '@tanstack/react-query';
import { Crown, Medal, Trophy } from 'lucide-react';
import { REPUTATION, type LeaderboardEntry } from '@devhub/shared';
import { api, errorMessage } from '../lib/api';
import { qk } from '../lib/queryClient';
import { useAuth } from '../auth/context';
import { useDocumentTitle } from '../lib/hooks';
import { cn } from '../lib/utils';
import { Card, ErrorState, Skeleton } from '../components/ui/primitives';
import { UserChip } from '../components/UserChip';

const RULES = [
  ['Your answer is accepted', REPUTATION.ANSWER_ACCEPTED],
  ['Your answer is upvoted', REPUTATION.ANSWER_UPVOTED],
  ['Your question is upvoted', REPUTATION.QUESTION_UPVOTED],
  ['Your post is downvoted', REPUTATION.ANSWER_DOWNVOTED],
  ['You downvote an answer', REPUTATION.DOWNVOTE_COST],
] as const;

export default function Leaderboard() {
  const { user } = useAuth();
  useDocumentTitle('Leaderboard');
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: [...qk.leaderboard, 50],
    queryFn: () => api<LeaderboardEntry[]>('/users/leaderboard', { query: { limit: 50 } }),
  });

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_18rem]">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Trophy className="h-6 w-6 text-warning" /> Leaderboard
        </h1>
        <p className="mt-1 text-sm text-muted">
          Top contributors by reputation. Updated every minute.
        </p>
        <Card className="mt-6 overflow-hidden">
          {isPending ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-8" />
              ))}
            </div>
          ) : isError ? (
            <div className="p-6">
              <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-surface-2 text-left text-xs text-muted uppercase">
                <tr>
                  <th scope="col" className="w-16 px-4 py-3">
                    Rank
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Developer
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Answers
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Reputation
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.map((u) => (
                  <tr key={u.id} className={cn(u.id === user?.id && 'bg-accent-soft/60')}>
                    <td className="px-4 py-3 font-semibold">
                      {u.rank === 1 ? (
                        <Crown className="h-5 w-5 text-warning" aria-label="1st" />
                      ) : u.rank <= 3 ? (
                        <Medal
                          className={cn('h-5 w-5', u.rank === 2 ? 'text-muted' : 'text-orange-500')}
                          aria-label={`${u.rank}th`}
                        />
                      ) : (
                        u.rank
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <UserChip user={u} size={28} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{u.answers}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      {u.reputation.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
      <aside>
        <Card className="sticky top-24 p-5">
          <h2 className="font-semibold">How reputation works</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {RULES.map(([label, delta]) => (
              <li key={label} className="flex justify-between gap-3">
                <span className="text-muted">{label}</span>
                <span
                  className={cn(
                    'font-mono font-semibold',
                    delta > 0 ? 'text-success' : 'text-danger',
                  )}
                >
                  {delta > 0 ? `+${delta}` : delta}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted">
            Every change is recorded in an audit ledger, and retracting a vote reverses it exactly.
          </p>
        </Card>
      </aside>
    </div>
  );
}

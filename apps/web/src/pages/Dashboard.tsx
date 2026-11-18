import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Award,
  Bell,
  CheckCircle2,
  Code2,
  MessageSquarePlus,
  MessageSquareText,
  Radio,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { ActivityItem, DashboardDto } from '@devhub/shared';
import { api, errorMessage } from '../lib/api';
import { qk } from '../lib/queryClient';
import { useDocumentTitle } from '../lib/hooks';
import { displayName, timeAgo } from '../lib/utils';
import { ButtonLink } from '../components/ui/Button';
import { Card, ErrorState, Skeleton, TagLink } from '../components/ui/primitives';

/** Dependency-free SVG sparkline of reputation over the last 30 days. */
function Sparkline({ points }: { points: { date: string; reputation: number }[] }) {
  if (points.length < 2) return null;
  const values = points.map((p) => p.reputation);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 300;
  const h = 64;
  const xy = values.map(
    (v, i) => [(i / (values.length - 1)) * w, h - 4 - ((v - min) / span) * (h - 8)] as const,
  );
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="h-16 w-full"
      role="img"
      aria-label={`Reputation went from ${values[0]} to ${values[values.length - 1]} over 30 days`}
    >
      <defs>
        <linearGradient id="rep" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.3" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill="url(#rep)" />
      <path
        d={line}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

const REASON: Record<string, string> = {
  QUESTION_VOTE: 'question vote',
  ANSWER_VOTE: 'answer vote',
  ANSWER_ACCEPTED: 'accepted answer',
  DOWNVOTE_CAST: 'downvote cast',
};

function Activity({ item }: { item: ActivityItem }) {
  switch (item.type) {
    case 'question':
      return (
        <Link to={`/questions/${item.id}`} className="flex items-center gap-3 hover:text-accent">
          <MessageSquareText className="h-4 w-4 shrink-0 text-muted" />{' '}
          <span className="truncate">Asked “{item.title}”</span>
        </Link>
      );
    case 'answer':
      return (
        <Link
          to={`/questions/${item.questionId}#answer-${item.id}`}
          className="flex items-center gap-3 hover:text-accent"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-muted" />{' '}
          <span className="truncate">Answered “{item.questionTitle}”</span>
        </Link>
      );
    case 'snippet':
      return (
        <Link to={`/snippets/${item.id}`} className="flex items-center gap-3 hover:text-accent">
          <Code2 className="h-4 w-4 shrink-0 text-muted" />{' '}
          <span className="truncate">Shared “{item.title}”</span>
        </Link>
      );
    case 'reputation':
      return (
        <span className="flex items-center gap-3">
          <Award className="h-4 w-4 shrink-0 text-muted" />
          <span className={item.delta >= 0 ? 'text-success' : 'text-danger'}>
            {item.delta > 0 ? '+' : ''}
            {item.delta}
          </span>
          reputation from {REASON[item.reason] ?? item.reason}
        </span>
      );
  }
}

export default function Dashboard() {
  useDocumentTitle('Dashboard');
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: qk.dashboard,
    queryFn: () => api<DashboardDto>('/users/me/dashboard'),
  });

  if (isPending)
    return (
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  if (isError)
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
      </div>
    );

  const { user, stats } = data;
  const tiles = [
    {
      label: 'Reputation',
      value: user.reputation,
      sub: `${stats.reputationThisWeek >= 0 ? '+' : ''}${stats.reputationThisWeek} this week`,
      icon: TrendingUp,
    },
    {
      label: 'Answers',
      value: stats.answers,
      sub: `${stats.acceptedAnswers} accepted`,
      icon: CheckCircle2,
    },
    { label: 'Questions', value: stats.questions, sub: 'asked', icon: MessageSquareText },
    {
      label: 'Snippets',
      value: stats.snippets,
      sub: `${stats.sessionsHosted} sessions hosted`,
      icon: Code2,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Welcome back, {displayName(user)} 👋</h1>
          <p className="mt-1 text-sm text-muted">
            {stats.unreadNotifications > 0 ? (
              <span className="inline-flex items-center gap-1">
                <Bell className="h-3.5 w-3.5" /> {stats.unreadNotifications} unread notifications
              </span>
            ) : (
              "Here's what's happening in your corner of DevHub+."
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink to="/questions/ask" icon={<MessageSquarePlus className="h-4 w-4" />}>
            Ask
          </ButtonLink>
          <ButtonLink to="/sessions/new" variant="outline" icon={<Users className="h-4 w-4" />}>
            Host a session
          </ButtonLink>
          <ButtonLink to="/mentor" variant="outline" icon={<Sparkles className="h-4 w-4" />}>
            Ask the mentor
          </ButtonLink>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} className="p-5">
            <div className="flex items-center justify-between text-sm text-muted">
              {t.label} <t.icon className="h-4 w-4" />
            </div>
            <p className="mt-2 text-3xl font-bold tabular-nums">{t.value}</p>
            <p className="mt-1 text-xs text-muted">{t.sub}</p>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Reputation, last 30 days</h2>
            <Link to={`/u/${user.username}`} className="text-sm text-accent hover:underline">
              Public profile
            </Link>
          </div>
          <div className="mt-4">
            <Sparkline points={data.reputationHistory} />
          </div>
          <h2 className="mt-6 font-semibold">Recent activity</h2>
          {data.recentActivity.length ? (
            <ul className="mt-3 space-y-3 text-sm">
              {data.recentActivity.map((a, i) => (
                <li key={i} className="flex items-center justify-between gap-4">
                  <Activity item={a} />
                  <span className="shrink-0 text-xs text-muted">{timeAgo(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">
              No activity yet. Answer a question to earn your first reputation.
            </p>
          )}
        </Card>
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <Radio className="h-4 w-4 text-danger" /> Live now
            </h2>
            {data.liveSessions.length ? (
              <ul className="mt-3 space-y-2 text-sm">
                {data.liveSessions.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2">
                    <Link to={`/sessions/${s.id}`} className="truncate hover:text-accent">
                      {s.title}
                    </Link>
                    <span className="text-xs text-muted">
                      <Users className="mr-0.5 inline h-3 w-3" />
                      {s.participantCount}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted">No live sessions. Start one!</p>
            )}
          </Card>
          <Card className="p-5">
            <h2 className="font-semibold">Unanswered in your tags</h2>
            {data.unansweredInMyTags.length ? (
              <ul className="mt-3 space-y-3 text-sm">
                {data.unansweredInMyTags.map((q) => (
                  <li key={q.id}>
                    <Link to={`/questions/${q.id}`} className="hover:text-accent">
                      {q.title}
                    </Link>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {q.tags.slice(0, 3).map((t) => (
                        <TagLink key={t} name={t} />
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted">
                Answer a few questions and we'll suggest more in the tags you know.
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { History, Mic, Plus } from 'lucide-react';
import type { InterviewHistoryDto, InterviewHistoryItemDto, Recommendation } from '@devhub/shared';
import { api } from '../lib/api';
import { useDocumentTitle } from '../lib/hooks';
import { cn } from '../lib/utils';
import { Badge, Card, EmptyState, ErrorState, Skeleton } from '../components/ui/primitives';
import { ButtonLink } from '../components/ui/Button';

const REC: Record<Recommendation, { label: string; tone: 'success' | 'danger' }> = {
  STRONG_NO: { label: 'Strong no', tone: 'danger' },
  NO: { label: 'No', tone: 'danger' },
  YES: { label: 'Yes', tone: 'success' },
  STRONG_YES: { label: 'Strong yes', tone: 'success' },
};
const ROLE: Record<InterviewHistoryItemDto['role'], string> = {
  practice: 'Practice',
  candidate: 'Candidate',
  interviewer: 'Interviewer',
};
const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const fullDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** Your mock interviews: progress over time, and every session with its results and replay. */
export default function InterviewHistory() {
  useDocumentTitle('Your interviews');
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['interview-history'],
    queryFn: () => api<InterviewHistoryDto>('/sessions/interview/history'),
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-2xl font-bold">Your interviews</h1>
          <p className="mt-1 text-sm text-muted">
            Practice runs, interviews you gave and interviews you took, with test results, AI
            feedback and replays.
          </p>
        </div>
        <ButtonLink
          to="/sessions/new?mode=interview"
          className="ml-auto"
          icon={<Plus className="h-4 w-4" />}
        >
          New mock interview
        </ButtonLink>
      </div>

      {isPending ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : isError ? (
        <div className="mt-6">
          <ErrorState message="Could not load your interviews" onRetry={() => refetch()} />
        </div>
      ) : data.items.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<Mic />}
            title="No interviews yet"
            action={
              <ButtonLink to="/sessions/new?mode=interview">Start a mock interview</ButtonLink>
            }
          >
            Set one up with a friend, or practise alone with the AI voice interviewer. Your results
            will collect here.
          </EmptyState>
        </div>
      ) : (
        <>
          <Stats stats={data.stats} />
          <ScoreChart items={data.items} />
          <Card className="mt-6 overflow-hidden">
            <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">All interviews</h2>
            <ul className="divide-y divide-line">
              {data.items.map((i) => (
                <InterviewRow key={i.sessionId} item={i} />
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}

function Stats({ stats }: { stats: InterviewHistoryDto['stats'] }) {
  const tiles = [
    {
      label: 'Interviews',
      value: String(stats.interviews),
      hint: [
        stats.practice && `${stats.practice} practice`,
        stats.asCandidate && `${stats.asCandidate} as candidate`,
        stats.asInterviewer && `${stats.asInterviewer} as interviewer`,
      ]
        .filter(Boolean)
        .join(' · '),
    },
    {
      label: 'Average AI score',
      value: stats.averageScore === null ? '–' : stats.averageScore.toFixed(1),
      unit: stats.averageScore === null ? '' : '/ 4',
      hint:
        stats.averageScore === null
          ? 'Get feedback after a voice interview'
          : 'Across interviews with feedback',
    },
    {
      label: 'Solved',
      value: stats.solvedRate === null ? '–' : `${Math.round(stats.solvedRate * 100)}%`,
      hint:
        stats.solvedRate === null
          ? 'Run the tests in an interview'
          : 'Interviews where every test passed',
    },
  ];
  return (
    <dl className="mt-6 grid gap-3 sm:grid-cols-3">
      {tiles.map((t) => (
        <Card key={t.label} className="p-4">
          <dt className="text-sm text-muted">{t.label}</dt>
          <dd className="mt-1">
            <span className="text-3xl font-bold tabular-nums">{t.value}</span>
            {t.unit && <span className="ml-1 text-sm text-muted">{t.unit}</span>}
            <span className="mt-1 block text-xs text-muted">{t.hint}</span>
          </dd>
        </Card>
      ))}
    </dl>
  );
}

/**
 * AI feedback score over time: one series, so no legend (the title names it). Thin 2px line,
 * 8px markers with a surface ring, recessive grid at the four score levels, and a tooltip per
 * point with a hit target larger than the marker. The list below is the table view.
 */
function ScoreChart({ items }: { items: InterviewHistoryItemDto[] }) {
  const points = useMemo(
    () =>
      items
        .filter((i) => i.feedback)
        .map((i) => ({ item: i, t: Date.parse(i.feedback!.createdAt), y: i.feedback!.average }))
        .sort((a, b) => a.t - b.t),
    [items],
  );
  const [hover, setHover] = useState<number | null>(null);
  // Draw at the real pixel width so text and markers keep their size on every screen.
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [points.length]);
  if (points.length < 2)
    return (
      <Card className="mt-6 p-4">
        <h2 className="text-sm font-semibold">AI feedback score over time</h2>
        <p className="mt-1 text-sm text-muted">
          {points.length === 0
            ? 'Talk to the AI interviewer and ask for feedback to start tracking your progress.'
            : 'One scored interview so far. Do another to see your trend.'}
        </p>
      </Card>
    );

  const W = Math.max(width, 240);
  const H = W < 500 ? 180 : 220;
  const sameDay = points.at(-1)!.t - points[0]!.t < 86_400_000;
  const tick = (t: number) => (sameDay ? timeFmt : dateFmt).format(t);
  const pad = { l: 28, r: 16, t: 12, b: 26 };
  const x = (i: number) => pad.l + (i / (points.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + ((4 - v) / 3) * (H - pad.t - pad.b);
  const path = points
    .map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`)
    .join('');
  const active = hover === null ? null : points[hover]!;

  return (
    <Card className="mt-6 p-4">
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm font-semibold">AI feedback score over time</h2>
        <span className="text-xs text-muted">average of four dimensions, 1 to 4</span>
      </div>
      <div ref={box} className="relative mt-3">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full overflow-visible"
          role="img"
          aria-label={`AI feedback score over ${points.length} interviews, from ${points[0]!.y.toFixed(1)} to ${points.at(-1)!.y.toFixed(1)}`}
          onMouseLeave={() => setHover(null)}
        >
          {[1, 2, 3, 4].map((v) => (
            <g key={v}>
              <line
                x1={pad.l}
                x2={W - pad.r}
                y1={y(v)}
                y2={y(v)}
                className="stroke-line"
                strokeWidth={1}
              />
              <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" className="fill-muted text-[11px]">
                {v}
              </text>
            </g>
          ))}
          {points.map((p, i) =>
            i === 0 || i === points.length - 1 || points.length <= Math.floor(W / 110) ? (
              <text
                key={`d${i}`}
                x={x(i)}
                y={H - 6}
                textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
                className="fill-muted text-[11px]"
              >
                {tick(p.t)}
              </text>
            ) : null,
          )}
          <path
            d={path}
            fill="none"
            className="stroke-accent"
            strokeWidth={2}
            strokeLinejoin="round"
          />
          {active && (
            <line
              x1={x(hover!)}
              x2={x(hover!)}
              y1={pad.t}
              y2={H - pad.b}
              className="stroke-muted"
              strokeDasharray="3 3"
            />
          )}
          {points.map((p, i) => (
            <g key={p.item.sessionId}>
              <circle
                cx={x(i)}
                cy={y(p.y)}
                r={hover === i ? 6 : 4}
                className="fill-accent stroke-surface"
                strokeWidth={2}
              />
              <circle
                cx={x(i)}
                cy={y(p.y)}
                r={16}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                tabIndex={0}
                aria-label={`${p.item.problemTitle ?? p.item.title}: ${p.y.toFixed(1)} of 4`}
              />
            </g>
          ))}
        </svg>
        {active && (
          <div
            role="tooltip"
            className={cn(
              'pointer-events-none absolute z-10 -translate-y-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs whitespace-nowrap shadow-lg',
              // Keep it inside the card at the edges.
              hover === 0
                ? ''
                : hover === points.length - 1
                  ? '-translate-x-full'
                  : '-translate-x-1/2',
            )}
            style={{
              left: `${(x(hover!) / W) * 100}%`,
              top: `${(y(active.y) / H) * 100}%`,
              marginTop: -10,
            }}
          >
            <p className="font-semibold">{active.item.problemTitle ?? active.item.title}</p>
            <p className="text-muted">
              {fullDate.format(active.t)} ·{' '}
              <span className="font-medium text-fg">{active.y.toFixed(1)} / 4</span>
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

function InterviewRow({ item: i }: { item: InterviewHistoryItemDto }) {
  const tests = i.bestSubmission;
  const rec = i.myRecommendation ?? i.feedback?.recommendation;
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <div className="min-w-0 flex-1 basis-64">
        <Link to={`/sessions/${i.sessionId}`} className="font-medium hover:underline">
          {i.title}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          {i.problemTitle && <span>{i.problemTitle}</span>}
          {i.difficulty && (
            <Badge
              tone={
                i.difficulty === 'Easy'
                  ? 'success'
                  : i.difficulty === 'Medium'
                    ? 'warning'
                    : 'danger'
              }
            >
              {i.difficulty}
            </Badge>
          )}
          <Badge>{ROLE[i.role]}</Badge>
          <span>{fullDate.format(Date.parse(i.startedAt ?? i.createdAt))}</span>
          {i.status === 'LIVE' && <Badge tone="danger">Live</Badge>}
        </div>
      </div>
      <dl className="flex items-center gap-4 text-sm">
        <div className="text-center">
          <dt className="text-xs text-muted">Tests</dt>
          <dd
            className={cn(
              'font-semibold tabular-nums',
              tests && (tests.passed === tests.total ? 'text-success' : 'text-danger'),
            )}
          >
            {tests ? `${tests.passed}/${tests.total}` : '–'}
          </dd>
        </div>
        <div className="text-center">
          <dt className="text-xs text-muted">AI score</dt>
          <dd className="font-semibold tabular-nums">
            {i.feedback ? i.feedback.average.toFixed(1) : '–'}
          </dd>
        </div>
        <div className="w-20 text-center">
          <dt className="text-xs text-muted">{i.myRecommendation ? 'Your call' : 'Verdict'}</dt>
          <dd>{rec ? <Badge tone={REC[rec].tone}>{REC[rec].label}</Badge> : '–'}</dd>
        </div>
      </dl>
      <ButtonLink
        to={`/sessions/${i.sessionId}/replay`}
        size="sm"
        variant="ghost"
        icon={<History className="h-3.5 w-3.5" />}
        aria-label={`Replay ${i.title}`}
      >
        Replay
      </ButtonLink>
    </li>
  );
}

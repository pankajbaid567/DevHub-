import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Code2,
  GitFork,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';
import type { LeaderboardEntry, Paginated, QuestionSummaryDto } from '@devhub/shared';
import { api } from '../lib/api';
import { qk } from '../lib/queryClient';
import { useAuth } from '../auth/context';
import { ButtonLink } from '../components/ui/Button';
import { Card } from '../components/ui/primitives';
import { UserChip } from '../components/UserChip';
import { Link } from 'react-router-dom';
import { plural } from '../lib/utils';

const FEATURES = [
  {
    icon: MessageSquareText,
    title: 'Q&A with real reputation',
    body: 'Ask, answer and vote. Accepted answers and upvotes build a reputation backed by an auditable ledger.',
  },
  {
    icon: Users,
    title: 'Live collaborative coding',
    body: 'Pair-program in a shared Monaco editor and whiteboard synced with CRDTs, with a peer-to-peer video call, cursors and chat.',
  },
  {
    icon: Bot,
    title: 'AI mentor that streams',
    body: 'Debugging, code review and system design coaching, streamed token by token, with your history kept.',
  },
  {
    icon: Code2,
    title: 'Snippet library',
    body: 'Share, star and fork reusable code with syntax highlighting and public, unlisted or private visibility.',
  },
  {
    icon: Sparkles,
    title: 'Career tools',
    body: 'Upload a resume PDF for a structured, ATS-aware review and turn self-rated skills into a roadmap.',
  },
  {
    icon: ShieldCheck,
    title: 'Built like production',
    body: 'Rotating refresh tokens, rate limits, input validation everywhere, observability and 100+ automated tests.',
  },
];

export default function Home() {
  const { status } = useAuth();
  const { data: questions } = useQuery({
    queryKey: qk.questions.list({ sort: 'votes', limit: 4 }),
    queryFn: () =>
      api<Paginated<QuestionSummaryDto>>('/questions', { query: { sort: 'votes', limit: 4 } }),
  });
  const { data: leaders } = useQuery({
    queryKey: qk.leaderboard,
    queryFn: () => api<LeaderboardEntry[]>('/users/leaderboard', { query: { limit: 5 } }),
  });

  return (
    <div>
      <section className="relative overflow-hidden border-b border-line">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--accent-soft),transparent_60%)]"
        />
        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-3xl animate-slide-up text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted">
              <Zap className="h-3.5 w-3.5 text-accent" /> Real-time · AI-assisted · Open source
            </span>
            <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-6xl">
              Where developers{' '}
              <span className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-transparent">
                learn, build and ship
              </span>{' '}
              together
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted">
              Ask the community, pair-program live in a shared editor, keep a library of snippets
              and get mentoring from an AI that knows when to say “I'm not sure”.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              {status === 'authenticated' ? (
                <ButtonLink to="/dashboard" size="lg" icon={<ArrowRight className="h-4 w-4" />}>
                  Go to your dashboard
                </ButtonLink>
              ) : (
                <ButtonLink to="/register" size="lg" icon={<ArrowRight className="h-4 w-4" />}>
                  Create a free account
                </ButtonLink>
              )}
              <ButtonLink to="/questions" variant="outline" size="lg">
                Browse questions
              </ButtonLink>
            </div>
            <p className="mt-4 text-xs text-muted">Demo login: ada@devhub.dev · password123</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6" aria-labelledby="features">
        <h2 id="features" className="text-center text-2xl font-bold sm:text-3xl">
          Everything a developer community needs
        </h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Card key={f.title} className="p-6 transition-shadow hover:shadow-glow">
              <f.icon className="h-6 w-6 text-accent" aria-hidden />
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-4 pb-8 sm:px-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Top questions</h2>
            <Link to="/questions?sort=votes" className="text-sm text-accent hover:underline">
              View all
            </Link>
          </div>
          <ul className="mt-4 divide-y divide-line">
            {questions?.items.map((q) => (
              <li key={q.id} className="py-3">
                <Link to={`/questions/${q.id}`} className="font-medium hover:text-accent">
                  {q.title}
                </Link>
                <p className="mt-1 flex items-center gap-3 text-xs text-muted">
                  <span>{plural(q.score, 'vote')}</span>
                  <span
                    className={
                      q.hasAcceptedAnswer ? 'inline-flex items-center gap-1 text-success' : ''
                    }
                  >
                    {q.hasAcceptedAnswer && <CheckCircle2 className="h-3 w-3" />}
                    {plural(q.answerCount, 'answer')}
                  </span>
                  <span>{plural(q.viewCount, 'view')}</span>
                </p>
              </li>
            )) ?? <li className="py-6 text-sm text-muted">Loading…</li>}
          </ul>
        </Card>
        <Card className="p-6">
          <h2 className="flex items-center gap-2 font-semibold">
            <Trophy className="h-4 w-4 text-warning" /> Top contributors
          </h2>
          <ol className="mt-4 space-y-3">
            {leaders?.map((u) => (
              <li key={u.id} className="flex items-center gap-3">
                <span className="w-5 text-sm font-semibold text-muted">{u.rank}</span>
                <UserChip user={u} />
              </li>
            ))}
          </ol>
          <div className="mt-6 flex items-center gap-2 rounded-lg bg-surface-2 p-3 text-xs text-muted">
            <GitFork className="h-4 w-4" /> Reputation is earned through upvotes and accepted
            answers.
          </div>
        </Card>
      </section>
    </div>
  );
}

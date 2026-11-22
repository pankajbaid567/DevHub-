import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  Clock,
  Filter,
  Flame,
  PenTool,
  Search,
  Trophy,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  BADGE_DEFINITIONS,
  CP_PLATFORM_LABELS,
  CP_PLATFORMS,
  type CpProfileDto,
  type Difficulty,
  type ProblemProgressDto,
  type UserBadgeDto,
} from '@devhub/shared';
import { api, errorMessage } from '../lib/api';
import { qk, queryClient } from '../lib/queryClient';
import { useAuth } from '../auth/context';
import { useDocumentTitle, useUrlState } from '../lib/hooks';
import {
  Card,
  ErrorState,
  SegmentedControl,
  Skeleton,
} from '../components/ui/primitives';
import { Button, ButtonLink } from '../components/ui/Button';
import { Input } from '../components/ui/Field';

interface ProblemItem {
  slug: string;
  title: string;
  difficulty: Difficulty;
  topics: string[];
  category: string;
  useWhiteboard?: boolean;
  progress: ProblemProgressDto | null;
  bookmarked: boolean;
}

interface ProblemsResponse {
  dsa: ProblemItem[];
  systemDesign: ProblemItem[];
}

const diffColor: Record<Difficulty, string> = {
  Easy: 'text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-900/30',
  Medium: 'text-yellow-600 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-900/30',
  Hard: 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/30',
};

function StatusIcon({ progress }: { progress: ProblemProgressDto | null }) {
  if (!progress) return null;
  if (progress.status === 'SOLVED')
    return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  return <Clock className="h-4 w-4 text-yellow-500" />;
}

function ProblemRow({
  p,
  onToggleBookmark,
}: {
  p: ProblemItem;
  onToggleBookmark: (slug: string) => void;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 transition-colors">
      <StatusIcon progress={p.progress} />
      <div className="min-w-0 flex-1">
        <Link
          to={`/sessions/new?problem=${p.slug}`}
          className="font-medium hover:text-accent transition-colors"
        >
          {p.title}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${diffColor[p.difficulty]}`}>
            {p.difficulty}
          </span>
          {p.topics.slice(0, 3).map((t) => (
            <span key={t} className="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-muted">
              {t}
            </span>
          ))}
          {p.useWhiteboard && (
            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
              whiteboard
            </span>
          )}
        </div>
      </div>
      {p.progress && (
        <span className="text-xs text-muted">
          {p.progress.bestPassed}/{p.progress.bestTotal}
        </span>
      )}
      <button
        onClick={() => onToggleBookmark(p.slug)}
        className="p-1 text-muted hover:text-accent transition-colors"
        title={p.bookmarked ? 'Remove bookmark' : 'Add bookmark'}
      >
        {p.bookmarked ? (
          <BookmarkCheck className="h-4 w-4 text-accent" />
        ) : (
          <Bookmark className="h-4 w-4" />
        )}
      </button>
    </li>
  );
}

function StreakCard() {
  const { data } = useQuery({
    queryKey: qk.practice.streak,
    queryFn: () => api<{ current: number; max: number }>('/practice/streak'),
  });
  if (!data) return null;
  return (
    <div className="flex items-center gap-3 rounded-lg bg-surface-2 p-4">
      <Flame className="h-8 w-8 text-orange-500" />
      <div>
        <p className="text-2xl font-bold">{data.current}</p>
        <p className="text-xs text-muted">day streak (max {data.max})</p>
      </div>
    </div>
  );
}

function BadgesSection() {
  const { data: badges } = useQuery({
    queryKey: qk.practice.badges,
    queryFn: () => api<UserBadgeDto[]>('/practice/badges'),
  });
  if (!badges?.length) return null;
  return (
    <Card className="p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <Trophy className="h-4 w-4" /> Badges
      </h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {badges.map((b) => (
          <span
            key={b.badge}
            className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1 text-sm"
            title={b.description}
          >
            {b.icon} {b.label}
          </span>
        ))}
      </div>
      {/* Show locked badges */}
      <div className="mt-3 flex flex-wrap gap-2 opacity-40">
        {Object.entries(BADGE_DEFINITIONS)
          .filter(([key]) => !badges.some((b) => b.badge === key))
          .map(([key, def]) => (
            <span
              key={key}
              className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1 text-sm"
              title={def.description}
            >
              {def.icon} {def.label}
            </span>
          ))}
      </div>
    </Card>
  );
}

function CpProfilesSection() {
  const { data: profiles, refetch } = useQuery({
    queryKey: qk.practice.cpProfiles,
    queryFn: () => api<CpProfileDto[]>('/practice/cp-profiles'),
  });
  const [adding, setAdding] = useState<{ platform: string; username: string } | null>(null);

  const save = useMutation({
    mutationFn: (body: { platform: string; username: string }) =>
      api('/practice/cp-profiles', { method: 'PUT', body }),
    onSuccess: () => {
      void refetch();
      setAdding(null);
      toast.success('Profile linked!');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const sync = useMutation({
    mutationFn: (platform: string) =>
      api(`/practice/cp-profiles/${platform}/sync`, { method: 'POST' }),
    onSuccess: () => {
      void refetch();
      toast.success('Synced!');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (platform: string) =>
      api('/practice/cp-profiles', { method: 'DELETE', body: { platform } }),
    onSuccess: () => void refetch(),
  });

  return (
    <Card className="p-4">
      <h2 className="font-semibold">Competitive Programming Profiles</h2>
      <div className="mt-3 space-y-2">
        {profiles?.map((cp) => (
          <div key={cp.platform} className="flex items-center gap-3 rounded-lg bg-surface-2 p-3">
            <span className="font-medium">{CP_PLATFORM_LABELS[cp.platform]}</span>
            <a
              href={cp.profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              @{cp.username}
            </a>
            {cp.stats && (
              <span className="text-xs text-muted">
                {Object.entries(cp.stats)
                  .filter(([, v]) => v != null)
                  .slice(0, 3)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(' · ')}
              </span>
            )}
            <div className="ml-auto flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => sync.mutate(cp.platform)}>
                Sync
              </Button>
              <Button size="sm" variant="ghost" onClick={() => remove.mutate(cp.platform)}>
                ×
              </Button>
            </div>
          </div>
        ))}
      </div>
      {adding ? (
        <div className="mt-3 flex gap-2">
          <select
            className="rounded border bg-surface px-2 py-1 text-sm"
            value={adding.platform}
            onChange={(e) => setAdding({ ...adding, platform: e.target.value })}
          >
            {CP_PLATFORMS.map((p) => (
              <option key={p} value={p}>{CP_PLATFORM_LABELS[p]}</option>
            ))}
          </select>
          <Input
            className="flex-1"
            placeholder="Username"
            value={adding.username}
            onChange={(e) => setAdding({ ...adding, username: e.target.value })}
          />
          <Button
            size="sm"
            onClick={() => save.mutate(adding)}
            loading={save.isPending}
          >
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAdding(null)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="outline" className="mt-3" onClick={() => setAdding({ platform: 'leetcode', username: '' })}>
          + Link profile
        </Button>
      )}
    </Card>
  );
}

export default function Practice() {
  useDocumentTitle('Practice');
  const { user } = useAuth();
  const [url, setUrl] = useUrlState({ tab: 'dsa', diff: '', topic: '', q: '' });

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: qk.practice.problems,
    queryFn: () => api<ProblemsResponse>('/practice/problems'),
  });

  const bookmark = useMutation({
    mutationFn: (slug: string) =>
      api(`/practice/bookmarks/${slug}`, { method: 'POST' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.practice.problems }),
  });

  if (isPending)
    return (
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-10">
        <Skeleton className="h-12" />
        <Skeleton className="h-96" />
      </div>
    );
  if (isError)
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
      </div>
    );

  const all = url.tab === 'dsa' ? data.dsa : data.systemDesign;
  const allTopics = [...new Set(all.flatMap((p) => p.topics))].sort();

  let filtered = all;
  if (url.diff) filtered = filtered.filter((p) => p.difficulty === url.diff);
  if (url.topic) filtered = filtered.filter((p) => p.topics.includes(url.topic));
  if (url.q)
    filtered = filtered.filter(
      (p) =>
        p.title.toLowerCase().includes(url.q.toLowerCase()) ||
        p.topics.some((t) => t.toLowerCase().includes(url.q.toLowerCase())),
    );

  const solved = all.filter((p) => p.progress?.status === 'SOLVED').length;
  const attempted = all.filter((p) => p.progress?.status === 'ATTEMPTED').length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Practice</h1>
        {user && <StreakCard />}
      </div>

      {/* Stats bar */}
      <div className="mt-4 flex flex-wrap gap-3">
        <div className="rounded-lg bg-green-50 px-3 py-1 text-sm font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
          ✓ {solved} solved
        </div>
        <div className="rounded-lg bg-yellow-50 px-3 py-1 text-sm font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
          ◷ {attempted} attempted
        </div>
        <div className="rounded-lg bg-surface-2 px-3 py-1 text-sm text-muted">
          {all.length} total
        </div>
      </div>

      <div className="mt-6">
        <SegmentedControl
          label="Problem category"
          value={url.tab}
          onChange={(v) => setUrl({ tab: v, diff: '', topic: '', q: '' })}
          options={[
            { value: 'dsa', label: `DSA (${data.dsa.length})` },
            { value: 'sd', label: `System Design (${data.systemDesign.length})` },
          ]}
        />
      </div>

      {/* Whiteboard shortcut for System Design */}
      {url.tab === 'sd' && user && (
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-dashed border-accent/40 bg-accent/5 p-3">
          <PenTool className="h-5 w-5 text-accent" />
          <span className="text-sm">Draw HLD/LLD diagrams on the whiteboard</span>
          <ButtonLink to="/whiteboard/new" size="sm" className="ml-auto">
            New Whiteboard
          </ButtonLink>
        </div>
      )}

      {/* Filters */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            className="w-full rounded-lg border bg-surface px-9 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
            placeholder="Search problems..."
            value={url.q}
            onChange={(e) => setUrl({ ...url, q: e.target.value })}
          />
        </div>
        <select
          className="rounded-lg border bg-surface px-3 py-2 text-sm"
          value={url.diff}
          onChange={(e) => setUrl({ ...url, diff: e.target.value })}
        >
          <option value="">All difficulties</option>
          <option value="Easy">Easy</option>
          <option value="Medium">Medium</option>
          <option value="Hard">Hard</option>
        </select>
        <select
          className="rounded-lg border bg-surface px-3 py-2 text-sm"
          value={url.topic}
          onChange={(e) => setUrl({ ...url, topic: e.target.value })}
        >
          <option value="">All topics</option>
          {allTopics.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        {(url.diff || url.topic || url.q) && (
          <Button
            size="sm"
            variant="ghost"
            icon={<Filter className="h-3 w-3" />}
            onClick={() => setUrl({ ...url, diff: '', topic: '', q: '' })}
          >
            Clear
          </Button>
        )}
      </div>

      {/* Problem list */}
      <Card className="mt-4 overflow-hidden">
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-muted">No problems match your filters.</p>
        ) : (
          <ul className="divide-y divide-line">
            {filtered.map((p) => (
              <ProblemRow
                key={p.slug}
                p={p}
                onToggleBookmark={(slug) => bookmark.mutate(slug)}
              />
            ))}
          </ul>
        )}
      </Card>

      {/* Badges & CP profiles (logged in only) */}
      {user && (
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <BadgesSection />
          <CpProfilesSection />
        </div>
      )}
    </div>
  );
}

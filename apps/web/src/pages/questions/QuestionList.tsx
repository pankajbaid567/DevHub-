import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CheckCircle2, MessageSquarePlus, MessageSquareText, Search, X } from 'lucide-react';
import type { Paginated, QuestionSummaryDto, TagDto } from '@devhub/shared';
import { api, errorMessage } from '../../lib/api';
import { qk } from '../../lib/queryClient';
import { useDebounced, useDocumentTitle, useUrlState } from '../../lib/hooks';
import { cn, compact, timeAgo } from '../../lib/utils';
import { ButtonLink } from '../../components/ui/Button';
import {
  Card,
  EmptyState,
  ErrorState,
  Pagination,
  SegmentedControl,
  Skeleton,
  TagLink,
} from '../../components/ui/primitives';
import { UserChip } from '../../components/UserChip';

type Sort = 'newest' | 'votes' | 'active' | 'unanswered';

function Stat({ value, label, highlight }: { value: number; label: string; highlight?: boolean }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-lg px-2 py-1 text-center',
        highlight && 'bg-success/12 text-success',
      )}
    >
      <span className="text-sm font-semibold tabular-nums">{compact(value)}</span>
      <span className="text-[11px] text-muted">{label}</span>
    </div>
  );
}

export function QuestionRow({ q }: { q: QuestionSummaryDto }) {
  return (
    <li className="flex gap-4 p-4 transition-colors hover:bg-surface-2/50 sm:p-5">
      <div className="hidden w-20 shrink-0 flex-col gap-1 sm:flex">
        <Stat value={q.score} label="votes" />
        <Stat
          value={q.answerCount}
          label={q.hasAcceptedAnswer ? 'accepted' : 'answers'}
          highlight={q.hasAcceptedAnswer}
        />
        <Stat value={q.viewCount} label="views" />
      </div>
      <div className="min-w-0 flex-1">
        <Link to={`/questions/${q.id}`} className="text-base font-semibold hover:text-accent">
          {q.hasAcceptedAnswer && (
            <CheckCircle2
              className="mr-1.5 inline h-4 w-4 text-success sm:hidden"
              aria-label="Has accepted answer"
            />
          )}
          {q.title}
        </Link>
        <p className="mt-1 line-clamp-2 text-sm text-muted">{q.excerpt}</p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {q.tags.map((t) => (
              <TagLink key={t} name={t} />
            ))}
          </div>
          <UserChip user={q.author} size={20} meta={`asked ${timeAgo(q.createdAt)}`} />
        </div>
      </div>
    </li>
  );
}

export default function QuestionList() {
  const [url, setUrl] = useUrlState({ q: '', tag: '', sort: 'newest', page: '1' });
  const [search, setSearch] = useState(url.q);
  const debounced = useDebounced(search, 350);
  useDocumentTitle(url.tag ? `Questions tagged ${url.tag}` : 'Questions');

  useEffect(() => {
    if (debounced !== url.q) setUrl({ q: debounced });
  }, [debounced, url.q, setUrl]);

  const params = { q: url.q, tag: url.tag, sort: url.sort, page: Number(url.page) || 1, limit: 15 };
  const { data, isPending, isError, error, refetch, isPlaceholderData } = useQuery({
    queryKey: qk.questions.list(params),
    queryFn: () => api<Paginated<QuestionSummaryDto>>('/questions', { query: params }),
    placeholderData: keepPreviousData, // keep the old page visible while the next loads
  });
  const { data: tags } = useQuery({
    queryKey: qk.tags(),
    queryFn: () => api<TagDto[]>('/tags'),
    staleTime: 300_000,
  });

  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_16rem]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">
              {url.tag ? (
                <>
                  Questions tagged <span className="font-mono text-accent">{url.tag}</span>
                </>
              ) : (
                'All questions'
              )}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {data ? `${compact(data.meta.total)} questions` : 'Get help from the community'}
            </p>
          </div>
          <ButtonLink to="/questions/ask" icon={<MessageSquarePlus className="h-4 w-4" />}>
            Ask question
          </ButtonLink>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder='Search… try "react hooks" or -redux'
              aria-label="Search questions"
              className="h-10 w-full rounded-lg border border-line bg-surface pr-9 pl-9 text-sm focus:border-accent focus:ring-2 focus:ring-accent/25 focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute top-1/2 right-3 -translate-y-1/2 text-muted hover:text-fg"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <SegmentedControl<Sort>
            label="Sort questions"
            value={url.sort as Sort}
            onChange={(sort) => setUrl({ sort })}
            options={[
              { value: 'newest', label: 'Newest' },
              { value: 'active', label: 'Active' },
              { value: 'votes', label: 'Top' },
              { value: 'unanswered', label: 'Unanswered' },
            ]}
          />
        </div>
        {url.tag && (
          <button
            type="button"
            onClick={() => setUrl({ tag: '' })}
            className="mt-3 inline-flex items-center gap-1 rounded-md bg-accent-soft px-2 py-1 font-mono text-xs text-accent"
          >
            {url.tag} <X className="h-3 w-3" />
          </button>
        )}

        <Card
          className={cn(
            'mt-5 overflow-hidden transition-opacity',
            isPlaceholderData && 'opacity-60',
          )}
        >
          {isPending ? (
            <ul className="divide-y divide-line">
              {Array.from({ length: 5 }, (_, i) => (
                <li key={i} className="space-y-3 p-5">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-1/3" />
                </li>
              ))}
            </ul>
          ) : isError ? (
            <div className="p-6">
              <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
            </div>
          ) : data.items.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<MessageSquareText />}
                title={url.q ? `No results for “${url.q}”` : 'No questions yet'}
                action={<ButtonLink to="/questions/ask">Ask the first one</ButtonLink>}
              >
                {url.q
                  ? 'Try fewer or different words, or remove the tag filter.'
                  : 'Be the first to start a discussion.'}
              </EmptyState>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {data.items.map((q) => (
                <QuestionRow key={q.id} q={q} />
              ))}
            </ul>
          )}
        </Card>
        {data && (
          <Pagination
            page={data.meta.page}
            totalPages={data.meta.totalPages}
            onChange={(p) => setUrl({ page: String(p) })}
          />
        )}
      </div>

      <aside className="space-y-4" aria-label="Popular tags">
        <Card className="p-5">
          <h2 className="text-sm font-semibold">Popular tags</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {tags
              ?.filter((t) => t.questionCount > 0)
              .slice(0, 20)
              .map((t) => (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => setUrl({ tag: t.name })}
                  className={cn(
                    'rounded-md px-2 py-1 font-mono text-xs transition-colors',
                    url.tag === t.name
                      ? 'bg-accent text-accent-fg'
                      : 'bg-surface-2 text-muted hover:text-fg',
                  )}
                >
                  {t.name} <span>×{t.questionCount}</span>
                </button>
              ))}
          </div>
        </Card>
        <Card className="p-5 text-sm text-muted">
          <h2 className="mb-2 text-sm font-semibold text-fg">Search tips</h2>
          <ul className="list-disc space-y-1 pl-4">
            <li>
              <code className="font-mono">"exact phrase"</code> for phrases
            </li>
            <li>
              <code className="font-mono">-word</code> to exclude
            </li>
            <li>
              <code className="font-mono">react or vue</code> for either
            </li>
          </ul>
        </Card>
      </aside>
    </div>
  );
}

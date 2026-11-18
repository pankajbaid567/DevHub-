import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Code2, GitFork, Plus, Search, Star } from 'lucide-react';
import { LANGUAGES, type Paginated, type SnippetSummaryDto } from '@devhub/shared';
import { api, errorMessage } from '../../lib/api';
import { qk } from '../../lib/queryClient';
import { useDebounced, useDocumentTitle, useUrlState } from '../../lib/hooks';
import { cn, timeAgo } from '../../lib/utils';
import { ButtonLink } from '../../components/ui/Button';
import { Select } from '../../components/ui/Field';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Pagination,
  SegmentedControl,
  Skeleton,
} from '../../components/ui/primitives';
import { Markdown } from '../../components/Markdown';
import { UserChip } from '../../components/UserChip';

export function SnippetCard({ s }: { s: SnippetSummaryDto }) {
  return (
    <Card className="relative flex flex-col overflow-hidden transition-shadow hover:shadow-glow">
      <div className="flex items-start justify-between gap-3 p-4 pb-2">
        <div className="min-w-0">
          {/* Stretched link: the whole card is clickable, with one accessible link. */}
          <Link
            to={`/snippets/${s.id}`}
            className="line-clamp-1 font-semibold after:absolute after:inset-0 hover:text-accent"
          >
            {s.title}
          </Link>
          {s.description && (
            <p className="mt-0.5 line-clamp-2 text-sm text-muted">{s.description}</p>
          )}
        </div>
        <Badge tone="accent" className="shrink-0 font-mono">
          {s.language}
        </Badge>
      </div>
      {/* Decorative preview: inert removes it (and its copy button) from tab order and the a11y tree. */}
      <div
        className="relative mx-4 max-h-44 overflow-hidden rounded-lg [&_.prose-devhub_pre]:my-0"
        inert
      >
        <Markdown>{`\`\`\`${s.language}\n${s.preview}\n\`\`\``}</Markdown>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-surface to-transparent" />
      </div>
      <div className="relative z-10 mt-auto flex items-center justify-between gap-2 p-4 pt-3 text-xs text-muted">
        <UserChip user={s.author} size={20} meta={timeAgo(s.createdAt)} />
        <span className="flex items-center gap-3">
          <span className={cn('inline-flex items-center gap-1', s.starredByMe && 'text-warning')}>
            <Star className={cn('h-3.5 w-3.5', s.starredByMe && 'fill-current')} /> {s.starCount}
          </span>
          <span className="inline-flex items-center gap-1">
            <GitFork className="h-3.5 w-3.5" /> {s.forkCount}
          </span>
        </span>
      </div>
    </Card>
  );
}

export default function SnippetList() {
  const [url, setUrl] = useUrlState({ q: '', language: '', sort: 'newest', page: '1', tag: '' });
  const [search, setSearch] = useState(url.q);
  const debounced = useDebounced(search, 350);
  useDocumentTitle('Snippets');
  useEffect(() => {
    if (debounced !== url.q) setUrl({ q: debounced });
  }, [debounced, url.q, setUrl]);

  const params = { ...url, page: Number(url.page) || 1, limit: 12 };
  const { data, isPending, isError, error, refetch, isPlaceholderData } = useQuery({
    queryKey: qk.snippets.list(params),
    queryFn: () => api<Paginated<SnippetSummaryDto>>('/snippets', { query: params }),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Snippet library</h1>
          <p className="mt-1 text-sm text-muted">
            Reusable code from the community. Star what you like, fork to adapt.
          </p>
        </div>
        <ButtonLink to="/snippets/new" icon={<Plus className="h-4 w-4" />}>
          Share a snippet
        </ButtonLink>
      </div>

      <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search titles, descriptions and code…"
            aria-label="Search snippets"
            className="h-10 w-full rounded-lg border border-line bg-surface pl-9 text-sm focus:border-accent focus:ring-2 focus:ring-accent/25 focus:outline-none"
          />
        </div>
        <Select
          value={url.language}
          onChange={(e) => setUrl({ language: e.target.value })}
          aria-label="Filter by language"
          className="md:w-48"
        >
          <option value="">All languages</option>
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </Select>
        <SegmentedControl
          label="Sort snippets"
          value={url.sort as 'newest' | 'stars'}
          onChange={(sort) => setUrl({ sort })}
          options={[
            { value: 'newest', label: 'Newest' },
            { value: 'stars', label: 'Most starred' },
          ]}
        />
      </div>

      <div className={cn('mt-6 transition-opacity', isPlaceholderData && 'opacity-60')}>
        {isPending ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-64" />
            ))}
          </div>
        ) : isError ? (
          <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
        ) : data.items.length === 0 ? (
          <EmptyState
            icon={<Code2 />}
            title="No snippets found"
            action={<ButtonLink to="/snippets/new">Share the first one</ButtonLink>}
          >
            Try another search or language.
          </EmptyState>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((s) => (
              <SnippetCard key={s.id} s={s} />
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

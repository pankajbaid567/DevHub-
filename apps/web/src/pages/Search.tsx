import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Brain, Code2, MessageSquareText, Search as SearchIcon, Type } from 'lucide-react';
import type { SearchResultDto } from '@devhub/shared';
import { api, errorMessage } from '../lib/api';
import { useDebounced, useDocumentTitle, useUrlState } from '../lib/hooks';
import { Badge, Card, EmptyState, ErrorState, Skeleton } from '../components/ui/primitives';

/**
 * Hybrid search page. Results come from two retrievers (Postgres full-text and pgvector
 * embeddings) fused with reciprocal rank fusion; badges show which one found each hit.
 */
export default function Search() {
  const [{ q }, setUrl] = useUrlState({ q: '' });
  const [draft, setDraft] = useState(q);
  const debounced = useDebounced(draft.trim(), 350);
  useDocumentTitle(q ? `Search: ${q}` : 'Search');

  const term = debounced.length >= 2 ? debounced : '';
  const { data, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['search', term],
    queryFn: ({ signal }) => api<SearchResultDto>('/search', { query: { q: term }, signal }),
    enabled: term.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold">Search</h1>
      <p className="mt-1 text-sm text-muted">
        Finds matching words <em>and</em> matching meaning: “stop re-renders” also finds “memoize
        components”.
      </p>
      <form
        role="search"
        className="relative mt-6"
        onSubmit={(e) => {
          e.preventDefault();
          setUrl({ q: draft.trim() });
        }}
      >
        <SearchIcon
          className="pointer-events-none absolute top-1/2 left-3.5 h-5 w-5 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <input
          autoFocus
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setUrl({ q: e.target.value.trim() });
          }}
          placeholder="Describe your problem in your own words…"
          aria-label="Search"
          className="h-12 w-full rounded-xl border border-line bg-surface pr-4 pl-11 text-base shadow-card placeholder:text-muted focus:border-accent focus:outline-none"
        />
      </form>

      <div className="mt-6" aria-live="polite" aria-busy={isFetching}>
        {!term ? (
          <EmptyState icon={<SearchIcon />} title="Search questions and snippets">
            Type at least two characters.
          </EmptyState>
        ) : isError ? (
          <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
        ) : !data ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : data.items.length === 0 ? (
          <EmptyState icon={<SearchIcon />} title="No results">
            Try different words, or{' '}
            <Link to="/questions/ask" className="text-accent hover:underline">
              ask the community
            </Link>
            .
          </EmptyState>
        ) : (
          <>
            <p className="mb-3 text-xs text-muted">
              {data.items.length} {data.items.length === 1 ? 'result' : 'results'} · keyword +
              semantic ({data.model}) fused with RRF
            </p>
            <Card>
              <ul className="divide-y divide-line">
                {data.items.map((hit) => (
                  <li key={`${hit.kind}:${hit.id}`} className="p-4 hover:bg-surface-2/50">
                    <div className="flex items-center gap-2 text-xs text-muted">
                      {hit.kind === 'question' ? (
                        <MessageSquareText className="h-3.5 w-3.5" aria-hidden />
                      ) : (
                        <Code2 className="h-3.5 w-3.5" aria-hidden />
                      )}
                      <span className="capitalize">{hit.kind}</span>
                      <span aria-hidden>·</span>
                      <span>
                        {hit.score} {hit.kind === 'question' ? 'votes' : 'stars'}
                      </span>
                      <span className="ml-auto flex gap-1">
                        {hit.matchedBy.includes('keyword') && (
                          <Badge title="Matched your words (full-text search)">
                            <Type className="h-3 w-3" aria-hidden /> words
                          </Badge>
                        )}
                        {hit.matchedBy.includes('semantic') && (
                          <Badge tone="accent" title="Matched the meaning (vector search)">
                            <Brain className="h-3 w-3" aria-hidden /> meaning
                          </Badge>
                        )}
                      </span>
                    </div>
                    <Link
                      to={`/${hit.kind === 'question' ? 'questions' : 'snippets'}/${hit.id}`}
                      className="mt-1 block font-semibold hover:text-accent"
                    >
                      {hit.title}
                    </Link>
                    {hit.excerpt && (
                      <p className="mt-1 line-clamp-2 text-sm text-muted">{hit.excerpt}</p>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

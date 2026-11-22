import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, errorMessage } from './api';

/**
 * Server state lives in TanStack Query: caching, de-duplication, background refetch and
 * optimistic updates. Client errors (4xx) are not retried; network/5xx errors are, with backoff.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
  queryCache: new QueryCache({
    onError: (err, query) => {
      // Surface background refetch failures only; first-load errors render inline.
      if (query.state.data !== undefined) toast.error(errorMessage(err));
    },
  }),
  mutationCache: new MutationCache({
    onError: (err, _vars, _ctx, mutation) => {
      // Mutations with their own onError (forms with field errors) handle themselves.
      if (!mutation.options.onError) toast.error(errorMessage(err));
    },
  }),
});

/** Query-key factory: one place defines cache keys, so invalidation can't drift. */
export const qk = {
  me: ['me'] as const,
  dashboard: ['dashboard'] as const,
  questions: {
    all: ['questions'] as const,
    list: (params: object) => ['questions', 'list', params] as const,
    detail: (id: string) => ['questions', 'detail', id] as const,
  },
  tags: (q?: string) => ['tags', q ?? ''] as const,
  snippets: {
    all: ['snippets'] as const,
    list: (params: object) => ['snippets', 'list', params] as const,
    detail: (id: string) => ['snippets', 'detail', id] as const,
  },
  sessions: {
    all: ['sessions'] as const,
    list: (params: object) => ['sessions', 'list', params] as const,
    detail: (id: string) => ['sessions', 'detail', id] as const,
    messages: (id: string) => ['sessions', 'messages', id] as const,
  },
  notifications: ['notifications'] as const,
  profile: (username: string) => ['profile', username] as const,
  leaderboard: ['leaderboard'] as const,
  skills: ['skills'] as const,
  conversations: ['conversations'] as const,
  conversation: (id: string) => ['conversations', id] as const,
  resumeReviews: ['resume-reviews'] as const,
  aiStatus: ['ai-status'] as const,
  practice: {
    problems: ['practice', 'problems'] as const,
    progress: ['practice', 'progress'] as const,
    streak: ['practice', 'streak'] as const,
    bookmarks: ['practice', 'bookmarks'] as const,
    badges: ['practice', 'badges'] as const,
    cpProfiles: ['practice', 'cp-profiles'] as const,
    whiteboards: ['practice', 'whiteboards'] as const,
    whiteboard: (id: string) => ['practice', 'whiteboards', id] as const,
    note: (slug: string) => ['practice', 'notes', slug] as const,
  },
};

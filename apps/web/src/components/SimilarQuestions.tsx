import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Copy, Sparkles } from 'lucide-react';
import type { SimilarQuestionDto } from '@devhub/shared';
import { api } from '../lib/api';
import { useDebounced } from '../lib/hooks';
import { Card } from './ui/primitives';

function List({ items }: { items: SimilarQuestionDto[] }) {
  return (
    <ul className="space-y-2">
      {items.map((q) => (
        <li key={q.id} className="flex items-start gap-2 text-sm">
          {q.hasAcceptedAnswer ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-label="Answered" />
          ) : (
            <span className="mt-0.5 w-4 shrink-0 text-center text-xs text-muted tabular-nums">
              {q.answerCount}
            </span>
          )}
          <Link
            to={`/questions/${q.id}`}
            target="_blank"
            rel="noreferrer"
            className="hover:text-accent hover:underline"
          >
            {q.title}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Shown under the title while asking: catches duplicates before they are posted. */
export function DuplicateHint({ title, excludeId }: { title: string; excludeId?: string }) {
  const text = useDebounced(title.trim(), 450);
  const { data } = useQuery({
    queryKey: ['similar', text, excludeId],
    queryFn: ({ signal }) =>
      api<SimilarQuestionDto[]>('/search/similar-questions', {
        query: { text, excludeId },
        signal,
      }),
    enabled: text.length >= 15,
    staleTime: 60_000,
  });
  if (!data?.length || text.length < 15) return null;
  return (
    <Card role="status" className="border-accent/30 bg-accent-soft/40 p-4">
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Copy className="h-4 w-4 text-accent" aria-hidden /> These look similar. Is yours already
        answered?
      </p>
      <List items={data} />
    </Card>
  );
}

/** Sidebar on a question page: nearest neighbours of its stored embedding. */
export function RelatedQuestions({ questionId }: { questionId: string }) {
  const { data } = useQuery({
    queryKey: ['related', questionId],
    queryFn: () => api<SimilarQuestionDto[]>(`/search/related/${questionId}`),
    staleTime: 5 * 60_000,
  });
  if (!data?.length) return null;
  return (
    <Card className="p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="h-4 w-4 text-accent" aria-hidden /> Related questions
      </h2>
      <List items={data} />
    </Card>
  );
}

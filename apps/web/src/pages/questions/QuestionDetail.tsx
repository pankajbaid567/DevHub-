import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CheckCircle2, Eye, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { answerBodySchema, type AnswerDto, type QuestionDetailDto } from '@devhub/shared';
import { api, errorMessage } from '../../lib/api';
import { qk } from '../../lib/queryClient';
import { useAuth } from '../../auth/context';
import { useDocumentTitle } from '../../lib/hooks';
import { cn, plural, timeAgo } from '../../lib/utils';
import { Markdown, MarkdownEditor } from '../../components/Markdown';
import { VoteControl } from '../../components/VoteControl';
import { UserChip } from '../../components/UserChip';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Card, Dialog, ErrorState, Skeleton, TagLink } from '../../components/ui/primitives';

function ConfirmDelete({
  what,
  onConfirm,
  pending,
}: {
  what: string;
  onConfirm: () => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        icon={<Trash2 className="h-3.5 w-3.5" />}
      >
        Delete
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Delete this ${what}?`}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={pending} onClick={onConfirm}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          This cannot be undone. Votes and reputation earned from it are reversed.
        </p>
      </Dialog>
    </>
  );
}

function AnswerItem({
  a,
  question,
  canAccept,
}: {
  a: AnswerDto;
  question: QuestionDetailDto;
  canAccept: boolean;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(a.body);
  const isMine = user?.id === a.author.id;

  const invalidate = () => qc.invalidateQueries({ queryKey: qk.questions.detail(question.id) });
  const accept = useMutation({
    mutationFn: () =>
      api(`/questions/${question.id}/accepted-answer`, {
        method: 'PUT',
        body: { answerId: a.isAccepted ? null : a.id },
      }),
    onSuccess: () => {
      toast.success(a.isAccepted ? 'Answer un-accepted' : 'Answer accepted');
      void invalidate();
    },
  });
  const save = useMutation({
    mutationFn: () => api(`/answers/${a.id}`, { method: 'PATCH', body: { body } }),
    onSuccess: () => {
      setEditing(false);
      void invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: () => api(`/answers/${a.id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  return (
    <li
      id={`answer-${a.id}`}
      className={cn('flex scroll-mt-24 gap-4 p-5', a.isAccepted && 'bg-success/5')}
    >
      <div className="flex flex-col items-center gap-2">
        <VoteControl
          target="answers"
          id={a.id}
          score={a.score}
          myVote={a.myVote}
          disabled={isMine}
        />
        {canAccept ? (
          <button
            type="button"
            onClick={() => accept.mutate()}
            disabled={accept.isPending}
            aria-pressed={a.isAccepted}
            aria-label={a.isAccepted ? 'Un-accept answer' : 'Accept this answer'}
            title={a.isAccepted ? 'Un-accept' : 'Accept this answer'}
            className={cn(
              'rounded-full p-1.5 transition-colors',
              a.isAccepted ? 'text-success' : 'text-muted hover:text-success',
            )}
          >
            <CheckCircle2 className="h-7 w-7" />
          </button>
        ) : (
          a.isAccepted && (
            <CheckCircle2 className="h-7 w-7 text-success" aria-label="Accepted answer" />
          )
        )}
      </div>
      <div className="min-w-0 flex-1">
        {a.isAccepted && (
          <p className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-success">
            <Check className="h-3.5 w-3.5" /> Accepted answer
          </p>
        )}
        {editing ? (
          <div className="space-y-3">
            <MarkdownEditor value={body} onChange={setBody} rows={8} />
            <div className="flex gap-2">
              <Button
                size="sm"
                loading={save.isPending}
                onClick={() => save.mutate()}
                disabled={!answerBodySchema.safeParse({ body }).success}
              >
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Markdown>{a.body}</Markdown>
        )}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1">
            {isMine && !editing && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(true)}
                  icon={<Pencil className="h-3.5 w-3.5" />}
                >
                  Edit
                </Button>
                <ConfirmDelete
                  what="answer"
                  onConfirm={() => remove.mutate()}
                  pending={remove.isPending}
                />
              </>
            )}
          </div>
          <UserChip user={a.author} size={22} meta={`answered ${timeAgo(a.createdAt)}`} />
        </div>
      </div>
    </li>
  );
}

function AnswerComposer({ questionId }: { questionId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const [error, setError] = useState<string>();
  const post = useMutation({
    mutationFn: () =>
      api<AnswerDto>(`/questions/${questionId}/answers`, { method: 'POST', body: { body } }),
    onSuccess: (a) => {
      setBody('');
      toast.success('Answer posted');
      void qc
        .invalidateQueries({ queryKey: qk.questions.detail(questionId) })
        .then(() =>
          document.getElementById(`answer-${a.id}`)?.scrollIntoView({ behavior: 'smooth' }),
        );
    },
    onError: (err) => setError(errorMessage(err)),
  });

  if (!user)
    return (
      <Card className="p-6 text-center">
        <p className="text-sm text-muted">Know the answer?</p>
        <ButtonLink to={`/login?next=/questions/${questionId}`} className="mt-3">
          Sign in to answer
        </ButtonLink>
      </Card>
    );

  return (
    <Card className="p-5">
      <h2 className="mb-3 font-semibold">Your answer</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const r = answerBodySchema.safeParse({ body });
          if (!r.success) return setError(r.error.issues[0]?.message);
          setError(undefined);
          post.mutate();
        }}
        className="space-y-3"
      >
        <MarkdownEditor
          value={body}
          onChange={setBody}
          rows={8}
          placeholder="Explain the solution. Show code, and why it works."
          invalid={Boolean(error)}
        />
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
        <Button type="submit" loading={post.isPending}>
          Post answer
        </Button>
      </form>
    </Card>
  );
}

export default function QuestionDetail() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const {
    data: q,
    isPending,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: qk.questions.detail(id),
    queryFn: () => api<QuestionDetailDto>(`/questions/${id}`),
  });
  useDocumentTitle(q?.title);

  // Deep links like /questions/x#answer-y scroll once the answers have rendered.
  useEffect(() => {
    if (q && window.location.hash) document.querySelector(window.location.hash)?.scrollIntoView();
  }, [q]);

  const remove = useMutation({
    mutationFn: () => api(`/questions/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Question deleted');
      void qc.invalidateQueries({ queryKey: qk.questions.all });
      navigate('/questions');
    },
  });

  if (isPending)
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-10">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  if (isError)
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
      </div>
    );

  const isAuthor = user?.id === q.author.id;
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted">
        <Link to="/questions" className="hover:text-fg">
          Questions
        </Link>{' '}
        / <span className="text-fg">#{q.id.slice(-6)}</span>
      </nav>
      <h1 className="text-2xl font-bold sm:text-3xl">{q.title}</h1>
      <p className="mt-2 flex flex-wrap items-center gap-4 border-b border-line pb-4 text-sm text-muted">
        <span>Asked {timeAgo(q.createdAt)}</span>
        <span>Active {timeAgo(q.lastActivityAt)}</span>
        <span className="inline-flex items-center gap-1">
          <Eye className="h-3.5 w-3.5" /> {plural(q.viewCount, 'view')}
        </span>
      </p>

      <article className="flex gap-4 py-6">
        <VoteControl
          target="questions"
          id={q.id}
          score={q.score}
          myVote={q.myVote}
          disabled={isAuthor}
        />
        <div className="min-w-0 flex-1">
          <Markdown>{q.body}</Markdown>
          <div className="mt-5 flex flex-wrap gap-1.5">
            {q.tags.map((t) => (
              <TagLink key={t} name={t} />
            ))}
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1">
              {isAuthor && (
                <>
                  <ButtonLink
                    to={`/questions/${q.id}/edit`}
                    variant="ghost"
                    size="sm"
                    icon={<Pencil className="h-3.5 w-3.5" />}
                  >
                    Edit
                  </ButtonLink>
                  <ConfirmDelete
                    what="question"
                    onConfirm={() => remove.mutate()}
                    pending={remove.isPending}
                  />
                </>
              )}
            </div>
            <Card className="px-3 py-2">
              <UserChip user={q.author} size={28} meta="asked" />
            </Card>
          </div>
        </div>
      </article>

      <section aria-labelledby="answers-heading" className="mt-4">
        <h2 id="answers-heading" className="mb-3 text-lg font-semibold">
          {plural(q.answers.length, 'answer')}
        </h2>
        {q.answers.length > 0 && (
          <Card className="mb-6 overflow-hidden">
            <ul className="divide-y divide-line">
              {q.answers.map((a) => (
                <AnswerItem key={a.id} a={a} question={q} canAccept={isAuthor} />
              ))}
            </ul>
          </Card>
        )}
        <AnswerComposer questionId={q.id} />
      </section>
    </div>
  );
}

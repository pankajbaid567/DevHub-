import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Check, Copy, EyeOff, GitFork, Link2, Lock, Pencil, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { AiResultEnvelope, SnippetDto } from '@devhub/shared';
import { api, errorMessage } from '../../lib/api';
import { qk } from '../../lib/queryClient';
import { useAuth } from '../../auth/context';
import { useDocumentTitle } from '../../lib/hooks';
import { cn, timeAgo } from '../../lib/utils';
import { Markdown } from '../../components/Markdown';
import { UserChip } from '../../components/UserChip';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Badge, Card, Dialog, ErrorState, Skeleton, TagLink } from '../../components/ui/primitives';

export default function SnippetDetail() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [aiMode, setAiMode] = useState<'review' | 'explain' | null>(null);

  const {
    data: s,
    isPending,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: qk.snippets.detail(id),
    queryFn: () => api<SnippetDto>(`/snippets/${id}`),
  });
  useDocumentTitle(s?.title);

  const star = useMutation({
    mutationFn: (on: boolean) =>
      api<{ starCount: number; starredByMe: boolean }>(`/snippets/${id}/star`, {
        method: on ? 'PUT' : 'DELETE',
      }),
    onMutate: (on) => {
      const prev = qc.getQueryData<SnippetDto>(qk.snippets.detail(id));
      if (prev)
        qc.setQueryData(qk.snippets.detail(id), {
          ...prev,
          starredByMe: on,
          starCount: prev.starCount + (on ? 1 : -1),
        });
      return prev;
    },
    onError: (err, _on, prev) => {
      if (prev) qc.setQueryData(qk.snippets.detail(id), prev);
      toast.error(errorMessage(err));
    },
    onSuccess: (r) =>
      qc.setQueryData<SnippetDto>(qk.snippets.detail(id), (old) => (old ? { ...old, ...r } : old)),
  });
  const fork = useMutation({
    mutationFn: () => api<SnippetDto>(`/snippets/${id}/fork`, { method: 'POST' }),
    onSuccess: (f) => {
      toast.success('Forked into your library');
      navigate(`/snippets/${f.id}`);
    },
  });
  const remove = useMutation({
    mutationFn: () => api(`/snippets/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.snippets.all });
      navigate('/snippets');
    },
  });
  const assist = useMutation({
    mutationFn: (mode: 'review' | 'explain') =>
      api<AiResultEnvelope<{ markdown: string }>>('/ai/code', {
        method: 'POST',
        body: { code: s!.code, language: s!.language, mode },
      }),
  });

  if (isPending)
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-10">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  if (isError)
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
      </div>
    );

  const mine = user?.id === s.author.id;
  const copy = async () => {
    await navigator.clipboard.writeText(s.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const requireAuth = (fn: () => void) => () =>
    user ? fn() : navigate(`/login?next=/snippets/${id}`);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent" className="font-mono">
              {s.language}
            </Badge>
            {s.visibility === 'PRIVATE' && (
              <Badge>
                <Lock className="h-3 w-3" /> Private
              </Badge>
            )}
            {s.visibility === 'UNLISTED' && (
              <Badge>
                <EyeOff className="h-3 w-3" /> Unlisted
              </Badge>
            )}
          </div>
          <h1 className="mt-2 text-2xl font-bold">{s.title}</h1>
          {s.forkedFrom && (
            <p className="mt-1 text-sm text-muted">
              <GitFork className="mr-1 inline h-3.5 w-3.5" /> forked from{' '}
              <Link to={`/snippets/${s.forkedFrom.id}`} className="text-accent hover:underline">
                {s.forkedFrom.title}
              </Link>
            </p>
          )}
          <div className="mt-3">
            <UserChip user={s.author} meta={`shared ${timeAgo(s.createdAt)}`} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={requireAuth(() => star.mutate(!s.starredByMe))}
            aria-pressed={s.starredByMe}
            icon={<Star className={cn('h-4 w-4', s.starredByMe && 'fill-warning text-warning')} />}
          >
            {s.starredByMe ? 'Starred' : 'Star'} · {s.starCount}
          </Button>
          <Button
            variant="outline"
            onClick={requireAuth(() => fork.mutate())}
            loading={fork.isPending}
            icon={<GitFork className="h-4 w-4" />}
          >
            Fork · {s.forkCount}
          </Button>
          {mine && (
            <>
              <ButtonLink
                to={`/snippets/${id}/edit`}
                variant="ghost"
                icon={<Pencil className="h-4 w-4" />}
              >
                Edit
              </ButtonLink>
              <Button
                variant="ghost"
                onClick={() => setConfirm(true)}
                icon={<Trash2 className="h-4 w-4" />}
              >
                Delete
              </Button>
            </>
          )}
        </div>
      </div>

      {s.description && <p className="mt-6 text-muted">{s.description}</p>}

      <Card className="mt-6 overflow-hidden">
        <div className="flex items-center justify-between border-b border-line bg-surface-2 px-4 py-2 text-xs text-muted">
          <span className="font-mono">{s.code.split('\n').length} lines</span>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(window.location.href);
                toast.success('Link copied');
              }}
              icon={<Link2 className="h-3.5 w-3.5" />}
            >
              Share
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={copy}
              icon={
                copied ? (
                  <Check className="h-3.5 w-3.5 text-success" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )
              }
            >
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>
        <div className="[&_.prose-devhub_pre]:m-0 [&_.prose-devhub_pre]:rounded-none [&_.prose-devhub_pre]:border-0">
          <Markdown>{`\`\`\`${s.language}\n${s.code}\n\`\`\``}</Markdown>
        </div>
      </Card>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {s.tags.map((t) => (
            <TagLink key={t} name={t} to={`/snippets?tag=${t}`} />
          ))}
        </div>
        {user && (
          <div className="flex gap-2">
            {(['explain', 'review'] as const).map((m) => (
              <Button
                key={m}
                variant="secondary"
                size="sm"
                icon={<Bot className="h-4 w-4" />}
                onClick={() => {
                  setAiMode(m);
                  assist.mutate(m);
                }}
              >
                AI {m}
              </Button>
            ))}
          </div>
        )}
      </div>

      {aiMode && (
        <Card className="mt-6 p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold">
            <Bot className="h-4 w-4 text-accent" /> AI {aiMode}
          </h2>
          {assist.isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : assist.isError ? (
            <ErrorState
              message={errorMessage(assist.error)}
              onRetry={() => assist.mutate(aiMode)}
            />
          ) : (
            assist.data && (
              <>
                {assist.data.isDemo && (
                  <p className="mb-3 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
                    Demo mode: no Gemini key configured on the server.
                  </p>
                )}
                <Markdown>{assist.data.result.markdown}</Markdown>
              </>
            )
          )}
        </Card>
      )}

      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Delete this snippet?"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          Forks made by others are kept but lose the link to this original.
        </p>
      </Dialog>
    </div>
  );
}

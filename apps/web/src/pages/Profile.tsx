import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Award,
  CalendarDays,
  CheckCircle2,
  Code2,
  MessageSquareText,
  Pencil,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  CurrentUser,
  Paginated,
  ProfileDto,
  QuestionSummaryDto,
  SnippetSummaryDto,
} from '@devhub/shared';
import { api, errorMessage } from '../lib/api';
import { qk, queryClient } from '../lib/queryClient';
import { useAuth } from '../auth/context';
import { useDocumentTitle, useUrlState } from '../lib/hooks';
import { ResumeReviewer, Skills } from './Career';
import { displayName } from '../lib/utils';
import {
  Avatar,
  Card,
  Dialog,
  ErrorState,
  SegmentedControl,
  Skeleton,
} from '../components/ui/primitives';
import { Button } from '../components/ui/Button';
import { Field, Input, Textarea } from '../components/ui/Field';
import { QuestionRow } from './questions/QuestionList';
import { SnippetCard } from './snippets/SnippetList';

function EditProfile({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState({
    displayName: user?.displayName ?? '',
    bio: user?.bio ?? '',
    avatarUrl: user?.avatarUrl ?? '',
  });
  const save = useMutation({
    mutationFn: () =>
      api<CurrentUser>('/users/me', {
        method: 'PATCH',
        body: {
          displayName: form.displayName || null,
          bio: form.bio || null,
          avatarUrl: form.avatarUrl || null,
        },
      }),
    onSuccess: (u) => {
      setUser(u);
      void queryClient.invalidateQueries({ queryKey: qk.profile(u.username) });
      toast.success('Profile updated');
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Edit profile"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Display name">
          {(p) => (
            <Input
              {...p}
              value={form.displayName}
              maxLength={50}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            />
          )}
        </Field>
        <Field label="Bio" hint={`${form.bio.length}/500`}>
          {(p) => (
            <Textarea
              {...p}
              rows={3}
              maxLength={500}
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
            />
          )}
        </Field>
        <Field label="Avatar URL" hint="HTTPS image URL">
          {(p) => (
            <Input
              {...p}
              type="url"
              value={form.avatarUrl}
              onChange={(e) => setForm({ ...form, avatarUrl: e.target.value })}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}

export default function Profile() {
  const { username = '' } = useParams();
  const { user } = useAuth();
  const isMe = user?.username === username.toLowerCase();
  const [url, setUrl] = useUrlState({ tab: 'questions' });
  type Tab = 'questions' | 'snippets' | 'resume' | 'skills';
  const allowed: Tab[] = isMe
    ? ['questions', 'snippets', 'resume', 'skills']
    : ['questions', 'snippets'];
  const tab: Tab = allowed.includes(url.tab as Tab) ? (url.tab as Tab) : 'questions';
  const setTab = (t: Tab) => setUrl({ tab: t });
  const [editing, setEditing] = useState(false);
  const {
    data: p,
    isPending,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: qk.profile(username),
    queryFn: () => api<ProfileDto>(`/users/${username}`),
  });
  const questions = useQuery({
    queryKey: qk.questions.list({ author: username, limit: 10 }),
    queryFn: () =>
      api<Paginated<QuestionSummaryDto>>('/questions', { query: { author: username, limit: 10 } }),
    enabled: tab === 'questions',
  });
  const snippets = useQuery({
    queryKey: qk.snippets.list({ author: username, limit: 9 }),
    queryFn: () =>
      api<Paginated<SnippetSummaryDto>>('/snippets', { query: { author: username, limit: 9 } }),
    enabled: tab === 'snippets',
  });
  useDocumentTitle(p ? displayName(p) : undefined);

  if (isPending)
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-10">
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    );
  if (isError)
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
      </div>
    );

  const stats = [
    { icon: Award, label: 'Reputation', value: p.reputation },
    {
      icon: CheckCircle2,
      label: 'Answers',
      value: `${p.stats.answers} (${p.stats.acceptedAnswers} accepted)`,
    },
    { icon: MessageSquareText, label: 'Questions', value: p.stats.questions },
    { icon: Code2, label: 'Snippets', value: p.stats.snippets },
    { icon: Users, label: 'Sessions hosted', value: p.stats.sessionsHosted },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Card className="p-6">
        <div className="flex flex-wrap items-start gap-5">
          <Avatar name={p.displayName ?? p.username} src={p.avatarUrl} size={88} />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold">{displayName(p)}</h1>
            <p className="text-muted">@{p.username}</p>
            {p.bio && <p className="mt-3 max-w-2xl">{p.bio}</p>}
            <p className="mt-3 inline-flex items-center gap-1 text-sm text-muted">
              <CalendarDays className="h-4 w-4" /> Member since{' '}
              {new Date(p.createdAt).toLocaleDateString(undefined, {
                month: 'long',
                year: 'numeric',
              })}
            </p>
          </div>
          {isMe && (
            <Button
              variant="outline"
              icon={<Pencil className="h-4 w-4" />}
              onClick={() => setEditing(true)}
            >
              Edit profile
            </Button>
          )}
        </div>
        <dl className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg bg-surface-2 p-3">
              <dt className="flex items-center gap-1.5 text-xs text-muted">
                <s.icon className="h-3.5 w-3.5" /> {s.label}
              </dt>
              <dd className="mt-1 font-semibold">{s.value}</dd>
            </div>
          ))}
        </dl>
        {(p.topTags.length > 0 || p.skills.length > 0) && (
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            {p.topTags.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold">Top tags (by answers)</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  {p.topTags.map((t) => (
                    <span
                      key={t.name}
                      className="rounded-md bg-accent-soft px-2 py-1 font-mono text-xs text-accent"
                    >
                      {t.name} ×{t.count}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {p.skills.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold">Self-rated skills</h2>
                <ul className="mt-2 space-y-1.5">
                  {p.skills.slice(0, 6).map((s) => (
                    <li key={s.name} className="flex items-center gap-2 text-sm">
                      <span className="w-28 truncate">{s.name}</span>
                      <span className="h-1.5 flex-1 rounded-full bg-surface-2">
                        <span
                          className="block h-full rounded-full bg-accent"
                          style={{ width: `${s.rating * 10}%` }}
                        />
                      </span>
                      <span className="w-6 text-right text-xs text-muted">{s.rating}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Card>

      <div className="mt-8">
        <SegmentedControl
          label="Profile content"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'questions', label: 'Questions' },
            { value: 'snippets', label: 'Snippets' },
            ...(isMe
              ? [
                  { value: 'resume' as const, label: 'AI resume review' },
                  { value: 'skills' as const, label: 'Skills & roadmap' },
                ]
              : []),
          ]}
        />
        {(tab === 'resume' || tab === 'skills') && (
          <p className="mt-3 text-xs text-muted">
            Only you can see this tab. Uploaded resumes are never shown on your public profile.
          </p>
        )}
        <div className="mt-4">
          {tab === 'resume' ? (
            <ResumeReviewer />
          ) : tab === 'skills' ? (
            <Skills />
          ) : tab === 'questions' ? (
            questions.isPending ? (
              <Skeleton className="h-40" />
            ) : questions.data?.items.length ? (
              <Card className="overflow-hidden">
                <ul className="divide-y divide-line">
                  {questions.data.items.map((q) => (
                    <QuestionRow key={q.id} q={q} />
                  ))}
                </ul>
              </Card>
            ) : (
              <p className="text-sm text-muted">No questions yet.</p>
            )
          ) : snippets.isPending ? (
            <Skeleton className="h-40" />
          ) : snippets.data?.items.length ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {snippets.data.items.map((s) => (
                <SnippetCard key={s.id} s={s} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">No public snippets yet.</p>
          )}
        </div>
      </div>
      {editing && <EditProfile open={editing} onClose={() => setEditing(false)} />}
    </div>
  );
}

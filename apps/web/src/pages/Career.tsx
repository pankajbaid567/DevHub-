import { useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Map, Plus, Sparkles, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import type {
  AiResultEnvelope,
  ResumeReviewDto,
  SkillAssessmentResult,
  SkillDto,
} from '@devhub/shared';
import { api, errorMessage } from '../lib/api';
import { qk } from '../lib/queryClient';
import { cn, timeAgo } from '../lib/utils';
import { Badge, Card, ErrorState, SegmentedControl, Skeleton } from '../components/ui/primitives';
import { Button } from '../components/ui/Button';
import { Field, Input, Textarea } from '../components/ui/Field';

function ScoreRing({ score }: { score: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const color = score >= 75 ? 'var(--success)' : score >= 55 ? 'var(--warning)' : 'var(--danger)';
  return (
    <svg
      viewBox="0 0 80 80"
      className="h-24 w-24"
      role="img"
      aria-label={`Score ${score} out of 100`}
    >
      <circle cx="40" cy="40" r={r} fill="none" stroke="var(--line)" strokeWidth="7" />
      <circle
        cx="40"
        cy="40"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - score / 100)}
        transform="rotate(-90 40 40)"
      />
      <text x="40" y="46" textAnchor="middle" className="fill-fg text-lg font-bold">
        {Math.round(score)}
      </text>
    </svg>
  );
}

function ReviewView({ review }: { review: ResumeReviewDto }) {
  const r = review.result;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-5">
        <ScoreRing score={r.overallScore} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted">
            {review.fileName ?? 'Pasted text'}
            {review.targetRole && ` · for ${review.targetRole}`} · {timeAgo(review.createdAt)}
          </p>
          <p className="mt-1">{r.summary}</p>
          {review.model === 'demo' && (
            <Badge tone="warning" className="mt-2">
              Demo analysis (no AI key)
            </Badge>
          )}
        </div>
      </div>
      <div>
        <h3 className="font-semibold">Top actions</h3>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
          {r.topActions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ol>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {r.sections.map((s) => (
          <Card key={s.name} className="p-4">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold">{s.name}</h4>
              <Badge tone={s.score >= 75 ? 'success' : s.score >= 55 ? 'warning' : 'danger'}>
                {s.score}
              </Badge>
            </div>
            {s.strengths.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm text-success">
                {s.strengths.map((x) => (
                  <li key={x}>✓ {x}</li>
                ))}
              </ul>
            )}
            {s.improvements.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm text-muted">
                {s.improvements.map((x) => (
                  <li key={x}>→ {x}</li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>
      <div>
        <h3 className="font-semibold">ATS keywords</h3>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {r.atsKeywords.present.map((k) => (
            <Badge key={k} tone="success">
              {k}
            </Badge>
          ))}
          {r.atsKeywords.missing.map((k) => (
            <Badge key={k} tone="danger">
              missing: {k}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ResumeReviewer() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<'upload' | 'paste'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [role, setRole] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const history = useQuery({
    queryKey: qk.resumeReviews,
    queryFn: () => api<ResumeReviewDto[]>('/ai/resume-reviews'),
  });

  const review = useMutation({
    mutationFn: () => {
      if (mode === 'upload') {
        const form = new FormData();
        form.append('file', file!);
        if (role) form.append('targetRole', role);
        return api<ResumeReviewDto>('/ai/resume-reviews', { method: 'POST', form });
      }
      return api<ResumeReviewDto>('/ai/resume-reviews', {
        method: 'POST',
        body: { text, targetRole: role || undefined },
      });
    },
    onSuccess: (r) => {
      setSelected(r.id);
      void qc.invalidateQueries({ queryKey: qk.resumeReviews });
      toast.success('Review ready');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const current = history.data?.find((r) => r.id === selected) ?? history.data?.[0];
  const canSubmit = mode === 'upload' ? Boolean(file) : text.trim().length >= 200;

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <Card className="h-fit space-y-4 p-5">
        <SegmentedControl
          label="Resume input"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'upload', label: 'Upload PDF' },
            { value: 'paste', label: 'Paste text' },
          ]}
        />
        {mode === 'upload' ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) setFile(f);
            }}
            className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line px-4 py-8 text-sm text-muted hover:border-accent"
          >
            <Upload className="h-6 w-6" />
            {file ? (
              <span className="font-medium text-fg">{file.name}</span>
            ) : (
              'Drop a PDF here or click to choose (max 2 MB)'
            )}
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f && f.size > 2 * 1024 * 1024) toast.error('That file is larger than 2 MB');
                else setFile(f ?? null);
              }}
            />
          </button>
        ) : (
          <Field label="Resume text" hint={`${text.trim().length}/200 characters minimum`}>
            {(p) => (
              <Textarea {...p} rows={10} value={text} onChange={(e) => setText(e.target.value)} />
            )}
          </Field>
        )}
        <Field label="Target role" hint="Optional, sharpens the feedback">
          {(p) => (
            <Input
              {...p}
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Backend Engineer (SDE-2)"
            />
          )}
        </Field>
        <Button
          className="w-full"
          onClick={() => review.mutate()}
          loading={review.isPending}
          disabled={!canSubmit}
          icon={<Sparkles className="h-4 w-4" />}
        >
          Review my resume
        </Button>
        {history.data && history.data.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold text-muted uppercase">Past reviews</p>
            <ul className="space-y-1">
              {history.data.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(r.id)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm',
                      current?.id === r.id ? 'bg-accent-soft text-accent' : 'hover:bg-surface-2',
                    )}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <FileText className="h-3.5 w-3.5" /> {r.fileName ?? 'Pasted text'}
                    </span>
                    <span className="text-xs">{Math.round(r.result.overallScore)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
      <Card className="p-6">
        {review.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-24 rounded-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <p className="text-sm text-muted">Reading your resume… this takes a few seconds.</p>
          </div>
        ) : history.isError ? (
          <ErrorState message={errorMessage(history.error)} onRetry={() => history.refetch()} />
        ) : current ? (
          <ReviewView review={current} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center py-16 text-center text-muted">
            <FileText className="h-10 w-10" />
            <p className="mt-3">
              Upload your resume to get a scored, section-by-section review with ATS keyword gaps.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}

export function Skills() {
  const {
    data: saved,
    isPending,
    isError,
    error,
    refetch,
  } = useQuery({ queryKey: qk.skills, queryFn: () => api<SkillDto[]>('/users/me/skills') });
  if (isPending) return <Skeleton className="h-72" />;
  if (isError) return <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />;
  return <SkillsEditor initial={saved} />;
}

/** Local editable copy initialised once from the saved list (no effect-based syncing). */
function SkillsEditor({ initial }: { initial: SkillDto[] }) {
  const qc = useQueryClient();
  const [skills, setSkills] = useState(() =>
    initial.map((s) => ({ name: s.name, rating: s.rating })),
  );
  const [goal, setGoal] = useState('');
  const [draft, setDraft] = useState('');

  const save = useMutation({
    mutationFn: () => api<SkillDto[]>('/users/me/skills', { method: 'PUT', body: { skills } }),
    onSuccess: (r) => {
      qc.setQueryData(qk.skills, r);
      toast.success('Skills saved to your profile');
    },
  });
  const assess = useMutation({
    mutationFn: () =>
      api<AiResultEnvelope<SkillAssessmentResult>>('/ai/skill-assessment', {
        method: 'POST',
        body: { skills, goal: goal || undefined },
      }),
    onError: (err) => toast.error(errorMessage(err)),
  });

  const add = () => {
    const name = draft.trim();
    if (!name || skills.some((s) => s.name.toLowerCase() === name.toLowerCase())) return;
    setSkills([...skills, { name, rating: 5 }]);
    setDraft('');
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <Card className="space-y-4 p-5">
        <h2 className="font-semibold">Rate your skills</h2>
        <ul className="space-y-3">
          {skills.map((s, i) => (
            <li key={s.name} className="flex items-center gap-3">
              <span className="w-32 truncate text-sm font-medium">{s.name}</span>
              <input
                type="range"
                min={1}
                max={10}
                value={s.rating}
                onChange={(e) =>
                  setSkills(
                    skills.map((x, j) => (j === i ? { ...x, rating: Number(e.target.value) } : x)),
                  )
                }
                aria-label={`${s.name} rating`}
                className="flex-1 accent-[var(--accent)]"
              />
              <span className="w-8 text-right text-sm tabular-nums">{s.rating}</span>
              <button
                type="button"
                onClick={() => setSkills(skills.filter((_, j) => j !== i))}
                aria-label={`Remove ${s.name}`}
                className="text-muted hover:text-danger"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a skill, e.g. Kubernetes"
            aria-label="New skill"
            maxLength={40}
          />
          <Button type="submit" variant="outline" size="icon" aria-label="Add skill">
            <Plus className="h-4 w-4" />
          </Button>
        </form>
        <Field label="Goal" hint="Optional: what are you aiming for?">
          {(p) => (
            <Input
              {...p}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g. Senior backend engineer in 12 months"
            />
          )}
        </Field>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => save.mutate()} loading={save.isPending}>
            Save to profile
          </Button>
          <Button
            onClick={() => assess.mutate()}
            loading={assess.isPending}
            disabled={skills.length === 0}
            icon={<Map className="h-4 w-4" />}
          >
            Generate roadmap
          </Button>
        </div>
      </Card>
      <Card className="p-5">
        {assess.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-20" />
            <Skeleton className="h-32" />
          </div>
        ) : assess.data ? (
          <div className="space-y-5">
            <div className="flex items-center gap-2">
              <Badge tone="accent" className="capitalize">
                {assess.data.result.level}
              </Badge>
              {assess.data.isDemo && <Badge tone="warning">Demo (no AI key)</Badge>}
            </div>
            <p>{assess.data.result.summary}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold text-success">Strengths</h3>
                <ul className="mt-1 space-y-1 text-sm">
                  {assess.data.result.strengths.map((s) => (
                    <li key={s}>✓ {s}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-warning">Gaps</h3>
                <ul className="mt-1 space-y-1 text-sm">
                  {assess.data.result.gaps.map((s) => (
                    <li key={s}>→ {s}</li>
                  ))}
                </ul>
              </div>
            </div>
            <ol className="relative space-y-4 border-l-2 border-line pl-5">
              {assess.data.result.roadmap.map((step) => (
                <li key={step.phase}>
                  <span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full bg-accent" />
                  <p className="font-semibold">
                    {step.phase}{' '}
                    <span className="text-sm font-normal text-muted">· {step.weeks} weeks</span>
                  </p>
                  <p className="text-sm text-muted">{step.focus.join(' · ')}</p>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center py-16 text-center text-muted">
            <Map className="h-10 w-10" />
            <p className="mt-3">
              Rate your skills honestly, then generate a phased learning roadmap.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}

/** Legacy route: the career tools now live on the user's own profile. */
export default function Career() {
  const { user } = useAuth();
  return <Navigate to={user ? `/u/${user.username}?tab=resume` : '/login'} replace />;
}

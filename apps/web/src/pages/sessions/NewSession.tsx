import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { z } from 'zod';
import {
  createSessionSchema,
  interviewSetupSchema,
  LANGUAGES,
  type SessionDto,
} from '@devhub/shared';
import { problemsQuery } from '../../lib/interview';
import { cn } from '../../lib/utils';
import { api, errorMessage } from '../../lib/api';
import { useDocumentTitle } from '../../lib/hooks';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select, Textarea } from '../../components/ui/Field';
import { Card, SegmentedControl } from '../../components/ui/primitives';
import { TagInput } from '../../components/ui/TagInput';

type Form = z.input<typeof createSessionSchema>;

export default function NewSession() {
  const navigate = useNavigate();
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [params] = useSearchParams();
  const [mode, setMode] = useState<'PAIRING' | 'INTERVIEW'>(
    params.get('mode') === 'interview' ? 'INTERVIEW' : 'PAIRING',
  );
  const [source, setSource] = useState<'bank' | 'custom'>('bank');
  const [problemSlug, setProblemSlug] = useState('two-sum');
  const [custom, setCustom] = useState({ title: '', statement: '' });
  const [duration, setDuration] = useState(45);
  const [interviewError, setInterviewError] = useState<string | null>(null);
  const { data: bank } = useQuery({ ...problemsQuery, enabled: mode === 'INTERVIEW' });
  useDocumentTitle(mode === 'INTERVIEW' ? 'New interview' : 'New session');
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<Form>({
    resolver: zodResolver(createSessionSchema),
    defaultValues: {
      title: '',
      description: '',
      language: 'typescript',
      visibility: 'PUBLIC',
      maxParticipants: 8,
      tags: [],
    },
  });

  const create = useMutation({
    mutationFn: (v: Form) => api<SessionDto>('/sessions', { method: 'POST', body: v }),
    onSuccess: (s) => {
      toast.success(s.status === 'LIVE' ? 'Session is live. Share the link!' : 'Session scheduled');
      navigate(`/sessions/${s.id}`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const submit = handleSubmit((v) => {
    let interview: Form['interview'];
    if (mode === 'INTERVIEW') {
      const parsed = interviewSetupSchema.safeParse(
        source === 'bank'
          ? { problemSlug, durationMinutes: duration }
          : { customProblem: custom, durationMinutes: duration },
      );
      if (!parsed.success) {
        setInterviewError(parsed.error.issues[0]?.message ?? 'Check the problem');
        return;
      }
      setInterviewError(null);
      interview = parsed.data;
    }
    create.mutate({ ...v, interview, scheduledFor: when === 'later' ? v.scheduledFor : undefined });
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold">
        {mode === 'INTERVIEW' ? 'Set up a mock interview' : 'Start a coding session'}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {mode === 'INTERVIEW'
          ? 'You are the interviewer: pick a problem, start the clock when the candidate is ready, and keep private notes. Practising alone? Talk it through with the AI interviewer.'
          : 'Everyone who joins edits the same document in real time.'}
      </p>
      <form onSubmit={submit} className="mt-6" noValidate>
        <Card className="space-y-5 p-6">
          <div className="space-y-2">
            <p className="text-sm font-medium">Type</p>
            <SegmentedControl
              label="Session type"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'PAIRING', label: 'Pair programming' },
                { value: 'INTERVIEW', label: 'Mock interview' },
              ]}
            />
          </div>
          {mode === 'INTERVIEW' && (
            <fieldset className="space-y-4 rounded-xl border border-line p-4">
              <legend className="px-1 text-sm font-semibold">Interview</legend>
              <SegmentedControl
                label="Problem source"
                value={source}
                onChange={setSource}
                options={[
                  { value: 'bank', label: 'From the bank' },
                  { value: 'custom', label: 'Write my own' },
                ]}
              />
              {source === 'bank' ? (
                <div role="radiogroup" aria-label="Problem" className="grid gap-2 sm:grid-cols-2">
                  {(bank?.items ?? []).map((p) => (
                    <button
                      key={p.slug}
                      type="button"
                      role="radio"
                      aria-checked={problemSlug === p.slug}
                      onClick={() => setProblemSlug(p.slug)}
                      className={cn(
                        'rounded-lg border p-3 text-left',
                        problemSlug === p.slug
                          ? 'border-accent bg-accent-soft'
                          : 'border-line hover:border-muted',
                      )}
                    >
                      <span className="block text-sm font-medium">{p.title}</span>
                      <span className="text-xs text-muted">
                        {p.difficulty} · {p.topics.join(', ')}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  <Field label="Problem title">
                    {(p) => (
                      <Input
                        {...p}
                        value={custom.title}
                        onChange={(e) => setCustom({ ...custom, title: e.target.value })}
                      />
                    )}
                  </Field>
                  <Field
                    label="Problem statement"
                    hint="Markdown. Hidden from the candidate until you start."
                  >
                    {(p) => (
                      <Textarea
                        {...p}
                        rows={6}
                        value={custom.statement}
                        onChange={(e) => setCustom({ ...custom, statement: e.target.value })}
                      />
                    )}
                  </Field>
                </>
              )}
              <Field label="Duration (minutes)">
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    min={10}
                    max={120}
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                  />
                )}
              </Field>
              {interviewError && (
                <p role="alert" className="text-sm text-danger">
                  {interviewError}
                </p>
              )}
            </fieldset>
          )}
          <Field label="Title" error={errors.title?.message}>
            {(p) => (
              <Input
                {...p}
                placeholder="e.g. Building a rate limiter in TypeScript"
                {...register('title')}
              />
            )}
          </Field>
          <Field label="What will you work on?" error={errors.description?.message} hint="Optional">
            {(p) => <Textarea {...p} rows={3} {...register('description')} />}
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Language" error={errors.language?.message}>
              {(p) => (
                <Select {...p} {...register('language')}>
                  {LANGUAGES.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Max participants" error={errors.maxParticipants?.message}>
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={2}
                  max={50}
                  {...register('maxParticipants', { valueAsNumber: true })}
                />
              )}
            </Field>
          </div>
          <Field
            label="Visibility"
            error={errors.visibility?.message}
            hint="Private sessions get an invite code only you can share."
          >
            {(p) => (
              <Select {...p} {...register('visibility')}>
                <option value="PUBLIC">Public: listed, anyone can join</option>
                <option value="PRIVATE">Private: invite code required</option>
              </Select>
            )}
          </Field>
          <Field label="Tags" error={errors.tags?.message} hint="Optional">
            {(p) => (
              <Controller
                control={control}
                name="tags"
                render={({ field }) => (
                  <TagInput id={p.id} value={field.value ?? []} onChange={field.onChange} />
                )}
              />
            )}
          </Field>
          <div className="space-y-3">
            <p className="text-sm font-medium">When</p>
            <SegmentedControl
              label="When"
              value={when}
              onChange={setWhen}
              options={[
                { value: 'now', label: 'Start now' },
                { value: 'later', label: 'Schedule' },
              ]}
            />
            {when === 'later' && (
              <Field label="Start time" error={errors.scheduledFor?.message}>
                {(p) => (
                  <Input
                    {...p}
                    type="datetime-local"
                    // The input yields local time without an offset; the API expects ISO 8601.
                    {...register('scheduledFor', {
                      shouldUnregister: true,
                      setValueAs: (v: string) => (v ? new Date(v).toISOString() : undefined),
                    })}
                  />
                )}
              </Field>
            )}
          </div>
        </Card>
        <div className="mt-6 flex gap-3">
          <Button type="submit" loading={create.isPending}>
            {when === 'now' ? 'Go live' : 'Schedule session'}
          </Button>
          <Button variant="ghost" onClick={() => navigate(-1)}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

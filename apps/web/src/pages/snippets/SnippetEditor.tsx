import { lazy, Suspense, useEffect } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { z } from 'zod';
import { createSnippetSchema, LANGUAGES, type SnippetDto } from '@devhub/shared';
import { api, errorMessage, fieldErrors } from '../../lib/api';
import { qk } from '../../lib/queryClient';
import { useDocumentTitle } from '../../lib/hooks';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select, Textarea } from '../../components/ui/Field';
import { Card, Skeleton } from '../../components/ui/primitives';
import { TagInput } from '../../components/ui/TagInput';
import { PageSpinner } from '../../components/ui/Spinner';

const CodeEditor = lazy(() => import('../../components/CodeEditor'));
type Form = z.input<typeof createSnippetSchema>;

export default function SnippetEditor() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  useDocumentTitle(editing ? 'Edit snippet' : 'Share a snippet');
  const existing = useQuery({
    queryKey: qk.snippets.detail(id ?? ''),
    queryFn: () => api<SnippetDto>(`/snippets/${id}`),
    enabled: editing,
  });

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<Form>({
    resolver: zodResolver(createSnippetSchema),
    defaultValues: {
      title: '',
      description: '',
      code: '',
      language: 'typescript',
      tags: [],
      visibility: 'PUBLIC',
    },
  });
  useEffect(() => {
    const s = existing.data;
    if (s)
      reset({
        title: s.title,
        description: s.description,
        code: s.code,
        language: s.language as Form['language'],
        tags: s.tags,
        visibility: s.visibility,
      });
  }, [existing.data, reset]);

  const save = useMutation({
    mutationFn: (v: Form) =>
      editing
        ? api<SnippetDto>(`/snippets/${id}`, { method: 'PATCH', body: v })
        : api<SnippetDto>('/snippets', { method: 'POST', body: v }),
    onSuccess: (s) => {
      void qc.invalidateQueries({ queryKey: qk.snippets.all });
      toast.success(editing ? 'Snippet updated' : 'Snippet shared');
      navigate(`/snippets/${s.id}`);
    },
    onError: (err) => {
      const f = fieldErrors(err);
      for (const [k, v] of Object.entries(f)) setError(k as keyof Form, { message: v });
      if (!Object.keys(f).length) toast.error(errorMessage(err));
    },
  });

  const language = useWatch({ control, name: 'language' });
  if (editing && existing.isPending) return <PageSpinner />;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold">{editing ? 'Edit snippet' : 'Share a snippet'}</h1>
      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="mt-6 space-y-6" noValidate>
        <Card className="grid gap-5 p-6 md:grid-cols-2">
          <Field label="Title" error={errors.title?.message} className="md:col-span-2">
            {(p) => (
              <Input
                {...p}
                placeholder="e.g. Typed fetch wrapper with retries"
                {...register('title')}
              />
            )}
          </Field>
          <Field
            label="Description"
            error={errors.description?.message}
            hint="What is it for, and when should someone use it?"
            className="md:col-span-2"
          >
            {(p) => <Textarea {...p} rows={2} className="min-h-0" {...register('description')} />}
          </Field>
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
          <Field
            label="Visibility"
            error={errors.visibility?.message}
            hint="Unlisted: anyone with the link, not listed. Private: only you."
          >
            {(p) => (
              <Select {...p} {...register('visibility')}>
                <option value="PUBLIC">Public</option>
                <option value="UNLISTED">Unlisted</option>
                <option value="PRIVATE">Private</option>
              </Select>
            )}
          </Field>
          <Field label="Tags" error={errors.tags?.message} className="md:col-span-2">
            {(p) => (
              <Controller
                control={control}
                name="tags"
                render={({ field }) => (
                  <TagInput
                    id={p.id}
                    value={field.value ?? []}
                    onChange={field.onChange}
                    invalid={p['aria-invalid']}
                  />
                )}
              />
            )}
          </Field>
        </Card>
        <div>
          <p className="mb-1.5 text-sm font-medium">Code</p>
          <Card className="h-[28rem] overflow-hidden">
            <Suspense fallback={<Skeleton className="h-full w-full rounded-none" />}>
              <Controller
                control={control}
                name="code"
                render={({ field }) => (
                  <CodeEditor
                    height="100%"
                    language={language}
                    value={field.value}
                    onChange={(v) => field.onChange(v ?? '')}
                    aria-label="Code editor"
                  />
                )}
              />
            </Suspense>
          </Card>
          {errors.code && (
            <p role="alert" className="mt-1.5 text-xs text-danger">
              {errors.code.message}
            </p>
          )}
        </div>
        <div className="flex gap-3">
          <Button type="submit" loading={save.isPending}>
            {editing ? 'Save changes' : 'Share snippet'}
          </Button>
          <Button variant="ghost" onClick={() => navigate(-1)}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

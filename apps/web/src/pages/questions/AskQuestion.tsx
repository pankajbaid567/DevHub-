import { useEffect } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useParams } from 'react-router-dom';
import { DuplicateHint } from '../../components/SimilarQuestions';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lightbulb } from 'lucide-react';
import { toast } from 'sonner';
import {
  createQuestionSchema,
  type CreateQuestionInput,
  type QuestionDetailDto,
  type QuestionSummaryDto,
} from '@devhub/shared';
import { api, errorMessage, fieldErrors } from '../../lib/api';
import { qk } from '../../lib/queryClient';
import { useDocumentTitle } from '../../lib/hooks';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';
import { Card } from '../../components/ui/primitives';
import { MarkdownEditor } from '../../components/Markdown';
import { TagInput } from '../../components/ui/TagInput';
import { PageSpinner } from '../../components/ui/Spinner';

const DRAFT_KEY = 'devhub.question-draft';

export default function AskQuestion() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  useDocumentTitle(editing ? 'Edit question' : 'Ask a question');

  const existing = useQuery({
    queryKey: qk.questions.detail(id ?? ''),
    queryFn: () => api<QuestionDetailDto>(`/questions/${id}`),
    enabled: editing,
  });

  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { errors },
  } = useForm<CreateQuestionInput>({
    resolver: zodResolver(createQuestionSchema),
    defaultValues: { title: '', body: '', tags: [] },
  });

  // Restore an unsent draft (new questions only), and keep saving it as the user types.
  useEffect(() => {
    if (editing) return;
    try {
      const draft = localStorage.getItem(DRAFT_KEY);
      if (draft) reset(JSON.parse(draft) as CreateQuestionInput);
    } catch {
      /* ignore corrupt drafts */
    }
  }, [editing, reset]);
  const values = useWatch({ control });
  useEffect(() => {
    if (editing) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(values));
    } catch {
      /* storage full or disabled */
    }
  }, [editing, values]);
  useEffect(() => {
    if (existing.data)
      reset({ title: existing.data.title, body: existing.data.body, tags: existing.data.tags });
  }, [existing.data, reset]);

  const save = useMutation({
    mutationFn: (values: CreateQuestionInput) =>
      editing
        ? api<QuestionSummaryDto>(`/questions/${id}`, { method: 'PATCH', body: values })
        : api<QuestionSummaryDto>('/questions', { method: 'POST', body: values }),
    onSuccess: (q) => {
      if (!editing) localStorage.removeItem(DRAFT_KEY);
      void qc.invalidateQueries({ queryKey: qk.questions.all });
      toast.success(editing ? 'Question updated' : 'Question posted');
      navigate(`/questions/${q.id}`);
    },
    onError: (err) => {
      const fields = fieldErrors(err);
      for (const [k, v] of Object.entries(fields))
        setError(k as keyof CreateQuestionInput, { message: v });
      if (!Object.keys(fields).length) toast.error(errorMessage(err));
    },
  });

  if (editing && existing.isPending) return <PageSpinner />;

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_18rem]">
      <div>
        <h1 className="text-2xl font-bold">
          {editing ? 'Edit your question' : 'Ask a public question'}
        </h1>
        <form onSubmit={handleSubmit((v) => save.mutate(v))} className="mt-6 space-y-6" noValidate>
          <Card className="space-y-5 p-6">
            <Field
              label="Title"
              error={errors.title?.message}
              hint="Be specific, as if asking another developer in person."
            >
              {(p) => (
                <Input
                  {...p}
                  placeholder="e.g. How do I cancel a fetch request when a React component unmounts?"
                  {...register('title')}
                />
              )}
            </Field>
            <DuplicateHint title={values.title ?? ''} {...(id && { excludeId: id })} />
            <Field
              label="Details"
              error={errors.body?.message}
              hint="What did you try? What did you expect, and what happened instead?"
            >
              {(p) => (
                <Controller
                  control={control}
                  name="body"
                  render={({ field }) => (
                    <MarkdownEditor
                      id={p.id}
                      invalid={p['aria-invalid']}
                      describedBy={p['aria-describedby']}
                      value={field.value}
                      onChange={field.onChange}
                      rows={14}
                    />
                  )}
                />
              )}
            </Field>
            <Field
              label="Tags"
              error={errors.tags?.message}
              hint="Up to 5 tags that describe the technologies involved."
            >
              {(p) => (
                <Controller
                  control={control}
                  name="tags"
                  render={({ field }) => (
                    <TagInput
                      id={p.id}
                      invalid={p['aria-invalid']}
                      describedBy={p['aria-describedby']}
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
              )}
            </Field>
          </Card>
          <div className="flex gap-3">
            <Button type="submit" loading={save.isPending}>
              {editing ? 'Save changes' : 'Post your question'}
            </Button>
            <Button variant="ghost" onClick={() => navigate(-1)}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
      <aside>
        <Card className="sticky top-24 p-5 text-sm">
          <h2 className="flex items-center gap-2 font-semibold">
            <Lightbulb className="h-4 w-4 text-warning" /> Writing a good question
          </h2>
          <ol className="mt-3 list-decimal space-y-2 pl-4 text-muted">
            <li>Summarise the problem in the title.</li>
            <li>Describe what you tried and what happened.</li>
            <li>Include a minimal code example in a fenced block.</li>
            <li>Add tags so the right people find it.</li>
          </ol>
          {!editing && (
            <p className="mt-4 text-xs text-muted">
              Your draft is saved in this browser automatically.
            </p>
          )}
        </Card>
      </aside>
    </div>
  );
}

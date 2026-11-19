import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, EyeOff, FileCode2, FlaskConical, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  INTERVIEW_PROBLEMS,
  type RunnableProblemLanguage,
  type SubmissionDto,
} from '@devhub/shared';
import { api, errorMessage } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { cn, displayName, timeAgo } from '../../lib/utils';
import { Badge } from '../ui/primitives';
import { Button } from '../ui/Button';
import { Select } from '../ui/Field';

const LANGS: { value: RunnableProblemLanguage; label: string }[] = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
];

const STATUS: Record<
  SubmissionDto['status'],
  { label: string; tone: 'success' | 'danger' | 'warning' }
> = {
  passed: { label: 'All tests passed', tone: 'success' },
  failed: { label: 'Some tests failed', tone: 'danger' },
  error: { label: 'Did not run', tone: 'danger' },
  timeout: { label: 'Timed out', tone: 'warning' },
};

interface Props {
  sessionId: string;
  slug: string;
  sessionLanguage: string;
  canSubmit: boolean;
  getCode: () => string;
  replaceCode: (code: string) => void;
}

/**
 * Checks the shared editor's code against the problem's tests. Visible tests show input,
 * expected and actual output; hidden tests only say pass or fail (their data stays on the
 * server). Results are shared live with everyone in the room.
 */
export function TestsPanel({
  sessionId,
  slug,
  sessionLanguage,
  canSubmit,
  getCode,
  replaceCode,
}: Props) {
  const qc = useQueryClient();
  const problem = INTERVIEW_PROBLEMS.find((p) => p.slug === slug);
  const [language, setLanguage] = useState<RunnableProblemLanguage>(
    LANGS.some((l) => l.value === sessionLanguage)
      ? (sessionLanguage as RunnableProblemLanguage)
      : 'javascript',
  );
  const key = ['interview-submissions', sessionId];
  const { data } = useQuery({
    queryKey: key,
    queryFn: () => api<{ items: SubmissionDto[] }>(`/sessions/${sessionId}/interview/submissions`),
  });

  useEffect(() => {
    const socket = getSocket();
    const onSubmission = (s: SubmissionDto) => {
      if (s.sessionId !== sessionId) return;
      qc.setQueryData<{ items: SubmissionDto[] }>(['interview-submissions', sessionId], (old) => ({
        items: [s, ...(old?.items ?? []).filter((x) => x.id !== s.id)].slice(0, 10),
      }));
    };
    socket.on('submission:finished', onSubmission);
    return () => {
      socket.off('submission:finished', onSubmission);
    };
  }, [sessionId, qc]);

  const submit = useMutation({
    mutationFn: () =>
      api<SubmissionDto>(`/sessions/${sessionId}/interview/submissions`, {
        method: 'POST',
        body: { language, code: getCode() },
      }),
    onSuccess: (s) =>
      qc.setQueryData<{ items: SubmissionDto[] }>(key, (old) => ({
        items: [s, ...(old?.items ?? []).filter((x) => x.id !== s.id)].slice(0, 10),
      })),
    onError: (err) => toast.error(errorMessage(err)),
  });

  const applyStarter = () => {
    if (!problem) return;
    if (
      getCode().trim() &&
      !window.confirm('Replace the code in the editor with the starter code?')
    )
      return;
    replaceCode(problem.starter[language]);
  };

  const latest = data?.items[0];
  return (
    <section aria-labelledby="tests-heading" className="rounded-xl border border-line p-3">
      <h2 id="tests-heading" className="flex items-center gap-1.5 text-sm font-semibold">
        <FlaskConical className="h-4 w-4 text-accent" aria-hidden /> Tests
      </h2>
      <p className="mt-0.5 text-xs text-muted">
        Implement{' '}
        <code className="font-mono">
          {language === 'python' ? problem?.entry.python : problem?.entry.javascript}
        </code>
        . Hidden tests check edge cases; only pass or fail is shown for them.
      </p>
      {canSubmit && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Select
            aria-label="Test language"
            className="h-8 w-auto py-0 text-sm"
            value={language}
            onChange={(e) => setLanguage(e.target.value as RunnableProblemLanguage)}
          >
            {LANGS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            variant="outline"
            icon={<FileCode2 className="h-3.5 w-3.5" />}
            onClick={applyStarter}
          >
            Use starter code
          </Button>
          <Button
            size="sm"
            icon={<FlaskConical className="h-3.5 w-3.5" />}
            loading={submit.isPending}
            onClick={() => submit.mutate()}
          >
            Run tests
          </Button>
        </div>
      )}

      {latest && (
        <div className="mt-3" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS[latest.status].tone}>{STATUS[latest.status].label}</Badge>
            <span
              className="text-sm font-semibold tabular-nums"
              aria-label={`${latest.passed} of ${latest.total} tests passed`}
            >
              {latest.passed}/{latest.total}
            </span>
            <span className="ml-auto text-xs text-muted">
              {displayName(latest.user)} · {latest.language} · {timeAgo(latest.createdAt)}
            </span>
          </div>
          {(latest.status === 'error' || latest.status === 'timeout') && (
            <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-danger/10 p-2 font-mono text-xs whitespace-pre-wrap text-danger">
              {latest.status === 'timeout'
                ? 'The tests took longer than 5 seconds. Look for an infinite loop or a slow approach.'
                : latest.stderr.trim() || 'The code exited before the tests ran.'}
            </pre>
          )}
          <ol aria-label="Test results" className="mt-2 space-y-1.5">
            {latest.cases.map((c) => (
              <li
                key={c.index}
                className={cn(
                  'rounded-lg border px-2.5 py-1.5 text-xs',
                  c.passed ? 'border-success/30' : 'border-danger/30',
                )}
              >
                <div className="flex items-center gap-1.5 font-medium">
                  {c.passed ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-danger" aria-hidden />
                  )}
                  {c.hidden ? (
                    <span className="flex items-center gap-1">
                      Hidden test {c.index + 1}{' '}
                      <EyeOff className="h-3 w-3 text-muted" aria-hidden />
                    </span>
                  ) : (
                    <span>Example {c.index + 1}</span>
                  )}
                  <span className="sr-only">{c.passed ? 'passed' : 'failed'}</span>
                </div>
                {!c.hidden && !c.passed && (
                  <dl className="mt-1 grid grid-cols-[4.5rem_1fr] gap-x-2 font-mono">
                    <dt className="text-muted">Input</dt>
                    <dd className="break-all">{c.input}</dd>
                    <dt className="text-muted">Expected</dt>
                    <dd className="break-all">{c.expected}</dd>
                    {c.actual !== undefined && (
                      <>
                        <dt className="text-muted">Got</dt>
                        <dd className="break-all">{c.actual}</dd>
                      </>
                    )}
                  </dl>
                )}
                {c.error && <p className="mt-1 font-mono text-danger">{c.error}</p>}
              </li>
            ))}
          </ol>
          {(latest.stdout || latest.stderr) && (
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer text-muted">Output</summary>
              <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-surface-2 p-2 font-mono whitespace-pre-wrap">
                {latest.stdout}
                {latest.stderr && <span className="text-danger">{latest.stderr}</span>}
              </pre>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

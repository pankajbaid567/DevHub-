import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Play, TerminalSquare } from 'lucide-react';
import { toast } from 'sonner';
import {
  DOC_TEXT,
  RUNNABLE_LANGUAGES,
  type CodeRunDto,
  type RunnableLanguage,
  type UserSummary,
} from '@devhub/shared';
import { api, errorMessage } from '../lib/api';
import { getSocket } from '../lib/socket';
import type { SessionDoc } from '../lib/useSessionDoc';
import { cn, displayName } from '../lib/utils';
import { Badge } from './ui/primitives';
import { Button } from './ui/Button';

const STATUS: Record<
  CodeRunDto['status'],
  { label: string; tone: 'success' | 'danger' | 'warning' }
> = {
  ok: { label: 'Exited 0', tone: 'success' },
  error: { label: 'Error', tone: 'danger' },
  timeout: { label: 'Timed out (5 s)', tone: 'warning' },
  output_limit: { label: 'Output limit', tone: 'warning' },
  failed: { label: 'Runner unavailable', tone: 'danger' },
};

const isRunnable = (l: string): l is RunnableLanguage =>
  (RUNNABLE_LANGUAGES as readonly string[]).includes(l);

/**
 * Runs the shared document in the server's sandbox. Output is shared: when anyone presses
 * Run, every participant sees "running…" and then the same result, pushed over the socket.
 */
export function RunPanel({
  sessionId,
  session,
  language,
  canRun,
}: {
  sessionId: string;
  session: SessionDoc | null;
  language: string;
  canRun: boolean;
}) {
  const qc = useQueryClient();
  const key = ['session-runs', sessionId];
  const { data } = useQuery({
    queryKey: key,
    queryFn: () => api<{ enabled: boolean; items: CodeRunDto[] }>(`/sessions/${sessionId}/runs`),
  });
  const [lang, setLang] = useState<RunnableLanguage>(
    isRunnable(language) ? language : 'javascript',
  );
  const [stdin, setStdin] = useState('');
  const [showStdin, setShowStdin] = useState(false);
  const [running, setRunning] = useState<UserSummary | null>(null);

  useEffect(() => {
    const socket = getSocket();
    const onStart = (p: { sessionId: string; user: UserSummary }) => {
      if (p.sessionId === sessionId) setRunning(p.user);
    };
    const onFinish = (r: CodeRunDto) => {
      if (r.sessionId !== sessionId) return;
      setRunning(null);
      qc.setQueryData<{ enabled: boolean; items: CodeRunDto[] }>(key, (old) => ({
        enabled: old?.enabled ?? true,
        items: [r, ...(old?.items ?? []).filter((x) => x.id !== r.id)].slice(0, 10),
      }));
    };
    socket.on('run:started', onStart);
    socket.on('run:finished', onFinish);
    return () => {
      socket.off('run:started', onStart);
      socket.off('run:finished', onFinish);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, qc]);

  const run = async () => {
    if (!session || running) return;
    const code = session.doc.getText(DOC_TEXT).toString();
    try {
      await api<CodeRunDto>(`/sessions/${sessionId}/runs`, {
        method: 'POST',
        body: { language: lang, code, ...(showStdin && stdin && { stdin }) },
      });
    } catch (err) {
      setRunning(null);
      toast.error(errorMessage(err));
    }
  };

  // Ctrl/Cmd + Enter runs, like most online IDEs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canRun && data?.enabled) {
        e.preventDefault();
        void run();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const last = data?.items[0];
  const enabled = data?.enabled ?? false;

  return (
    <section
      aria-label="Run output"
      className="flex max-h-72 min-h-36 flex-col border-t border-line"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-1.5">
        <TerminalSquare className="h-4 w-4 text-muted" aria-hidden />
        <span className="text-sm font-medium">Output</span>
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value as RunnableLanguage)}
          aria-label="Run as language"
          className="ml-auto h-8 rounded-md border border-line bg-surface px-2 text-xs"
        >
          {RUNNABLE_LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-xs text-muted">
          <input
            type="checkbox"
            checked={showStdin}
            onChange={(e) => setShowStdin(e.target.checked)}
          />
          stdin
        </label>
        <Button
          size="sm"
          onClick={() => void run()}
          disabled={!canRun || !enabled || !session || Boolean(running)}
          icon={
            running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />
          }
          title={
            enabled ? 'Run (Ctrl/Cmd + Enter)' : 'Code execution is not configured on this server'
          }
        >
          Run
        </Button>
      </div>
      {showStdin && (
        <textarea
          value={stdin}
          onChange={(e) => setStdin(e.target.value)}
          placeholder="Input passed to the program on stdin"
          aria-label="Program input"
          rows={2}
          className="border-b border-line bg-surface-2 px-3 py-2 font-mono text-xs focus:outline-none"
        />
      )}
      <div
        className="min-h-0 flex-1 overflow-auto bg-surface-2/60 px-3 py-2 font-mono text-xs"
        aria-live="polite"
      >
        {running ? (
          <p className="text-muted">Running… (started by {displayName(running)})</p>
        ) : !enabled ? (
          <p className="text-muted">Code execution is not configured on this server.</p>
        ) : !last ? (
          <p className="text-muted">
            Press Run to execute the shared code in an isolated sandbox. Everyone in the session
            sees the output.
          </p>
        ) : (
          <>
            <p className="mb-1 flex flex-wrap items-center gap-2 font-sans text-muted">
              <Badge tone={STATUS[last.status].tone}>{STATUS[last.status].label}</Badge>
              <span>
                {last.language} · {last.durationMs} ms · run by {displayName(last.user)}
              </span>
            </p>
            {last.stdout && <pre className="whitespace-pre-wrap text-fg">{last.stdout}</pre>}
            {last.stderr && (
              <pre className={cn('whitespace-pre-wrap', 'text-danger')}>{last.stderr}</pre>
            )}
            {!last.stdout && !last.stderr && <p className="text-muted">(no output)</p>}
          </>
        )}
      </div>
    </section>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  Check,
  EyeOff,
  Flag,
  Loader2,
  Lock,
  Mic,
  MicOff,
  PhoneOff,
  Play,
  Plus,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  RATING_KEYS,
  RATING_LABELS,
  RECOMMENDATIONS,
  type InterviewFeedbackDto,
  type InterviewStateDto,
  type Recommendation,
  type ScorecardDto,
  type SessionDetailDto,
} from '@devhub/shared';
import { api, errorMessage } from '../../lib/api';
import { qk } from '../../lib/queryClient';
import { problemsQuery } from '../../lib/interview';
import { useVoiceInterviewer } from '../../lib/useVoiceInterviewer';
import { cn } from '../../lib/utils';
import { Markdown } from '../Markdown';
import { Badge } from '../ui/primitives';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Field';
import { TestsPanel } from './TestsPanel';
import { ProctoringLog } from './ProctoringLog';

const REC_LABEL: Record<Recommendation, string> = {
  STRONG_NO: 'Strong no',
  NO: 'No',
  YES: 'Yes',
  STRONG_YES: 'Strong yes',
};

interface Props {
  session: SessionDetailDto;
  state: InterviewStateDto;
  offsetMs: number;
  isInterviewer: boolean;
  canTalk: boolean;
  getCode: () => string;
  replaceCode: (code: string) => void;
}

/** The interview side panel: problem, clock controls, private scorecard and the AI interviewer. */
export function InterviewPanel({
  session,
  state,
  offsetMs,
  isInterviewer,
  canTalk,
  getCode,
  replaceCode,
}: Props) {
  const qc = useQueryClient();
  const live = session.status === 'LIVE';
  const control = useMutation({
    mutationFn: (body: { action: 'start' | 'end' } | { action: 'extend'; minutes: number }) =>
      api<InterviewStateDto>(`/sessions/${session.id}/interview`, { method: 'POST', body }),
    onSuccess: (interview) =>
      qc.setQueryData<SessionDetailDto>(qk.sessions.detail(session.id), (old) =>
        old ? { ...old, interview } : old,
      ),
    onError: (err) => toast.error(errorMessage(err)),
  });
  const running = Boolean(state.startedAt && !state.endedAt);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
      <section aria-labelledby="problem-heading">
        <div className="flex items-center gap-2">
          <h2 id="problem-heading" className="font-semibold">
            {state.problem?.title ?? 'Problem'}
          </h2>
          {state.problem?.difficulty && (
            <Badge
              tone={
                state.problem.difficulty === 'Easy'
                  ? 'success'
                  : state.problem.difficulty === 'Medium'
                    ? 'warning'
                    : 'danger'
              }
            >
              {state.problem.difficulty}
            </Badge>
          )}
        </div>
        {state.problem ? (
          <Markdown className="mt-2 text-sm">{state.problem.statement}</Markdown>
        ) : (
          <p className="mt-2 flex items-center gap-2 rounded-lg bg-surface-2 p-3 text-sm text-muted">
            <EyeOff className="h-4 w-4 shrink-0" aria-hidden />
            The problem appears when the interviewer starts the interview.
          </p>
        )}
        {isInterviewer && !state.startedAt && (
          <p className="mt-2 text-xs text-muted">Only you can see the problem until you start.</p>
        )}
      </section>

      {isInterviewer && live && (
        <div className="flex flex-wrap gap-2">
          {!state.startedAt && (
            <Button
              size="sm"
              icon={<Play className="h-3.5 w-3.5" />}
              loading={control.isPending}
              onClick={() => control.mutate({ action: 'start' })}
            >
              Start interview
            </Button>
          )}
          {running && (
            <>
              <Button
                size="sm"
                variant="outline"
                icon={<Plus className="h-3.5 w-3.5" />}
                disabled={control.isPending}
                onClick={() => control.mutate({ action: 'extend', minutes: 5 })}
              >
                5 min
              </Button>
              <Button
                size="sm"
                variant="outline"
                icon={<Flag className="h-3.5 w-3.5" />}
                disabled={control.isPending}
                onClick={() => control.mutate({ action: 'end' })}
              >
                End interview
              </Button>
            </>
          )}
        </div>
      )}

      {state.problem?.hasTests && state.problem.slug && (
        <TestsPanel
          sessionId={session.id}
          slug={state.problem.slug}
          sessionLanguage={session.language}
          canSubmit={canTalk && live && !state.endedAt && Boolean(state.startedAt || isInterviewer)}
          getCode={getCode}
          replaceCode={replaceCode}
        />
      )}
      {canTalk && live && !state.endedAt && (state.startedAt || isInterviewer) && (
        <VoiceInterviewer
          sessionId={session.id}
          state={state}
          offsetMs={offsetMs}
          getCode={getCode}
        />
      )}
      <FeedbackHistory sessionId={session.id} />
      {isInterviewer && <Scorecard sessionId={session.id} />}
      {isInterviewer && state.proctoring && <ProctoringLog sessionId={session.id} />}
    </div>
  );
}

function Scorecard({ sessionId }: { sessionId: string }) {
  const { data } = useQuery({
    queryKey: ['scorecard', sessionId],
    queryFn: () => api<ScorecardDto>(`/sessions/${sessionId}/interview/scorecard`),
    staleTime: Infinity, // the form owns the state once loaded
  });
  return data ? <ScorecardForm sessionId={sessionId} initial={data} /> : null;
}

function ScorecardForm({ sessionId, initial }: { sessionId: string; initial: ScorecardDto }) {
  const [draft, setDraft] = useState<ScorecardDto>(initial);
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [dirty, setDirty] = useState(false);

  // Autosave, debounced: notes are typed during a live interview, so no Save button to forget.
  useEffect(() => {
    if (!dirty) return;
    const t = window.setTimeout(() => {
      setSaved('saving');
      api<ScorecardDto>(`/sessions/${sessionId}/interview/scorecard`, {
        method: 'PUT',
        body: { notes: draft.notes, ratings: draft.ratings, recommendation: draft.recommendation },
      })
        .then(() => setSaved('saved'))
        .catch(() => setSaved('error'));
    }, 700);
    return () => window.clearTimeout(t);
  }, [draft, dirty, sessionId]);

  const edit = (patch: Partial<ScorecardDto>) => {
    setDirty(true);
    setDraft({ ...draft, ...patch });
  };
  return (
    <section aria-labelledby="scorecard-heading" className="rounded-xl border border-line p-3">
      <div className="flex items-center gap-2">
        <h2 id="scorecard-heading" className="flex items-center gap-1.5 text-sm font-semibold">
          <Lock className="h-3.5 w-3.5" aria-hidden /> Private notes
        </h2>
        <span className="ml-auto text-xs text-muted" role="status">
          {saved === 'saving'
            ? 'Saving…'
            : saved === 'saved'
              ? 'Saved'
              : saved === 'error'
                ? 'Not saved'
                : ''}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-muted">
        Only you can see these. They are never shared with the candidate.
      </p>
      <Textarea
        aria-label="Private interviewer notes"
        className="mt-2 min-h-32 text-sm"
        placeholder="Clarifying questions, approach, bugs, hints given…"
        value={draft.notes}
        onChange={(e) => edit({ notes: e.target.value })}
      />
      <div className="mt-3 space-y-2">
        {RATING_KEYS.map((k) => (
          <div key={k} className="flex items-center justify-between gap-2">
            <span id={`rating-${k}`} className="text-sm">
              {RATING_LABELS[k]}
            </span>
            <div role="radiogroup" aria-labelledby={`rating-${k}`} className="flex gap-1">
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={draft.ratings[k] === n}
                  aria-label={`${n} of 4`}
                  onClick={() => edit({ ratings: { ...draft.ratings, [k]: n } })}
                  className={cn(
                    'h-7 w-7 rounded-md border text-xs font-semibold',
                    draft.ratings[k] === n
                      ? 'border-accent bg-accent text-white'
                      : 'border-line text-muted hover:text-fg',
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3">
        <span id="rec-label" className="text-sm">
          Recommendation
        </span>
        <div role="radiogroup" aria-labelledby="rec-label" className="mt-1 grid grid-cols-4 gap-1">
          {RECOMMENDATIONS.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={draft.recommendation === r}
              onClick={() => edit({ recommendation: r })}
              className={cn(
                'rounded-md border px-1 py-1.5 text-xs font-medium',
                draft.recommendation === r
                  ? r.endsWith('NO')
                    ? 'border-danger bg-danger/12 text-danger'
                    : 'border-success bg-success/12 text-success'
                  : 'border-line text-muted hover:text-fg',
              )}
            >
              {REC_LABEL[r]}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function VoiceInterviewer({
  sessionId,
  state,
  offsetMs,
  getCode,
}: {
  sessionId: string;
  state: InterviewStateDto;
  offsetMs: number;
  getCode: () => string;
}) {
  const { data: bank } = useQuery(problemsQuery);
  const qc = useQueryClient();
  const voice = useVoiceInterviewer({
    sessionId,
    getCode,
    endsAt: state.endsAt,
    clockOffsetMs: offsetMs,
  });
  const feedback = useMutation({
    mutationFn: () =>
      api<InterviewFeedbackDto>(`/sessions/${sessionId}/interview/feedback`, {
        method: 'POST',
        body: { transcript: voice.transcript, code: getCode() },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['interview-feedback', sessionId] });
      voice.reset();
      toast.success('Feedback is ready');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [voice.transcript]);

  if (!bank?.voiceEnabled) return null;
  const active = voice.status === 'live' || voice.status === 'connecting';
  const answered = voice.transcript.some((t) => t.role === 'candidate');

  return (
    <section aria-labelledby="voice-heading" className="rounded-xl border border-line p-3">
      <div className="flex items-center gap-2">
        <h2 id="voice-heading" className="flex items-center gap-1.5 text-sm font-semibold">
          <Bot className="h-4 w-4 text-accent" aria-hidden /> AI interviewer
        </h2>
        {voice.status === 'live' && (
          <Badge tone={voice.speaking ? 'accent' : 'success'}>
            {voice.speaking ? 'Speaking' : 'Listening'}
          </Badge>
        )}
      </div>
      <p className="mt-0.5 text-xs text-muted">
        Practise out loud with a voice interviewer that sees your code and runs. Powered by the
        Gemini Live API; audio goes straight from your browser to Google.
      </p>

      {voice.status === 'live' && (
        <div className="mt-3 flex items-center gap-2">
          <div
            className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"
            role="meter"
            aria-label="Microphone level"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(Math.min(1, voice.level * 4) * 100)}
          >
            <div
              className="h-full bg-success transition-[width] duration-75"
              style={{ width: `${Math.min(100, voice.level * 400)}%` }}
            />
          </div>
          <Button
            size="sm"
            variant="ghost"
            aria-pressed={voice.muted}
            aria-label={voice.muted ? 'Unmute microphone' : 'Mute microphone'}
            onClick={voice.toggleMute}
            icon={voice.muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          />
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {!active ? (
          <Button
            size="sm"
            icon={<Mic className="h-3.5 w-3.5" />}
            onClick={() => void voice.start()}
          >
            {voice.transcript.length ? 'Talk again' : 'Start talking'}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="danger"
            icon={
              voice.status === 'connecting' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <PhoneOff className="h-3.5 w-3.5" />
              )
            }
            onClick={voice.stop}
          >
            {voice.status === 'connecting' ? 'Connecting…' : 'Hang up'}
          </Button>
        )}
        {!active && answered && (
          <Button
            size="sm"
            variant="outline"
            icon={<Sparkles className="h-3.5 w-3.5" />}
            loading={feedback.isPending}
            onClick={() => feedback.mutate()}
          >
            Get feedback
          </Button>
        )}
      </div>
      {voice.error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {voice.error}
        </p>
      )}

      {voice.transcript.length > 0 && (
        <ol
          ref={list}
          aria-label="Interview transcript"
          className="mt-3 max-h-64 space-y-2 overflow-y-auto text-sm"
        >
          {voice.transcript.map((t, i) => (
            <li
              key={i}
              className={cn(
                'rounded-lg px-2.5 py-1.5',
                t.role === 'interviewer' ? 'bg-accent-soft' : 'bg-surface-2',
              )}
            >
              <span className="mr-1 text-xs font-semibold text-muted">
                {t.role === 'interviewer' ? 'Interviewer' : 'You'}
              </span>
              {t.text}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function FeedbackHistory({ sessionId }: { sessionId: string }) {
  const { data } = useQuery({
    queryKey: ['interview-feedback', sessionId],
    queryFn: () =>
      api<{ items: InterviewFeedbackDto[] }>(`/sessions/${sessionId}/interview/feedback`),
  });
  const [latest] = data?.items ?? [];
  if (!latest) return null;
  return (
    <section aria-labelledby="feedback-heading" className="rounded-xl border border-line p-3">
      <h2 id="feedback-heading" className="flex items-center gap-1.5 text-sm font-semibold">
        <Sparkles className="h-4 w-4 text-accent" aria-hidden /> Your feedback
        <Badge
          className="ml-auto"
          tone={latest.recommendation.endsWith('NO') ? 'danger' : 'success'}
        >
          {REC_LABEL[latest.recommendation]}
        </Badge>
      </h2>
      {latest.isDemo && (
        <p className="mt-1 text-xs text-warning">Demo feedback: no Gemini key is configured.</p>
      )}
      <p className="mt-2 text-sm">{latest.summary}</p>
      <dl className="mt-3 grid grid-cols-2 gap-2">
        {RATING_KEYS.map((k) => (
          <div key={k} className="rounded-lg bg-surface-2 px-2.5 py-1.5">
            <dt className="text-xs text-muted">{RATING_LABELS[k]}</dt>
            <dd className="font-semibold tabular-nums">{latest.scores[k]} / 4</dd>
          </div>
        ))}
      </dl>
      {latest.strengths.length > 0 && (
        <>
          <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">
            Strengths
          </h3>
          <ul className="mt-1 space-y-1 text-sm">
            {latest.strengths.map((s) => (
              <li key={s} className="flex gap-1.5">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-hidden /> {s}
              </li>
            ))}
          </ul>
        </>
      )}
      {latest.improvements.length > 0 && (
        <>
          <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">
            To work on
          </h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
            {latest.improvements.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-2 text-xs text-muted">From {latest.turns} transcript turns.</p>
    </section>
  );
}

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type * as Y from 'yjs';
import { ArrowLeft, FastForward, Pause, Play, RotateCcw } from 'lucide-react';
import {
  DOC_BOARD,
  DOC_TEXT,
  type ReplayPageDto,
  type ReplayUpdateDto,
  type SessionDetailDto,
} from '@devhub/shared';
import { api, errorMessage } from '../../lib/api';
import { useDocumentTitle } from '../../lib/hooks';
import { BOARD_H, BOARD_W, drawStroke } from '../../lib/board';
import { buildTimeline, indexAt, ReplayDoc, type Timeline } from '../../lib/replay';
import { displayName } from '../../lib/utils';
import { Avatar, Card, EmptyState, ErrorState, Skeleton } from '../../components/ui/primitives';
import { Button } from '../../components/ui/Button';
import { PageSpinner } from '../../components/ui/Spinner';

const CodeEditor = lazy(() => import('../../components/CodeEditor'));

const SPEEDS = [1, 4, 16] as const;

async function loadAll(sessionId: string): Promise<ReplayUpdateDto[]> {
  const items: ReplayUpdateDto[] = [];
  let after = '0';
  for (;;) {
    const page = await api<ReplayPageDto>(`/sessions/${sessionId}/replay`, {
      query: { after, limit: 5_000 },
    });
    items.push(...page.items);
    if (!page.nextAfter) return items;
    after = page.nextAfter;
  }
}

const fmt = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function BoardSnapshot({ doc }: { doc: Y.Doc }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const scale = canvas.width / BOARD_W;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const s of doc.getArray<Y.Map<unknown>>(DOC_BOARD).toArray()) drawStroke(ctx, s, scale);
  }, [doc]);
  return (
    <canvas
      ref={ref}
      width={800}
      height={(800 * BOARD_H) / BOARD_W}
      className="w-full rounded-lg border border-line bg-white"
      aria-label="Whiteboard at this moment"
    />
  );
}

/**
 * Plays back a session: the shared code and whiteboard are rebuilt from the recorded Yjs edit
 * log at any moment, with play/pause, 1x/4x/16x speed, scrubbing and idle time skipped.
 */
export default function SessionReplay() {
  const { id = '' } = useParams();
  const session = useQuery({
    queryKey: ['sessions', 'detail', id],
    queryFn: () => api<SessionDetailDto>(`/sessions/${id}`),
  });
  const log = useQuery({
    queryKey: ['replay', id],
    queryFn: () => loadAll(id),
    staleTime: Infinity,
  });
  useDocumentTitle(session.data ? `Replay: ${session.data.title}` : 'Replay');

  const timeline: Timeline | null = useMemo(
    () => (log.data ? buildTimeline(log.data) : null),
    [log.data],
  );
  const engine = useMemo(() => (timeline ? new ReplayDoc(timeline) : null), [timeline]);

  const [pos, setPos] = useState(0); // playback ms
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(4);
  const [view, setView] = useState<'code' | 'board'>('code');

  useEffect(() => {
    if (!playing || !timeline) return;
    let last = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const dt = (now - last) * speed;
      last = now;
      setPos((p) => {
        const next = Math.min(timeline.duration, p + dt);
        if (next >= timeline.duration) setPlaying(false);
        return next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, timeline]);

  const index = timeline ? indexAt(timeline, pos) : -1;
  const doc = useMemo(() => (engine ? engine.at(index) : null), [engine, index]);
  useEffect(() => () => doc?.destroy(), [doc]);

  const people = useMemo(() => {
    const m = new Map<string, SessionDetailDto['participants'][number]['user']>();
    for (const p of session.data?.participants ?? []) m.set(p.user.id, p.user);
    return m;
  }, [session.data]);

  if (session.isPending || log.isPending) return <PageSpinner label="Loading replay" />;
  if (session.isError || log.isError)
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <ErrorState message={errorMessage(session.error ?? log.error)} />
      </div>
    );
  const s = session.data;
  const author = index >= 0 && timeline ? timeline.authors[index] : null;
  const editor = author ? people.get(author) : undefined;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to={`/sessions/${id}`}
          className="text-muted hover:text-fg"
          aria-label="Back to session"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-bold">Replay: {s.title}</h1>
        <span className="text-sm text-muted">
          {timeline?.updates.length ?? 0} recorded edits · idle time skipped
        </span>
      </div>

      {!timeline || timeline.updates.length === 0 ? (
        <EmptyState title="Nothing recorded yet">
          Edits are recorded while the session is live. Come back after some pairing.
        </EmptyState>
      ) : (
        <>
          <Card className="flex flex-wrap items-center gap-3 p-3">
            <Button
              size="icon"
              onClick={() => {
                if (pos >= timeline.duration) setPos(0);
                setPlaying((p) => !p);
              }}
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => {
                setPlaying(false);
                setPos(0);
              }}
              aria-label="Restart"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            <input
              type="range"
              min={0}
              max={Math.max(1, timeline.duration)}
              value={pos}
              onChange={(e) => {
                setPlaying(false);
                setPos(Number(e.target.value));
              }}
              aria-label="Timeline"
              className="min-w-40 flex-1 accent-[var(--color-accent)]"
            />
            <span className="w-24 text-right text-sm tabular-nums text-muted">
              {fmt(pos)} / {fmt(timeline.duration)}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]!)}
              icon={<FastForward className="h-4 w-4" />}
              aria-label={`Speed ${speed}x`}
            >
              {speed}x
            </Button>
          </Card>

          <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
            <Card className="overflow-hidden">
              <div
                role="tablist"
                aria-label="Replay view"
                className="flex border-b border-line px-2"
              >
                {(['code', 'board'] as const).map((v) => (
                  <button
                    key={v}
                    role="tab"
                    aria-selected={view === v}
                    onClick={() => setView(v)}
                    className={`px-3 py-2.5 text-sm font-medium ${view === v ? 'border-b-2 border-accent' : 'text-muted'}`}
                  >
                    {v === 'code' ? 'Code' : 'Whiteboard'}
                  </button>
                ))}
              </div>
              <div className="h-[28rem]">
                {doc && view === 'code' ? (
                  <Suspense fallback={<Skeleton className="h-full w-full rounded-none" />}>
                    <CodeEditor
                      value={doc.getText(DOC_TEXT).toString()}
                      language={s.language}
                      options={{ readOnly: true, domReadOnly: true }}
                    />
                  </Suspense>
                ) : doc ? (
                  <div className="p-3">
                    <BoardSnapshot doc={doc} />
                  </div>
                ) : null}
              </div>
            </Card>
            <Card className="p-4 text-sm">
              <h2 className="mb-2 font-semibold">At this moment</h2>
              {editor ? (
                <p className="flex items-center gap-2">
                  <Avatar name={displayName(editor)} src={editor.avatarUrl} size={24} />
                  {displayName(editor)} is editing
                </p>
              ) : (
                <p className="text-muted">
                  {index < 0 ? 'Before the first edit' : 'Initial document'}
                </p>
              )}
              {timeline && index >= 0 && (
                <p className="mt-2 text-xs text-muted">
                  {new Date(timeline.times[index]!).toLocaleString()}
                </p>
              )}
              <h2 className="mt-4 mb-2 font-semibold">Participants</h2>
              <ul className="space-y-1.5">
                {s.participants.map((p) => (
                  <li key={p.user.id} className="flex items-center gap-2">
                    <Avatar name={displayName(p.user)} src={p.user.avatarUrl} size={20} />
                    {displayName(p.user)}
                    <span className="text-xs text-muted">{p.role.toLowerCase()}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

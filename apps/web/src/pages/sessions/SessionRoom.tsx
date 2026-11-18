import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Code2,
  PenTool,
  Video,
  Copy,
  Crown,
  Lock,
  Play,
  Send,
  Square,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  ChatMessageDto,
  CursorPage,
  PresenceEntry,
  SessionDetailDto,
  SessionStatus,
} from '@devhub/shared';
import { ApiError, api, errorMessage } from '../../lib/api';
import { qk } from '../../lib/queryClient';
import { getSocket } from '../../lib/socket';
import { useAuth } from '../../auth/context';
import { useDocumentTitle } from '../../lib/hooks';
import { cn, displayName, timeAgo } from '../../lib/utils';
import { Avatar, Badge, Card, ErrorState, Skeleton } from '../../components/ui/primitives';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Field';
import { PageSpinner } from '../../components/ui/Spinner';
import { CallPanel } from '../../components/CallPanel';
import { RunPanel } from '../../components/RunPanel';
import { useSessionDoc } from '../../lib/useSessionDoc';
import { useCall } from '../../lib/useCall';

const CollabEditor = lazy(() => import('../../components/CollabEditor'));
const Whiteboard = lazy(() => import('../../components/Whiteboard'));

interface WorkspaceProps {
  sessionId: string;
  language: string;
  live: boolean;
  readOnly: boolean;
  isHost: boolean;
  me: { id: string; name: string };
  profile: { username: string; displayName: string | null };
  onPresence: (p: PresenceEntry[]) => void;
  onConnectionChange: (connected: boolean) => void;
}

/**
 * The participant workspace: one live Yjs document shared by the code editor and the
 * whiteboard, plus an optional peer-to-peer video call. Mounted only for participants,
 * because joining the document requires membership.
 */
function Workspace({
  sessionId,
  language,
  live,
  readOnly,
  isHost,
  me,
  profile,
  onPresence,
  onConnectionChange,
}: WorkspaceProps) {
  const session = useSessionDoc({ sessionId, me, onPresence, onConnectionChange });
  const call = useCall(sessionId);
  const { leave } = call;
  const [view, setView] = useState<'code' | 'board'>('code');

  // The host ended the session: hang up.
  useEffect(() => {
    if (!live) leave();
  }, [live, leave]);
  useEffect(() => {
    if (call.error) toast.error(call.error);
  }, [call.error]);

  return (
    <div className="flex min-h-0 flex-col gap-3">
      {call.joined && <CallPanel call={call} me={profile} />}
      <Card className="flex min-h-[24rem] flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-1 border-b border-line px-2">
          <div role="tablist" aria-label="Workspace" className="flex">
            {(
              [
                ['code', 'Code', Code2],
                ['board', 'Whiteboard', PenTool],
              ] as const
            ).map(([v, label, Icon]) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium',
                  view === v ? 'border-b-2 border-accent text-fg' : 'text-muted hover:text-fg',
                )}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
          {live && !call.joined && (
            <Button
              size="sm"
              variant="outline"
              className="my-1.5 ml-auto"
              loading={call.joining}
              onClick={() => void call.join()}
              icon={<Video className="h-4 w-4" />}
            >
              Join video call
            </Button>
          )}
        </div>
        <div className="relative min-h-0 flex-1">
          {session ? (
            <Suspense fallback={<Skeleton className="h-full w-full rounded-none" />}>
              <div className={view === 'code' ? 'flex h-full flex-col' : 'hidden'}>
                <div className="min-h-0 flex-1">
                  <CollabEditor session={session} language={language} readOnly={readOnly} />
                </div>
                <RunPanel
                  sessionId={sessionId}
                  session={session}
                  language={language}
                  canRun={live && !readOnly}
                />
              </div>
              <div className={view === 'board' ? 'h-full' : 'hidden'}>
                <Whiteboard session={session} readOnly={readOnly} canClear={isHost} me={me} />
              </div>
            </Suspense>
          ) : (
            <Skeleton className="h-full w-full rounded-none" />
          )}
        </div>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: SessionStatus }) {
  if (status === 'LIVE')
    return (
      <Badge tone="danger">
        <span className="h-2 w-2 animate-pulse rounded-full bg-danger" /> Live
      </Badge>
    );
  return (
    <Badge tone={status === 'SCHEDULED' ? 'accent' : 'neutral'}>
      {status === 'SCHEDULED' ? 'Scheduled' : 'Ended'}
    </Badge>
  );
}

function Chat({ sessionId, live }: { sessionId: string; live: boolean }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState<Record<string, string>>({});
  const bottom = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<number | undefined>(undefined);

  const history = useInfiniteQuery({
    queryKey: qk.sessions.messages(sessionId),
    queryFn: ({ pageParam }) =>
      api<CursorPage<ChatMessageDto>>(`/sessions/${sessionId}/messages`, {
        query: { cursor: pageParam, limit: 30 },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  // Pages are newest-first; display oldest-first.
  const messages = useMemo(
    () => (history.data?.pages.flatMap((p) => p.items) ?? []).slice().reverse(),
    [history.data],
  );

  useEffect(() => {
    const socket = getSocket();
    const onMessage = (m: ChatMessageDto) => {
      if (m.sessionId !== sessionId) return;
      qc.setQueryData<{ pages: CursorPage<ChatMessageDto>[]; pageParams: unknown[] }>(
        qk.sessions.messages(sessionId),
        (old) => {
          if (!old || old.pages[0]?.items.some((x) => x.id === m.id)) return old;
          const [first, ...rest] = old.pages;
          return { ...old, pages: [{ ...first!, items: [m, ...first!.items] }, ...rest] };
        },
      );
    };
    const onTyping = (p: {
      sessionId: string;
      user: { id: string; username: string; displayName: string | null };
      isTyping: boolean;
    }) => {
      if (p.sessionId !== sessionId) return;
      setTyping((t) => {
        const next = { ...t };
        if (p.isTyping) next[p.user.id] = displayName(p.user);
        else delete next[p.user.id];
        return next;
      });
    };
    socket.on('chat:message', onMessage);
    socket.on('chat:typing', onTyping);
    return () => {
      socket.off('chat:message', onMessage);
      socket.off('chat:typing', onTyping);
    };
  }, [qc, sessionId]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const send = async () => {
    const content = draft.trim();
    if (!content) return;
    setDraft('');
    getSocket().emit('chat:typing', { sessionId, isTyping: false });
    const res = await getSocket().emitWithAck('chat:send', { sessionId, content });
    if (!res.ok) {
      toast.error(res.message);
      setDraft(content);
    }
  };

  const onType = (v: string) => {
    setDraft(v);
    const socket = getSocket();
    if (!typingTimer.current) socket.emit('chat:typing', { sessionId, isTyping: true });
    window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => {
      socket.emit('chat:typing', { sessionId, isTyping: false });
      typingTimer.current = undefined;
    }, 1500);
  };

  const typers = Object.values(typing);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="flex-1 space-y-3 overflow-y-auto p-4"
        aria-live="polite"
        aria-label="Chat messages"
      >
        {history.hasNextPage && (
          <button
            type="button"
            onClick={() => history.fetchNextPage()}
            className="w-full text-center text-xs text-accent hover:underline"
          >
            {history.isFetchingNextPage ? 'Loading…' : 'Load earlier messages'}
          </button>
        )}
        {history.isPending && <Skeleton className="h-16" />}
        {messages.map((m) => (
          <div key={m.id} className="flex gap-2 text-sm">
            <Avatar name={m.author.displayName ?? m.author.username} size={26} />
            <div className="min-w-0">
              <p className="text-xs">
                <span className="font-semibold">{displayName(m.author)}</span>{' '}
                <span className="text-muted">{timeAgo(m.createdAt)}</span>
              </p>
              <p className="break-words whitespace-pre-wrap">{m.content}</p>
            </div>
          </div>
        ))}
        {!history.isPending && messages.length === 0 && (
          <p className="py-8 text-center text-sm text-muted">No messages yet. Say hello!</p>
        )}
        <div ref={bottom} />
      </div>
      <p className="h-5 px-4 text-xs text-muted">
        {typers.length
          ? `${typers.slice(0, 2).join(', ')}${typers.length > 2 ? ' and others' : ''} typing…`
          : ''}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="flex gap-2 border-t border-line p-3"
      >
        <Input
          value={draft}
          onChange={(e) => onType(e.target.value)}
          placeholder={live ? 'Message the room…' : 'Chat is closed'}
          disabled={!live}
          maxLength={2000}
          aria-label="Chat message"
        />
        <Button
          type="submit"
          size="icon"
          disabled={!live || !draft.trim()}
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}

export default function SessionRoom() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [presence, setPresence] = useState<PresenceEntry[]>([]);
  const [connected, setConnected] = useState(true);
  const [tab, setTab] = useState<'chat' | 'people'>('chat');
  const [inviteInput, setInviteInput] = useState('');

  const {
    data: s,
    isPending,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: qk.sessions.detail(id),
    queryFn: () => api<SessionDetailDto>(`/sessions/${id}`),
    retry: false,
  });
  useDocumentTitle(s?.title);

  const join = useMutation({
    mutationFn: (inviteCode?: string) =>
      api(`/sessions/${id}/join`, { method: 'POST', body: inviteCode ? { inviteCode } : {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.sessions.detail(id) }),
  });
  const lifecycle = useMutation({
    mutationFn: (action: 'start' | 'end') => api(`/sessions/${id}/${action}`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.sessions.detail(id) }),
  });

  useEffect(() => {
    const socket = getSocket();
    const onStatus = (p: { sessionId: string; status: SessionStatus }) => {
      if (p.sessionId !== id) return;
      qc.setQueryData<SessionDetailDto>(qk.sessions.detail(id), (old) =>
        old ? { ...old, status: p.status } : old,
      );
      toast.info(
        p.status === 'ENDED'
          ? 'The host ended this session. The editor is now read-only.'
          : 'The session is live!',
      );
    };
    socket.on('session:status', onStatus);
    return () => {
      socket.off('session:status', onStatus);
    };
  }, [id, qc]);

  const onPresence = useCallback((p: PresenceEntry[]) => setPresence(p), []);
  const me = useMemo(() => ({ id: user?.id ?? '', name: user ? displayName(user) : '' }), [user]);

  if (isPending) return <PageSpinner label="Opening the session" />;
  if (isError) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        {notFound ? (
          <Card className="p-6 text-center">
            <Lock className="mx-auto h-8 w-8 text-muted" />
            <h1 className="mt-3 font-semibold">Private or missing session</h1>
            <p className="mt-1 text-sm text-muted">
              If you were given an invite code, enter it to join.
            </p>
            <form
              className="mt-4 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                join.mutate(inviteInput.trim(), {
                  onSuccess: () => void refetch(),
                  onError: () => toast.error('That code did not work'),
                });
              }}
            >
              <Input
                value={inviteInput}
                onChange={(e) => setInviteInput(e.target.value.toUpperCase())}
                placeholder="INVITE CODE"
                aria-label="Invite code"
                className="font-mono uppercase"
              />
              <Button type="submit" loading={join.isPending}>
                Join
              </Button>
            </form>
          </Card>
        ) : (
          <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
        )}
      </div>
    );
  }

  const isHost = s.myRole === 'HOST';
  const live = s.status === 'LIVE';

  if (!s.myRole) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <Card className="p-8 text-center">
          <StatusBadge status={s.status} />
          <h1 className="mt-3 text-xl font-bold">{s.title}</h1>
          <p className="mt-2 text-sm text-muted">
            {s.description || 'Join to see the shared editor and chat.'}
          </p>
          <p className="mt-4 text-sm">
            {s.participantCount}/{s.maxParticipants} participants · hosted by {displayName(s.host)}
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Button
              onClick={() => join.mutate(undefined)}
              loading={join.isPending}
              disabled={s.status === 'ENDED'}
            >
              {s.status === 'ENDED' ? 'Session ended' : 'Join session'}
            </Button>
            <Button variant="ghost" onClick={() => navigate('/sessions')}>
              Back
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-[100rem] flex-col px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-center gap-3 pb-3">
        <Link
          to="/sessions"
          className="rounded-lg p-1.5 text-muted hover:bg-surface-2"
          aria-label="Back to sessions"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="truncate text-lg font-semibold">{s.title}</h1>
        <StatusBadge status={s.status} />
        <Badge className="font-mono">{s.language}</Badge>
        <span
          className={cn(
            'inline-flex items-center gap-1 text-xs',
            connected ? 'text-success' : 'text-warning',
          )}
          role="status"
        >
          {connected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}{' '}
          {connected ? 'Connected' : 'Reconnecting…'}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden -space-x-2 sm:flex" aria-label={`${presence.length} people here`}>
            {presence.slice(0, 5).map((p) => (
              <span
                key={p.user.id}
                title={displayName(p.user)}
                className="rounded-full ring-2 ring-surface"
              >
                <Avatar name={p.user.displayName ?? p.user.username} size={28} />
              </span>
            ))}
          </div>
          {isHost && s.inviteCode && (
            <Button
              variant="outline"
              size="sm"
              icon={<Copy className="h-3.5 w-3.5" />}
              onClick={() => {
                void navigator.clipboard.writeText(s.inviteCode!);
                toast.success('Invite code copied');
              }}
            >
              <span className="font-mono">{s.inviteCode}</span>
            </Button>
          )}
          {isHost && s.status === 'SCHEDULED' && (
            <Button
              size="sm"
              icon={<Play className="h-3.5 w-3.5" />}
              loading={lifecycle.isPending}
              onClick={() => lifecycle.mutate('start')}
            >
              Start
            </Button>
          )}
          {isHost && live && (
            <Button
              size="sm"
              variant="danger"
              icon={<Square className="h-3.5 w-3.5" />}
              loading={lifecycle.isPending}
              onClick={() => lifecycle.mutate('end')}
            >
              End session
            </Button>
          )}
        </div>
      </div>

      {!live && (
        <p className="mb-3 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-muted">
          {s.status === 'SCHEDULED'
            ? 'This session has not started yet. The editor unlocks when the host starts it.'
            : 'This session has ended. The final code is shown read-only.'}
        </p>
      )}

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[1fr_22rem]">
        <Workspace
          sessionId={id}
          language={s.language}
          live={live}
          readOnly={!live || s.myRole === 'VIEWER'}
          isHost={isHost}
          me={me}
          profile={{ username: user?.username ?? '', displayName: user?.displayName ?? null }}
          onPresence={onPresence}
          onConnectionChange={setConnected}
        />
        <Card className="flex min-h-[20rem] flex-col overflow-hidden">
          <div role="tablist" className="flex border-b border-line">
            {(['chat', 'people'] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cn(
                  'flex-1 py-2.5 text-sm font-medium capitalize',
                  tab === t ? 'border-b-2 border-accent text-fg' : 'text-muted',
                )}
              >
                {t === 'people' ? `People (${presence.length})` : 'Chat'}
              </button>
            ))}
          </div>
          {tab === 'chat' ? (
            <Chat sessionId={id} live={live} />
          ) : (
            <ul className="space-y-1 overflow-y-auto p-3">
              {presence.map((p) => (
                <li
                  key={p.user.id}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-2"
                >
                  <Avatar name={p.user.displayName ?? p.user.username} size={30} />
                  <span className="flex-1 text-sm font-medium">{displayName(p.user)}</span>
                  {p.role === 'HOST' ? (
                    <Badge tone="warning">
                      <Crown className="h-3 w-3" /> Host
                    </Badge>
                  ) : (
                    <Badge>{p.role.toLowerCase()}</Badge>
                  )}
                </li>
              ))}
              {presence.length === 0 && (
                <li className="flex items-center gap-2 p-4 text-sm text-muted">
                  <Users className="h-4 w-4" /> Connecting…
                </li>
              )}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

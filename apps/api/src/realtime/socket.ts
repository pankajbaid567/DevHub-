import type { Server as HttpServer } from 'node:http';
import { Gauge } from '../lib/metrics.js';
import { SessionRecorder } from './recorder.js';
import type { RunBroadcaster } from '../modules/runs/runs.service.js';
import type { InterviewBroadcaster } from '../modules/interviews/interview.service.js';
import type { SubmissionBroadcaster } from '../modules/interviews/submissions.service.js';
import { Server, type Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import {
  REALTIME_LIMITS,
  sendMessageSchema,
  type Ack,
  type ChatMessageDto,
  type ClientToServerEvents,
  type IceServer,
  type ProctoringEventInput,
  type RtcPeer,
  type ParticipantRole,
  type PresenceEntry,
  type ServerToClientEvents,
  type SessionStatus,
  type UserSummary,
} from '@devhub/shared';
import type { Container } from '../container.js';
import { AppError } from '../core/errors.js';
import { toUserSummary, userSummarySelect } from '../core/mappers.js';
import { DocManager, toBytes } from './doc-manager.js';

interface SocketData {
  user: UserSummary & { role: 'USER' | 'ADMIN' };
  /** Access-token expiry (epoch seconds); events after this force re-authentication. */
  exp: number;
  /** Sessions this socket joined, with the user's role in each. */
  sessions: Record<string, ParticipantRole>;
  chat: { windowStart: number; count: number };
  /** The call this socket is in (one at a time), with its media state. */
  rtc: { sessionId: string; audio: boolean; video: boolean; screen: boolean } | null;
  /** Peers already verified as members of the same call (avoids a cluster lookup per ICE candidate). */
  rtcVerified: Set<string>;
}

interface InterServerEvents {
  'doc:update': (p: { sessionId: string; update: Uint8Array }) => void;
}

type IO = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type ClientSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export interface SessionBroadcaster
  extends RunBroadcaster, InterviewBroadcaster, SubmissionBroadcaster {
  status(sessionId: string, status: SessionStatus): void;
  message(m: ChatMessageDto): void;
}

const room = (sessionId: string) => `session:${sessionId}`;
const userRoom = (userId: string) => `user:${userId}`;

function fail(ack: Ack<never> | undefined, err: unknown): void {
  if (typeof ack !== 'function') return;
  if (err instanceof AppError) ack({ ok: false, code: err.code, message: err.message });
  else ack({ ok: false, code: 'INTERNAL', message: 'Something went wrong' });
}

export function attachRealtime(httpServer: HttpServer, c: Container) {
  const io: IO = new Server(httpServer, {
    path: '/socket.io',
    cors: { origin: c.env.CORS_ORIGINS, credentials: true },
    maxHttpBufferSize: REALTIME_LIMITS.maxDocUpdateBytes + 64 * 1024,
    pingInterval: 20_000,
    pingTimeout: 20_000,
    connectionStateRecovery: { maxDisconnectionDuration: 60_000 },
  });

  // Horizontal scaling: rooms and broadcasts span all instances through Redis pub/sub.
  const clustered = Boolean(c.redis);
  if (c.redis) {
    io.adapter(createAdapter(c.redis.duplicate(), c.redis.duplicate()));
  }

  const docs = new DocManager(c.sessions, c.logger);
  const recorder = new SessionRecorder(c.db, c.logger);
  docs.observe(recorder);
  c.metrics.add(
    new Gauge(
      'realtime_connections',
      'Open Socket.IO connections on this replica',
      () => io.engine.clientsCount,
    ),
  );
  c.metrics.add(
    new Gauge(
      'collab_documents_loaded',
      'Session documents held in memory on this replica',
      () => docs.size,
    ),
  );
  const statusCache = new Map<string, SessionStatus>();

  // Updates applied on another instance are merged into this instance's copy (CRDT: order-free).
  io.on('doc:update', ({ sessionId, update }) => {
    try {
      docs.applyRemote(sessionId, toBytes(update));
    } catch (err) {
      c.logger.warn({ err, sessionId }, 'ignored malformed relayed update');
    }
  });

  // ------------------------------------------------------------- handshake authentication
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) return next(new Error('UNAUTHENTICATED'));
      const claims = c.tokens.verifyAccess(token);
      const user = await c.db.user.findUnique({
        where: { id: claims.sub },
        select: userSummarySelect,
      });
      if (!user) return next(new Error('UNAUTHENTICATED'));
      socket.data.user = { ...toUserSummary(user), role: claims.role };
      socket.data.exp = claims.exp;
      socket.data.sessions = {};
      socket.data.chat = { windowStart: Date.now(), count: 0 };
      socket.data.rtc = null;
      socket.data.rtcVerified = new Set();
      next();
    } catch {
      next(new Error('UNAUTHENTICATED'));
    }
  });

  async function presenceOf(sessionId: string): Promise<PresenceEntry[]> {
    // fetchSockets() is cluster-wide with the Redis adapter, so presence is correct across instances.
    const sockets = await io.in(room(sessionId)).fetchSockets();
    const byUser = new Map<string, PresenceEntry>();
    for (const s of sockets) {
      const role = s.data.sessions?.[sessionId];
      if (!role || !s.data.user) continue;
      const prev = byUser.get(s.data.user.id);
      if (prev) prev.connections += 1;
      else {
        const { role: _r, ...summary } = s.data.user;
        byUser.set(s.data.user.id, { user: summary, role, connections: 1 });
      }
    }
    return [...byUser.values()].sort((a, b) =>
      a.role === 'HOST'
        ? -1
        : b.role === 'HOST'
          ? 1
          : a.user.username.localeCompare(b.user.username),
    );
  }

  async function broadcastPresence(sessionId: string): Promise<void> {
    io.to(room(sessionId)).emit('session:presence', {
      sessionId,
      presence: await presenceOf(sessionId),
    });
  }

  /** Participants of a session's call, cluster-wide (works across replicas via the Redis adapter). */
  async function callPeers(sessionId: string): Promise<RtcPeer[]> {
    const sockets = await io.in(room(sessionId)).fetchSockets();
    return sockets
      .filter((s) => s.data.rtc?.sessionId === sessionId && s.data.user)
      .map((s) => {
        const { role: _r, ...summary } = s.data.user;
        const { audio, video, screen } = s.data.rtc!;
        return { socketId: s.id, user: summary, audio, video, screen };
      });
  }

  function leaveCall(socket: ClientSocket): void {
    const call = socket.data.rtc;
    if (!call) return;
    socket.data.rtc = null;
    socket.data.rtcVerified.clear();
    socket
      .to(room(call.sessionId))
      .emit('rtc:peer-left', { sessionId: call.sessionId, socketId: socket.id });
  }

  async function leave(socket: ClientSocket, sessionId: string): Promise<void> {
    if (socket.data.rtc?.sessionId === sessionId) leaveCall(socket);
    if (!socket.data.sessions[sessionId]) return;
    delete socket.data.sessions[sessionId];
    await socket.leave(room(sessionId));
    await docs.release(sessionId);
    await broadcastPresence(sessionId);
  }

  io.on('connection', (socket) => {
    const user = socket.data.user;
    void socket.join(userRoom(user.id));

    /** Wraps a handler with token-expiry checks, metrics and uniform error acks. */
    const on = <E extends keyof ClientToServerEvents>(
      event: E,
      handler: (...args: Parameters<ClientToServerEvents[E]>) => Promise<void> | void,
    ) => {
      socket.on(event, (async (...args: Parameters<ClientToServerEvents[E]>) => {
        c.metrics.socketEvents.inc({ event });
        if (socket.data.exp * 1000 < Date.now()) {
          socket.emit('auth:expired');
          socket.disconnect(true);
          return;
        }
        try {
          await handler(...args);
        } catch (err) {
          c.logger.warn({ err, event, userId: user.id }, 'socket handler failed');
          const ack = args[args.length - 1];
          fail(typeof ack === 'function' ? (ack as Ack<never>) : undefined, err);
        }
      }) as never);
    };

    on('session:join', async ({ sessionId }, ack) => {
      const { role, status } = await c.sessions.requireParticipant(user, String(sessionId));
      statusCache.set(sessionId, status);
      if (!socket.data.sessions[sessionId]) {
        socket.data.sessions[sessionId] = role;
        await socket.join(room(sessionId));
        await docs.acquire(sessionId);
      }
      ack({
        ok: true,
        data: { presence: await presenceOf(sessionId), state: docs.stateOf(sessionId) },
      });
      await broadcastPresence(sessionId);
    });

    on('session:leave', async ({ sessionId }) => leave(socket, sessionId));

    on('doc:update', ({ sessionId, update }) => {
      const role = socket.data.sessions[sessionId];
      if (!role || role === 'VIEWER' || statusCache.get(sessionId) !== 'LIVE') return;
      let bytes: Uint8Array;
      try {
        bytes = toBytes(update);
      } catch {
        return;
      }
      if (!docs.applyUpdate(sessionId, bytes, socket.data.user.id)) return;
      socket.to(room(sessionId)).emit('doc:update', { sessionId, update: bytes });
      // Buffer (not Uint8Array) so msgpack encodes it as binary across the Redis adapter.
      if (clustered) io.serverSideEmit('doc:update', { sessionId, update: Buffer.from(bytes) });
    });

    on('doc:awareness', ({ sessionId, update }) => {
      if (!socket.data.sessions[sessionId] || update.byteLength > 16 * 1024) return;
      socket.to(room(sessionId)).emit('doc:awareness', { sessionId, update });
    });

    on('chat:send', async ({ sessionId, content }, ack) => {
      if (!socket.data.sessions[sessionId])
        throw new AppError(403, 'FORBIDDEN', 'Join the session first');
      const now = Date.now();
      const w = socket.data.chat;
      if (now - w.windowStart > 10_000) Object.assign(w, { windowStart: now, count: 0 });
      if (++w.count > REALTIME_LIMITS.chatPer10s)
        throw new AppError(429, 'RATE_LIMITED', 'You are sending messages too fast');
      const parsed = sendMessageSchema.safeParse({ content });
      if (!parsed.success)
        throw new AppError(400, 'VALIDATION_FAILED', 'Message must be 1-2000 characters');
      const message = await c.sessions.postMessage(user, sessionId, parsed.data.content);
      io.to(room(sessionId)).emit('chat:message', message);
      ack({ ok: true, data: message });
    });

    on('chat:typing', ({ sessionId, isTyping }) => {
      if (!socket.data.sessions[sessionId]) return;
      const { role: _r, ...summary } = user;
      socket
        .to(room(sessionId))
        .emit('chat:typing', { sessionId, user: summary, isTyping: Boolean(isTyping) });
    });

    // ------------------------------------------------------------- WebRTC signalling
    // Media flows peer-to-peer; the server only relays offers/answers/ICE candidates between
    // members of the same call, so a stranger can never inject themselves into a call.
    on('rtc:join', async ({ sessionId, audio, video }, ack) => {
      if (!socket.data.sessions[sessionId])
        throw new AppError(403, 'FORBIDDEN', 'Join the session first');
      if (statusCache.get(sessionId) !== 'LIVE')
        throw new AppError(
          409,
          'SESSION_NOT_LIVE',
          'Calls are only available while the session is live',
        );
      if (socket.data.rtc) leaveCall(socket);
      const peers = await callPeers(sessionId);
      if (peers.length >= REALTIME_LIMITS.maxCallParticipants) {
        throw new AppError(
          409,
          'SESSION_FULL',
          `Calls are limited to ${REALTIME_LIMITS.maxCallParticipants} people`,
        );
      }
      socket.data.rtc = { sessionId, audio: Boolean(audio), video: Boolean(video), screen: false };
      const { role: _r, ...summary } = user;
      socket.to(room(sessionId)).emit('rtc:peer-joined', {
        sessionId,
        peer: {
          socketId: socket.id,
          user: summary,
          audio: Boolean(audio),
          video: Boolean(video),
          screen: false,
        },
      });
      ack({ ok: true, data: { peers, iceServers: iceServers() } });
    });

    on('rtc:leave', ({ sessionId }) => {
      if (socket.data.rtc?.sessionId === sessionId) leaveCall(socket);
    });

    on('rtc:signal', async ({ sessionId, to, description, candidate }) => {
      if (socket.data.rtc?.sessionId !== sessionId || typeof to !== 'string') return;
      if (JSON.stringify(description ?? candidate ?? '').length > REALTIME_LIMITS.maxSignalBytes)
        return;
      if (!socket.data.rtcVerified.has(to)) {
        const peers = await callPeers(sessionId);
        if (!peers.some((p) => p.socketId === to)) return;
        socket.data.rtcVerified.add(to);
      }
      io.to(to).emit('rtc:signal', {
        sessionId,
        from: socket.id,
        ...(description && { description }),
        ...(candidate && { candidate }),
      });
    });

    on('rtc:state', ({ sessionId, audio, video, screen }) => {
      if (socket.data.rtc?.sessionId !== sessionId) return;
      socket.data.rtc = {
        sessionId,
        audio: Boolean(audio),
        video: Boolean(video),
        screen: Boolean(screen),
      };
      socket.to(room(sessionId)).emit('rtc:state', {
        sessionId,
        socketId: socket.id,
        audio: Boolean(audio),
        video: Boolean(video),
        screen: Boolean(screen),
      });
    });

    // ------------------------------------------------------------- proctoring
    on('proctoring:event', async ({ sessionId, ...input }, ack) => {
      if (!socket.data.sessions[sessionId])
        throw new AppError(403, 'FORBIDDEN', 'Join the session first');
      const event = await c.proctoring.recordEvent(
        { id: user.id, role: user.role },
        sessionId,
        input as ProctoringEventInput,
      );
      if (event.id !== 'dropped') {
        // Notify the interviewer in real time; candidates never see this.
        const sockets = await io.in(room(sessionId)).fetchSockets();
        for (const s of sockets) {
          if (s.data.sessions[sessionId] === 'HOST') {
            s.emit('proctoring:violation', event);
          }
        }
        // Warn the candidate about the violation.
        socket.emit('proctoring:warning', {
          sessionId,
          message: `Violation detected: ${event.type.replace(/_/g, ' ').toLowerCase()}`,
        });
      }
      ack({ ok: true, data: undefined });
    });

    socket.on('disconnecting', () => {
      leaveCall(socket);
      for (const sessionId of Object.keys(socket.data.sessions)) void leave(socket, sessionId);
    });
  });

  /** STUN (and optional TURN) servers; only handed to authenticated call participants. */
  function iceServers(): IceServer[] {
    const servers: IceServer[] = [{ urls: c.env.STUN_URLS }];
    if (c.env.TURN_URL) {
      servers.push({
        urls: c.env.TURN_URL,
        ...(c.env.TURN_USERNAME && { username: c.env.TURN_USERNAME }),
        ...(c.env.TURN_CREDENTIAL && { credential: c.env.TURN_CREDENTIAL }),
      });
    }
    return servers;
  }

  // Notifications reach every open tab of the recipient, on any instance.
  c.notifications.setPusher((userId, n) => io.to(userRoom(userId)).emit('notification:new', n));

  const broadcaster: SessionBroadcaster = {
    status(sessionId, status) {
      statusCache.set(sessionId, status);
      io.to(room(sessionId)).emit('session:status', { sessionId, status });
      // Clients leave the call when they see ENDED; new joins are refused for non-live sessions.
      if (status === 'ENDED') void docs.flush(sessionId);
    },
    message(m) {
      io.to(room(m.sessionId)).emit('chat:message', m);
    },
    runStarted(sessionId, user, language) {
      io.to(room(sessionId)).emit('run:started', { sessionId, user, language });
    },
    runFinished(run) {
      io.to(room(run.sessionId)).emit('run:finished', run);
    },
    interview(state) {
      io.to(room(state.sessionId)).emit('interview:updated', state);
    },
    submission(sub) {
      io.to(room(sub.sessionId)).emit('submission:finished', sub);
    },
  };

  return {
    io,
    broadcaster,
    recorder,
    async close() {
      await docs.flushAll();
      await recorder.flush();
      await new Promise<void>((resolve) => io.close(() => resolve()));
    },
  };
}

import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import {
  REALTIME_LIMITS,
  sendMessageSchema,
  type Ack,
  type ChatMessageDto,
  type ClientToServerEvents,
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

export interface SessionBroadcaster {
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

  async function leave(socket: ClientSocket, sessionId: string): Promise<void> {
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
      if (!docs.applyUpdate(sessionId, bytes)) return;
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

    socket.on('disconnecting', () => {
      for (const sessionId of Object.keys(socket.data.sessions)) void leave(socket, sessionId);
    });
  });

  // Notifications reach every open tab of the recipient, on any instance.
  c.notifications.setPusher((userId, n) => io.to(userRoom(userId)).emit('notification:new', n));

  const broadcaster: SessionBroadcaster = {
    status(sessionId, status) {
      statusCache.set(sessionId, status);
      io.to(room(sessionId)).emit('session:status', { sessionId, status });
      if (status === 'ENDED') void docs.flush(sessionId);
    },
    message(m) {
      io.to(room(m.sessionId)).emit('chat:message', m);
    },
  };

  return {
    io,
    broadcaster,
    async close() {
      await docs.flushAll();
      await new Promise<void>((resolve) => io.close(() => resolve()));
    },
  };
}

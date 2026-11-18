import type { ChatMessageDto, ParticipantRole, SessionStatus } from './sessions.js';
import type { NotificationDto } from './notifications.js';
import type { UserSummary } from './common.js';

/**
 * Typed Socket.IO contract. Both the server (`Server<ClientToServer, ServerToClient>`)
 * and the client (`Socket<ServerToClient, ClientToServer>`) are generic over these maps,
 * so an event name or payload mismatch is a compile error on both sides.
 *
 * Identity is never taken from payloads: the server derives the user from the
 * handshake JWT.
 */

export interface Ack<T = undefined> {
  (response: { ok: true; data: T } | { ok: false; code: string; message: string }): void;
}

export interface PresenceEntry {
  user: UserSummary;
  role: ParticipantRole;
  /** Number of open tabs/devices for this user in the room. */
  connections: number;
}

export interface ClientToServerEvents {
  'session:join': (
    p: { sessionId: string },
    ack: Ack<{ presence: PresenceEntry[]; state: Uint8Array }>,
  ) => void;
  'session:leave': (p: { sessionId: string }) => void;
  'chat:send': (p: { sessionId: string; content: string }, ack: Ack<ChatMessageDto>) => void;
  'chat:typing': (p: { sessionId: string; isTyping: boolean }) => void;
  /** Yjs document update (binary, CRDT-merged on every peer). */
  'doc:update': (p: { sessionId: string; update: Uint8Array }) => void;
  /** Yjs awareness update: cursors, selections, names. Ephemeral, never persisted. */
  'doc:awareness': (p: { sessionId: string; update: Uint8Array }) => void;
}

export interface ServerToClientEvents {
  'session:presence': (p: { sessionId: string; presence: PresenceEntry[] }) => void;
  'session:status': (p: { sessionId: string; status: SessionStatus }) => void;
  'chat:message': (m: ChatMessageDto) => void;
  'chat:typing': (p: { sessionId: string; user: UserSummary; isTyping: boolean }) => void;
  'doc:update': (p: { sessionId: string; update: Uint8Array }) => void;
  'doc:awareness': (p: { sessionId: string; update: Uint8Array }) => void;
  'notification:new': (n: NotificationDto) => void;
  /** Sent before the server closes a connection whose token is no longer valid. */
  'auth:expired': () => void;
}

/** Name of the shared Y.Text inside each session document (server and Monaco binding). */
export const DOC_TEXT = 'code';

export const REALTIME_LIMITS = {
  /** Max chat messages per user per 10 s window. */
  chatPer10s: 10,
  /** Max Yjs update size accepted from a client. */
  maxDocUpdateBytes: 256 * 1024,
  /** Max shared document size (plain text) persisted per session. */
  maxDocChars: 200_000,
} as const;

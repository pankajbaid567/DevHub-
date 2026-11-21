import type { ChatMessageDto, CodeRunDto, ParticipantRole, SessionStatus } from './sessions.js';
import type { NotificationDto } from './notifications.js';
import type { UserSummary } from './common.js';
import type { InterviewStateDto, ProctoringEventDto, ProctoringEventInput, SubmissionDto } from './interview.js';

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

/** A participant in a session's video call. */
export interface RtcPeer {
  socketId: string;
  user: UserSummary;
  audio: boolean;
  video: boolean;
  screen: boolean;
}

/** Subset of RTCIceServer (kept DOM-free so the shared package also compiles for Node). */
export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface RtcSignal {
  sessionId: string;
  description?: { type: 'offer' | 'answer' | 'pranswer' | 'rollback'; sdp?: string };
  candidate?: {
    candidate?: string;
    sdpMid?: string | null;
    sdpMLineIndex?: number | null;
    usernameFragment?: string | null;
  };
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
  /** Join the session's video call; returns the peers already in it and ICE servers. */
  'rtc:join': (
    p: { sessionId: string; audio: boolean; video: boolean },
    ack: Ack<{ peers: RtcPeer[]; iceServers: IceServer[] }>,
  ) => void;
  'rtc:leave': (p: { sessionId: string }) => void;
  /** WebRTC offer/answer/ICE candidate for one specific peer (relayed, never broadcast). */
  'rtc:signal': (p: RtcSignal & { to: string }) => void;
  'rtc:state': (p: { sessionId: string; audio: boolean; video: boolean; screen: boolean }) => void;
  /** Proctoring: candidate reports a violation event (tab switch, fullscreen exit, etc.). */
  'proctoring:event': (p: { sessionId: string } & ProctoringEventInput, ack: Ack) => void;
}

export interface ServerToClientEvents {
  'session:presence': (p: { sessionId: string; presence: PresenceEntry[] }) => void;
  'session:status': (p: { sessionId: string; status: SessionStatus }) => void;
  'chat:message': (m: ChatMessageDto) => void;
  'chat:typing': (p: { sessionId: string; user: UserSummary; isTyping: boolean }) => void;
  'doc:update': (p: { sessionId: string; update: Uint8Array }) => void;
  'doc:awareness': (p: { sessionId: string; update: Uint8Array }) => void;
  'notification:new': (n: NotificationDto) => void;
  /** Someone pressed Run: everyone's output panel shows it is running. */
  'run:started': (p: { sessionId: string; user: UserSummary; language: string }) => void;
  'run:finished': (r: CodeRunDto) => void;
  'interview:updated': (s: InterviewStateDto) => void;
  'submission:finished': (s: SubmissionDto) => void;
  'rtc:peer-joined': (p: { sessionId: string; peer: RtcPeer }) => void;
  'rtc:peer-left': (p: { sessionId: string; socketId: string }) => void;
  'rtc:signal': (p: RtcSignal & { from: string }) => void;
  'rtc:state': (p: {
    sessionId: string;
    socketId: string;
    audio: boolean;
    video: boolean;
    screen: boolean;
  }) => void;
  /** Sent before the server closes a connection whose token is no longer valid. */
  'auth:expired': () => void;
  /** Proctoring: a violation event was recorded; interviewers see it in real time. */
  'proctoring:violation': (e: ProctoringEventDto) => void;
  /** Proctoring: server warns candidate about a violation. */
  'proctoring:warning': (p: { sessionId: string; message: string }) => void;
}

/** Name of the shared Y.Text inside each session document (server and Monaco binding). */
export const DOC_TEXT = 'code';
/** Name of the shared Y.Array of whiteboard strokes in each session document. */
export const DOC_BOARD = 'board';

export const REALTIME_LIMITS = {
  /** Max chat messages per user per 10 s window. */
  chatPer10s: 10,
  /** Max Yjs update size accepted from a client. */
  maxDocUpdateBytes: 256 * 1024,
  /** Max shared document size (plain text) persisted per session. */
  maxDocChars: 200_000,
  /** Max size of a session's whole CRDT document (code + whiteboard). */
  maxDocBytes: 4 * 1024 * 1024,
  /** Mesh WebRTC: every participant connects to every other, so keep calls small. */
  maxCallParticipants: 6,
  maxSignalBytes: 16 * 1024,
} as const;

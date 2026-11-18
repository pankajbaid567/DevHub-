import { useEffect, useState } from 'react';
import * as Y from 'yjs';
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness';
import type { PresenceEntry } from '@devhub/shared';
import { getSocket } from './socket';

const COLORS = [
  '#f97316',
  '#22c55e',
  '#3b82f6',
  '#a855f7',
  '#ec4899',
  '#14b8a6',
  '#eab308',
  '#ef4444',
];
export const colorFor = (id: string) =>
  COLORS[[...id].reduce((h, c) => (h * 33 + c.charCodeAt(0)) >>> 0, 5) % COLORS.length]!;

/** Transaction origin for updates that came from the network (never echoed back). */
export const REMOTE = 'remote';

export interface SessionDoc {
  doc: Y.Doc;
  awareness: Awareness;
}

interface Options {
  sessionId: string;
  me: { id: string; name: string };
  onPresence: (p: PresenceEntry[]) => void;
  onConnectionChange: (connected: boolean) => void;
}

/**
 * Socket.IO transport for one session's Yjs document. Every shared surface in the room (the
 * code editor's Y.Text, the whiteboard's Y.Array) lives in this single document, so they
 * share one connection, one sync path and one persistence pipeline on the server.
 *
 * CRDT merges are commutative and idempotent: on (re)connect the client just re-sends its
 * full state, which also uploads anything edited while offline.
 */
export function useSessionDoc({
  sessionId,
  me,
  onPresence,
  onConnectionChange,
}: Options): SessionDoc | null {
  const [state, setState] = useState<SessionDoc | null>(null);

  useEffect(() => {
    const socket = getSocket();
    const doc = new Y.Doc();
    const awareness = new Awareness(doc);
    awareness.setLocalStateField('user', { id: me.id, name: me.name, color: colorFor(me.id) });

    const join = async () => {
      const res = await socket.emitWithAck('session:join', { sessionId });
      if (!res.ok) return;
      Y.applyUpdate(doc, new Uint8Array(res.data.state), REMOTE);
      onPresence(res.data.presence);
      socket.emit('doc:update', { sessionId, update: Y.encodeStateAsUpdate(doc) });
      socket.emit('doc:awareness', {
        sessionId,
        update: encodeAwarenessUpdate(awareness, [doc.clientID]),
      });
    };

    const onDocUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin !== REMOTE) socket.emit('doc:update', { sessionId, update });
    };
    const onAwareness = (
      { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown,
    ) => {
      if (origin !== REMOTE) {
        socket.emit('doc:awareness', {
          sessionId,
          update: encodeAwarenessUpdate(awareness, [...added, ...updated, ...removed]),
        });
      }
    };
    doc.on('update', onDocUpdate);
    awareness.on('update', onAwareness);

    const remoteDoc = (p: { sessionId: string; update: Uint8Array }) => {
      if (p.sessionId === sessionId) Y.applyUpdate(doc, new Uint8Array(p.update), REMOTE);
    };
    const remoteAwareness = (p: { sessionId: string; update: Uint8Array }) => {
      if (p.sessionId === sessionId)
        applyAwarenessUpdate(awareness, new Uint8Array(p.update), REMOTE);
    };
    const presence = (p: { sessionId: string; presence: PresenceEntry[] }) => {
      if (p.sessionId === sessionId) onPresence(p.presence);
    };
    const connect = () => {
      onConnectionChange(true);
      void join();
    };
    const disconnect = () => onConnectionChange(false);

    socket.on('doc:update', remoteDoc);
    socket.on('doc:awareness', remoteAwareness);
    socket.on('session:presence', presence);
    socket.on('connect', connect);
    socket.on('disconnect', disconnect);
    if (socket.connected) connect();
    else socket.connect();
    // Publishing the doc to React is the point of this external-system effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ doc, awareness });

    return () => {
      removeAwarenessStates(awareness, [doc.clientID], 'local');
      socket.emit('session:leave', { sessionId });
      socket.off('doc:update', remoteDoc);
      socket.off('doc:awareness', remoteAwareness);
      socket.off('session:presence', presence);
      socket.off('connect', connect);
      socket.off('disconnect', disconnect);
      awareness.destroy();
      doc.destroy();
      setState(null);
    };
  }, [sessionId, me.id, me.name, onPresence, onConnectionChange]);

  return state;
}

import { useEffect, useRef, useState } from 'react';
import type * as Monaco from 'monaco-editor';
import * as Y from 'yjs';
import { MonacoBinding } from 'y-monaco';
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness';
import { DOC_TEXT, type PresenceEntry } from '@devhub/shared';
import { getSocket } from '../lib/socket';
import CodeEditor from './CodeEditor';

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
const colorFor = (id: string) =>
  COLORS[[...id].reduce((h, c) => (h * 33 + c.charCodeAt(0)) >>> 0, 5) % COLORS.length]!;
const REMOTE = 'remote';

interface Props {
  sessionId: string;
  language: string;
  readOnly: boolean;
  me: { id: string; name: string };
  onPresence: (p: PresenceEntry[]) => void;
  onConnectionChange: (connected: boolean) => void;
}

/**
 * Socket.IO transport for Yjs. The server holds the authoritative merged document; clients
 * send incremental CRDT updates and apply everyone else's. Because CRDT merges are
 * commutative and idempotent, reconnecting simply re-sends local state: no conflict handling.
 */
export default function CollabEditor({
  sessionId,
  language,
  readOnly,
  me,
  onPresence,
  onConnectionChange,
}: Props) {
  const [editor, setEditor] = useState<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const styleRef = useRef<HTMLStyleElement | null>(null);

  useEffect(() => {
    if (!editor) return;
    const socket = getSocket();
    const doc = new Y.Doc();
    const text = doc.getText(DOC_TEXT);
    const awareness = new Awareness(doc);
    awareness.setLocalStateField('user', { name: me.name, color: colorFor(me.id) });
    const binding = new MonacoBinding(text, editor.getModel()!, new Set([editor]), awareness);

    const join = async () => {
      const res = await socket.emitWithAck('session:join', { sessionId });
      if (!res.ok) return;
      Y.applyUpdate(doc, new Uint8Array(res.data.state), REMOTE);
      onPresence(res.data.presence);
      // Push anything typed while offline; duplicates are harmless for a CRDT.
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
      if (origin !== REMOTE)
        socket.emit('doc:awareness', {
          sessionId,
          update: encodeAwarenessUpdate(awareness, [...added, ...updated, ...removed]),
        });
      // Per-client cursor colours for y-monaco's selection classes.
      const rules: string[] = [];
      awareness.getStates().forEach((state, clientId) => {
        const u = state.user as { name: string; color: string } | undefined;
        if (!u || clientId === doc.clientID) return;
        rules.push(
          `.yRemoteSelection-${clientId}{background:${u.color}33}`,
          `.yRemoteSelectionHead-${clientId}{position:absolute;border-left:2px solid ${u.color};height:100%}`,
          `.yRemoteSelectionHead-${clientId}::after{content:"${u.name.replace(/["\\]/g, '')}";position:absolute;top:-1.3em;left:-2px;background:${u.color};color:#fff;font:600 10px/1.4 Inter,sans-serif;padding:0 4px;border-radius:3px;white-space:nowrap}`,
        );
      });
      styleRef.current ??= document.head.appendChild(document.createElement('style'));
      styleRef.current.textContent = rules.join('\n');
    };

    doc.on('update', onDocUpdate);
    awareness.on('update', onAwareness);
    const remoteDoc = (p: { sessionId: string; update: Uint8Array }) =>
      p.sessionId === sessionId && Y.applyUpdate(doc, new Uint8Array(p.update), REMOTE);
    const remoteAwareness = (p: { sessionId: string; update: Uint8Array }) =>
      p.sessionId === sessionId &&
      applyAwarenessUpdate(awareness, new Uint8Array(p.update), REMOTE);
    const presence = (p: { sessionId: string; presence: PresenceEntry[] }) =>
      p.sessionId === sessionId && onPresence(p.presence);
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

    return () => {
      removeAwarenessStates(awareness, [doc.clientID], 'local');
      socket.emit('session:leave', { sessionId });
      socket.off('doc:update', remoteDoc);
      socket.off('doc:awareness', remoteAwareness);
      socket.off('session:presence', presence);
      socket.off('connect', connect);
      socket.off('disconnect', disconnect);
      binding.destroy();
      awareness.destroy();
      doc.destroy();
      styleRef.current?.remove();
      styleRef.current = null;
    };
  }, [editor, sessionId, me.id, me.name, onPresence, onConnectionChange]);

  return (
    <CodeEditor
      height="100%"
      language={language}
      defaultValue=""
      options={{
        readOnly,
        readOnlyMessage: { value: 'This session is not live, or you are a viewer.' },
      }}
      onMount={(e) => setEditor(e)}
    />
  );
}

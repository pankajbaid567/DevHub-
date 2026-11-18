import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@devhub/shared';
import { refreshSession, session } from './api';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;

/**
 * One shared, typed connection per tab. `auth` is a callback, so every (re)connect sends
 * the current access token; on expiry the client refreshes and reconnects transparently.
 */
export function getSocket(): AppSocket {
  if (socket) return socket;
  socket = io(import.meta.env.VITE_API_URL || undefined, {
    path: '/socket.io',
    autoConnect: false,
    transports: ['websocket', 'polling'],
    auth: (cb) => cb({ token: session.accessToken }),
  });

  const reauth = async () => {
    const ok = await refreshSession();
    if (ok) socket?.connect();
  };
  socket.on('auth:expired', () => void reauth());
  socket.on('connect_error', (err) => {
    if (err.message === 'UNAUTHENTICATED' && session.accessToken) void reauth();
  });
  return socket;
}

export function connectSocket(): void {
  const s = getSocket();
  if (!s.connected) s.connect();
}

export function disconnectSocket(): void {
  socket?.disconnect();
}

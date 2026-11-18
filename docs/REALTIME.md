# Real-time protocol (Socket.IO)

The connection lives at `/socket.io`. The event map is typed in `packages/shared/src/realtime.ts` and used by both server and client.

## Authentication

```js
io(url, { auth: (cb) => cb({ token: accessToken }) })
```

- The handshake is rejected with `UNAUTHENTICATED` if the token is missing or invalid.
- The server derives the user from the token. Payloads never carry a trusted identity.
- When the access token expires, the next event triggers `auth:expired`, and the client refreshes and reconnects.

Every socket automatically joins `user:<id>`, which is used for notifications.

## Client → server

| Event | Payload | Ack | Notes |
|---|---|---|---|
| `session:join` | `{ sessionId }` | `{ presence, state }` | Must be a participant (join over REST first). `state` is the full Yjs update. |
| `session:leave` | `{ sessionId }` | — | |
| `doc:update` | `{ sessionId, update: Uint8Array }` | — | Yjs delta, at most 256 KB; ignored for viewers or sessions that aren't live |
| `doc:awareness` | `{ sessionId, update }` | — | Cursors and names; relayed, never stored |
| `chat:send` | `{ sessionId, content }` | `ChatMessageDto` | 1–2000 characters, at most 10 messages per 10 s per socket |
| `chat:typing` | `{ sessionId, isTyping }` | — | |

Acks are `{ ok: true, data }` or `{ ok: false, code, message }`.

## Server → client

| Event | Payload |
|---|---|
| `session:presence` | `{ sessionId, presence: [{ user, role, connections }] }` (cluster-wide) |
| `session:status` | `{ sessionId, status }`, emitted when the host starts or ends the session |
| `doc:update`, `doc:awareness` | From other participants |
| `chat:message`, `chat:typing` | |
| `notification:new` | `NotificationDto` |
| `auth:expired` | Refresh the token and reconnect |

## Multi-instance behaviour

With `REDIS_URL` set:

- rooms and broadcasts span instances (Redis adapter), and presence uses `fetchSockets()` across the cluster;
- document updates are relayed between instances with `serverSideEmit`;
- saves CRDT-merge under a row lock, so instances converge and never overwrite each other.

See [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md#horizontal-scaling).

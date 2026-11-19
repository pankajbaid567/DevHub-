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

| `rtc:join` | `{ sessionId, audio, video }` | `{ peers, iceServers }` | Session must be live; at most 6 per call |
| `rtc:signal` | `{ sessionId, to, description? \| candidate? }` | — | Relayed only to `to`, and only if both are in the same call; ≤ 16 KB |
| `rtc:state` | `{ sessionId, audio, video, screen }` | — | Mute, camera and screen-share state |
| `rtc:leave` | `{ sessionId }` | — | |

Acks are `{ ok: true, data }` or `{ ok: false, code, message }`.

## Server → client

| Event | Payload |
|---|---|
| `session:presence` | `{ sessionId, presence: [{ user, role, connections }] }` (cluster-wide) |
| `session:status` | `{ sessionId, status }`, emitted when the host starts or ends the session |
| `doc:update`, `doc:awareness` | From other participants |
| `chat:message`, `chat:typing` | |
| `notification:new` | `NotificationDto` |
| `run:started` | `{ sessionId, user, language }`: someone pressed Run (triggered by `POST /sessions/:id/runs`) |
| `run:finished` | `CodeRunDto` (status, stdout, stderr, exit code, duration), shown to everyone in the room |
| `interview:updated` | `InterviewStateDto`: the revealed problem, `startedAt`, `endsAt`, `endedAt` and `serverNow` (clients correct for clock skew). Never contains notes or scores |
| `auth:expired` | Refresh the token and reconnect |
| `rtc:peer-joined`, `rtc:peer-left` | Call membership changes |
| `rtc:signal` | `{ sessionId, from, description? \| candidate? }` from a call member |
| `rtc:state` | `{ sessionId, socketId, audio, video, screen }` |

## Shared document

Each session has one Yjs document containing:

- `Y.Text('code')`, the editor;
- `Y.Array('board')`, the whiteboard. Each stroke is a `Y.Map` with a `Y.Array` of points, so strokes render live while they're being drawn.

The server caps the whole document at 4 MB and the text at 200k characters.

## Video calls

Media flows peer to peer (full mesh); the server only relays signalling.

- Clients use **perfect negotiation**: the polite peer is chosen by socket id, so simultaneous offers resolve without glare.
- Signals that arrive before `rtc:peer-joined` are buffered.
- After a socket reconnect, the client rejoins the call automatically.
- ICE servers come from `STUN_URLS` and the optional `TURN_URL`, `TURN_USERNAME` and `TURN_CREDENTIAL`, and are only sent to authenticated call participants.
- Beyond about 6 participants, mesh bandwidth grows quadratically, so the scaling path is an SFU (LiveKit or mediasoup) behind the same signalling contract.

## Multi-instance behaviour

With `REDIS_URL` set:

- rooms and broadcasts span instances (Redis adapter), and presence uses `fetchSockets()` across the cluster;
- document updates are relayed between instances with `serverSideEmit`;
- saves CRDT-merge under a row lock, so instances converge and never overwrite each other.

See [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md#horizontal-scaling).

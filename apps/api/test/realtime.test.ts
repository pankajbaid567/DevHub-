import http from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { io as connect, type Socket } from 'socket.io-client';
import * as Y from 'yjs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ClientToServerEvents, ServerToClientEvents } from '@devhub/shared';
import { attachRealtime } from '../src/realtime/socket.js';
import { createApp } from '../src/app.js';
import { auth, createTestApp, registerUser, resetDb, type TestUser } from './helpers.js';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

const { c } = createTestApp();
const lazy: { rt?: ReturnType<typeof attachRealtime> } = {};
const { app } = createApp(c, {
  disableRateLimits: true,
  broadcaster: {
    status: (i, s) => lazy.rt?.broadcaster.status(i, s),
    message: (m) => lazy.rt?.broadcaster.message(m),
  },
});
const server = http.createServer(app);
const rt = attachRealtime(server, c);
lazy.rt = rt;
let url = '';
const clients: Client[] = [];

beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
beforeEach(() => resetDb(c));
afterAll(async () => {
  clients.forEach((s) => s.disconnect());
  await rt.close();
  await c.db.$disconnect();
});

function client(token?: string): Promise<Client> {
  return new Promise((resolve, reject) => {
    const s: Client = connect(url, {
      auth: token ? { token } : {},
      transports: ['websocket'],
      reconnection: false,
    });
    clients.push(s);
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}

const once = <E extends keyof ServerToClientEvents>(s: Client, event: E) =>
  new Promise<Parameters<ServerToClientEvents[E]>[0]>((resolve) =>
    s.once(event, ((p: never) => resolve(p)) as never),
  );

async function liveSession(host: TestUser, guest: TestUser) {
  const s = await request(app)
    .post('/api/v1/sessions')
    .set(auth(host))
    .send({ title: 'Realtime test session' })
    .expect(201);
  await request(app)
    .post(`/api/v1/sessions/${s.body.id}/join`)
    .set(auth(guest))
    .send({})
    .expect(200);
  return s.body.id as string;
}

describe('socket authentication', () => {
  it('rejects connections without a valid token', async () => {
    await expect(client()).rejects.toThrow(/UNAUTHENTICATED/);
    await expect(client('garbage')).rejects.toThrow(/UNAUTHENTICATED/);
  });

  it('refuses to join a session the user has not joined over REST', async () => {
    const host = await registerUser(app);
    const outsider = await registerUser(app);
    const s = await request(app)
      .post('/api/v1/sessions')
      .set(auth(host))
      .send({ title: 'Members only' })
      .expect(201);
    const sock = await client(outsider.token);
    const res = await sock.emitWithAck('session:join', { sessionId: s.body.id });
    expect(res).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
});

describe('collaboration', () => {
  it('syncs a shared Yjs document between participants and persists it', async () => {
    const host = await registerUser(app);
    const guest = await registerUser(app);
    const sessionId = await liveSession(host, guest);
    const [a, b] = await Promise.all([client(host.token), client(guest.token)]);

    const ja = await a.emitWithAck('session:join', { sessionId });
    const jb = await b.emitWithAck('session:join', { sessionId });
    expect(ja.ok && jb.ok).toBe(true);

    const docA = new Y.Doc();
    const docB = new Y.Doc();
    if (jb.ok) Y.applyUpdate(docB, new Uint8Array(jb.data.state));
    docA.on('update', (update: Uint8Array) => a.emit('doc:update', { sessionId, update }));
    b.on('doc:update', ({ update }) => Y.applyUpdate(docB, new Uint8Array(update)));

    const received = once(b, 'doc:update');
    docA.getText('code').insert(0, 'const answer = 42;');
    await received;
    expect(docB.getText('code').toString()).toBe('const answer = 42;');

    a.emit('session:leave', { sessionId });
    b.emit('session:leave', { sessionId });
    await new Promise((r) => setTimeout(r, 300));
    const saved = await c.db.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(saved.code).toBe('const answer = 42;');
    expect(saved.docState).not.toBeNull();
  });

  it('broadcasts chat with the server-side identity, never a client-supplied one', async () => {
    const host = await registerUser(app);
    const guest = await registerUser(app);
    const sessionId = await liveSession(host, guest);
    const [a, b] = await Promise.all([client(host.token), client(guest.token)]);
    await a.emitWithAck('session:join', { sessionId });
    await b.emitWithAck('session:join', { sessionId });

    const incoming = once(b, 'chat:message');
    // An attacker-style payload with a spoofed userId is ignored: identity comes from the JWT.
    const ack = await a.emitWithAck('chat:send', {
      sessionId,
      content: 'hi there',
      userId: guest.id,
    } as never);
    expect(ack.ok).toBe(true);
    const msg = await incoming;
    expect(msg.author.id).toBe(host.id);
    expect(msg.content).toBe('hi there');
  });

  it('reports presence for everyone in the room', async () => {
    const host = await registerUser(app);
    const guest = await registerUser(app);
    const sessionId = await liveSession(host, guest);
    const a = await client(host.token);
    await a.emitWithAck('session:join', { sessionId });
    const b = await client(guest.token);
    const presence = once(a, 'session:presence');
    await b.emitWithAck('session:join', { sessionId });
    const p = await presence;
    expect(p.presence.map((e) => e.role)).toEqual(['HOST', 'EDITOR']);
  });

  it('pushes session status changes to the room', async () => {
    const host = await registerUser(app);
    const guest = await registerUser(app);
    const sessionId = await liveSession(host, guest);
    const b = await client(guest.token);
    await b.emitWithAck('session:join', { sessionId });
    const status = once(b, 'session:status');
    await request(app).post(`/api/v1/sessions/${sessionId}/end`).set(auth(host)).expect(200);
    expect((await status).status).toBe('ENDED');
  });
});

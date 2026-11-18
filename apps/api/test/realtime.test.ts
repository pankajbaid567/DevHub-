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

/** Fake sandbox: echoes, can be slowed down or made to fail. */
const runner = {
  enabled: true,
  delayMs: 0,
  fail: false,
  async run(input: { code: string; language: string }) {
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    if (this.fail) throw new Error('Runner unreachable');
    return {
      status: 'ok' as const,
      stdout: `ran ${input.language}: ${input.code}\n`,
      stderr: '',
      exitCode: 0,
      durationMs: 12,
    };
  },
};
const { c } = createTestApp({ codeRunner: runner });
const lazy: { rt?: ReturnType<typeof attachRealtime> } = {};
const { app } = createApp(c, {
  disableRateLimits: true,
  broadcaster: {
    status: (i, s) => lazy.rt?.broadcaster.status(i, s),
    message: (m) => lazy.rt?.broadcaster.message(m),
    runStarted: (i, u, l) => lazy.rt?.broadcaster.runStarted(i, u, l),
    runFinished: (r) => lazy.rt?.broadcaster.runFinished(r),
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

describe('document persistence', () => {
  it('merges concurrent saves under a row lock instead of overwriting', async () => {
    const host = await registerUser(app);
    const s = await request(app)
      .post('/api/v1/sessions')
      .set(auth(host))
      .send({ title: 'Merge test' })
      .expect(201);
    const edit = (text: string) => {
      const d = new Y.Doc();
      d.getText('code').insert(0, text);
      return Y.encodeStateAsUpdate(d);
    };
    await Promise.all([
      c.sessions.mergeDocument(s.body.id, edit('alpha ')),
      c.sessions.mergeDocument(s.body.id, edit('beta ')),
      c.sessions.mergeDocument(s.body.id, edit('gamma')),
    ]);
    const saved = await c.db.session.findUniqueOrThrow({ where: { id: s.body.id } });
    for (const word of ['alpha', 'beta', 'gamma']) expect(saved.code).toContain(word);
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

describe('WebRTC signalling', () => {
  it('lets participants join a call and relays signals only between call members', async () => {
    const host = await registerUser(app);
    const guest = await registerUser(app);
    const outsider = await registerUser(app);
    const sessionId = await liveSession(host, guest);
    // The outsider is a member of a *different* session.
    const other = await request(app)
      .post('/api/v1/sessions')
      .set(auth(outsider))
      .send({ title: 'Somewhere else' })
      .expect(201);

    const [a, b, x] = await Promise.all([
      client(host.token),
      client(guest.token),
      client(outsider.token),
    ]);
    await a.emitWithAck('session:join', { sessionId });
    await b.emitWithAck('session:join', { sessionId });
    await x.emitWithAck('session:join', { sessionId: other.body.id });

    const joinA = await a.emitWithAck('rtc:join', { sessionId, audio: true, video: true });
    expect(joinA.ok && joinA.data.peers).toEqual([]);
    expect(joinA.ok && joinA.data.iceServers[0]!.urls.length).toBeGreaterThan(0);

    const peerJoined = once(a, 'rtc:peer-joined');
    const joinB = await b.emitWithAck('rtc:join', { sessionId, audio: true, video: false });
    expect(joinB.ok && joinB.data.peers.map((p) => p.socketId)).toEqual([a.id]);
    expect((await peerJoined).peer).toMatchObject({ socketId: b.id, audio: true, video: false });

    // The outsider cannot join this call, and their signals are dropped.
    const denied = await x.emitWithAck('rtc:join', { sessionId, audio: true, video: true });
    expect(denied).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    let leaked = false;
    a.on('rtc:signal', (p) => {
      if (p.description?.sdp === 'evil') leaked = true;
    });
    x.emit('rtc:signal', { sessionId, to: a.id!, description: { type: 'offer', sdp: 'evil' } });

    // A legitimate offer reaches exactly the addressed peer, stamped with the sender.
    const offer = once(b, 'rtc:signal');
    a.emit('rtc:signal', { sessionId, to: b.id!, description: { type: 'offer', sdp: 'v=0 test' } });
    expect(await offer).toMatchObject({
      sessionId,
      from: a.id,
      description: { type: 'offer', sdp: 'v=0 test' },
    });

    const state = once(a, 'rtc:state');
    b.emit('rtc:state', { sessionId, audio: false, video: false, screen: true });
    expect(await state).toMatchObject({ socketId: b.id, audio: false, screen: true });

    const left = once(a, 'rtc:peer-left');
    const bId = b.id;
    b.disconnect();
    expect((await left).socketId).toBe(bId);
    await new Promise((r) => setTimeout(r, 100));
    expect(leaked).toBe(false);
  });

  it('refuses calls in sessions that are not live', async () => {
    const host = await registerUser(app);
    const guest = await registerUser(app);
    const sessionId = await liveSession(host, guest);
    await request(app).post(`/api/v1/sessions/${sessionId}/end`).set(auth(host)).expect(200);
    const a = await client(host.token);
    await a.emitWithAck('session:join', { sessionId });
    const res = await a.emitWithAck('rtc:join', { sessionId, audio: true, video: true });
    expect(res).toMatchObject({ ok: false, code: 'SESSION_NOT_LIVE' });
  });
});

describe('code execution', () => {
  beforeEach(() => {
    runner.delayMs = 0;
    runner.fail = false;
  });

  it('runs code and pushes start and result to everyone in the room', async () => {
    const host = await registerUser(app);
    const guest = await registerUser(app);
    const id = await liveSession(host, guest);
    const watcher = await client(guest.token);
    await watcher.emitWithAck('session:join', { sessionId: id });
    const started = once(watcher, 'run:started');
    const finished = once(watcher, 'run:finished');

    const res = await request(app)
      .post(`/api/v1/sessions/${id}/runs`)
      .set(auth(host))
      .send({ language: 'python', code: 'print(1)' })
      .expect(201);
    expect(res.body).toMatchObject({ status: 'ok', stdout: 'ran python: print(1)\n' });
    expect(await started).toMatchObject({
      sessionId: id,
      language: 'python',
      user: { id: host.id },
    });
    expect(await finished).toMatchObject({ id: res.body.id, user: { id: host.id } });

    const history = await request(app)
      .get(`/api/v1/sessions/${id}/runs`)
      .set(auth(guest))
      .expect(200);
    expect(history.body).toMatchObject({ enabled: true, items: [{ id: res.body.id }] });
  });

  it('allows one run per session at a time (distributed lock)', async () => {
    const host = await registerUser(app);
    const guest = await registerUser(app);
    const id = await liveSession(host, guest);
    runner.delayMs = 300;
    const [a, b] = await Promise.all([
      request(app)
        .post(`/api/v1/sessions/${id}/runs`)
        .set(auth(host))
        .send({ language: 'javascript', code: '1' }),
      request(app)
        .post(`/api/v1/sessions/${id}/runs`)
        .set(auth(guest))
        .send({ language: 'javascript', code: '2' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
  });

  it('records runner outages as failed runs instead of erroring', async () => {
    const host = await registerUser(app);
    const guest = await registerUser(app);
    const id = await liveSession(host, guest);
    runner.fail = true;
    const res = await request(app)
      .post(`/api/v1/sessions/${id}/runs`)
      .set(auth(host))
      .send({ language: 'javascript', code: 'x' })
      .expect(201);
    expect(res.body).toMatchObject({ status: 'failed', stderr: 'Runner unreachable' });
  });

  it('refuses outsiders, unsupported languages and ended sessions', async () => {
    const host = await registerUser(app);
    const guest = await registerUser(app);
    const outsider = await registerUser(app);
    const id = await liveSession(host, guest);
    await request(app)
      .post(`/api/v1/sessions/${id}/runs`)
      .set(auth(outsider))
      .send({ language: 'python', code: '' })
      .expect(403);
    await request(app)
      .post(`/api/v1/sessions/${id}/runs`)
      .set(auth(host))
      .send({ language: 'cobol', code: '' })
      .expect(400);
    await request(app).post(`/api/v1/sessions/${id}/end`).set(auth(host)).expect(200);
    await request(app)
      .post(`/api/v1/sessions/${id}/runs`)
      .set(auth(guest))
      .send({ language: 'python', code: '' })
      .expect(409);
  });
});

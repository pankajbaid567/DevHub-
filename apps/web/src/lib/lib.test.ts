import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { safeNext } from './navigation';
import { passwordStrength } from './password';
import { compact, plural, timeAgo } from './utils';
import { api, ApiError, refreshSession, session } from './api';

describe('safeNext (open-redirect protection)', () => {
  it('allows same-site paths', () => {
    expect(safeNext('/questions/abc?x=1')).toBe('/questions/abc?x=1');
  });
  it.each(['https://evil.com', '//evil.com', '/\\evil.com', 'javascript:alert(1)', null, ''])(
    'rejects %s',
    (v) => {
      expect(safeNext(v)).toBe('/dashboard');
    },
  );
});

describe('passwordStrength', () => {
  it('rewards length and variety', () => {
    expect(passwordStrength('short').score).toBe(0);
    expect(passwordStrength('password1').score).toBe(1);
    expect(passwordStrength('Correct-Horse-Battery-9').score).toBe(4);
  });
});

describe('formatting', () => {
  it('formats relative times and compact numbers', () => {
    const now = Date.parse('2026-01-10T12:00:00Z');
    expect(timeAgo('2026-01-10T11:59:50Z', now)).toBe('just now');
    expect(timeAgo('2026-01-10T09:00:00Z', now)).toBe('3 hours ago');
    expect(timeAgo('2026-01-12T12:00:00Z', now)).toBe('in 2 days');
    expect(compact(1234)).toBe('1.2K');
    expect(plural(1, 'answer')).toBe('1 answer');
    expect(plural(3, 'answer')).toBe('3 answers');
  });
});

describe('api client', () => {
  const user = {
    id: 'u1',
    username: 'ada',
    email: 'a@b.c',
    displayName: null,
    bio: null,
    avatarUrl: null,
    reputation: 0,
    role: 'USER',
    createdAt: '',
  };
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  beforeEach(() => session.set({ user: user as never, accessToken: 'expired', expiresIn: 900 }));
  afterEach(() => vi.unstubAllGlobals());

  it('refreshes once and retries when ten requests hit an expired token at the same time', async () => {
    let refreshCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        if (url.endsWith('/auth/refresh')) {
          refreshCalls++;
          await new Promise((r) => setTimeout(r, 20));
          return json(200, { user, accessToken: 'fresh', expiresIn: 900 });
        }
        const auth = (init.headers as Record<string, string>).Authorization;
        return auth === 'Bearer fresh'
          ? json(200, { ok: true })
          : json(401, { error: { code: 'TOKEN_EXPIRED', message: 'expired' } });
      }),
    );
    const results = await Promise.all(
      Array.from({ length: 10 }, () => api<{ ok: boolean }>('/questions')),
    );
    expect(results.every((r) => r.ok)).toBe(true);
    expect(refreshCalls).toBe(1);
    expect(session.accessToken).toBe('fresh');
  });

  it('surfaces the API error code and field details', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json(400, {
          error: { code: 'VALIDATION_FAILED', message: 'bad', details: { title: ['too short'] } },
        }),
      ),
    );
    const err = await api('/questions', { method: 'POST', body: {} }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
      details: { title: ['too short'] },
    });
  });

  it('signs the user out locally when the refresh fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(401, { error: { code: 'UNAUTHENTICATED', message: 'no' } })),
    );
    expect(await refreshSession()).toBeNull();
    expect(session.currentUser).toBeNull();
  });
});

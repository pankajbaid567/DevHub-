import type { ApiErrorBody, AuthResponse, CurrentUser } from '@devhub/shared';

export const API_BASE = `${import.meta.env.VITE_API_URL ?? ''}/api/v1`;

/** Error thrown for any non-2xx response, carrying the API's stable error code. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, string[]>,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const SESSION_HINT = 'devhub.has-session';

/** True if this browser may hold a refresh cookie (or storage is unavailable). */
export function mayHaveSession(): boolean {
  try {
    return localStorage.getItem(SESSION_HINT) === '1';
  } catch {
    return true;
  }
}

type Listener = (state: { token: string | null; user: CurrentUser | null }) => void;

/**
 * The access token lives only in memory (never localStorage), so an XSS payload cannot
 * read a long-lived credential. The refresh token is an httpOnly cookie the browser sends
 * automatically to /api/v1/auth only.
 */
class Session {
  private token: string | null = null;
  private user: CurrentUser | null = null;
  private listeners = new Set<Listener>();

  get accessToken() {
    return this.token;
  }

  get currentUser() {
    return this.user;
  }

  set(auth: AuthResponse | null): void {
    this.token = auth?.accessToken ?? null;
    this.user = auth?.user ?? null;
    try {
      // A non-secret hint so anonymous visitors skip the (always-401) refresh call on load.
      if (auth) localStorage.setItem(SESSION_HINT, '1');
      else localStorage.removeItem(SESSION_HINT);
    } catch {
      /* storage unavailable: we just always try to refresh */
    }
    this.emit();
  }

  updateUser(user: CurrentUser): void {
    this.user = user;
    this.emit();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn({ token: this.token, user: this.user });
  }
}

export const session = new Session();

let refreshing: Promise<AuthResponse | null> | null = null;

/**
 * Single-flight refresh: if ten requests hit an expired token at once, exactly one refresh
 * call is made and the other nine wait for it (the server rotates refresh tokens, so
 * parallel refreshes would trip its reuse detection).
 */
export function refreshSession(): Promise<AuthResponse | null> {
  refreshing ??= fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-Requested-With': 'devhub' },
  })
    .then(async (res) => (res.ok ? ((await res.json()) as AuthResponse) : null))
    .catch(() => null)
    .then((auth) => {
      session.set(auth);
      return auth;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

type Query = Record<string, string | number | boolean | undefined | null>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
  /** Send FormData as-is (multipart upload). */
  form?: FormData;
}

function buildUrl(path: string, query?: Query): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const qs = params.toString();
  return `${API_BASE}${path}${qs ? `?${qs}` : ''}`;
}

async function toApiError(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
  return new ApiError(
    res.status,
    body?.error.code ?? 'INTERNAL',
    body?.error.message ?? `Request failed (${res.status})`,
    body?.error.details,
    body?.error.requestId,
  );
}

/** Low-level fetch with auth header, cookie credentials and one transparent token refresh. */
export async function rawRequest(
  path: string,
  opts: RequestOptions = {},
  retried = false,
): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (session.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(buildUrl(path, opts.query), {
    method: opts.method ?? 'GET',
    headers,
    credentials: 'include',
    signal: opts.signal ?? null,
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : null),
  });

  if (res.status === 401 && !retried && session.accessToken) {
    const refreshed = await refreshSession();
    if (refreshed) return rawRequest(path, opts, true);
  }
  if (!res.ok) throw await toApiError(res);
  return res;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await rawRequest(path, opts);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Field errors from a VALIDATION_FAILED/CONFLICT response, for react-hook-form. */
export function fieldErrors(err: unknown): Record<string, string> {
  if (!(err instanceof ApiError) || !err.details) return {};
  return Object.fromEntries(Object.entries(err.details).map(([k, v]) => [k, v[0] ?? 'Invalid']));
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof TypeError) return 'Network error: is the API running?';
  return 'Something went wrong';
}

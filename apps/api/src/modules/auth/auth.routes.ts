import type { CookieOptions, Request, RequestHandler, Response } from 'express';
import { loginSchema, registerSchema, type AuthResponse } from '@devhub/shared';
import type { Container } from '../../container.js';
import { defineRoute, type RouteContext } from '../../core/route.js';
import { UnauthenticatedError } from '../../core/errors.js';
import { currentUser } from '../../middleware/auth.js';
import type { IssuedTokens } from './token.service.js';

export const REFRESH_COOKIE = 'dh_rt';
const COOKIE_PATH = '/api/v1/auth';

const client = (req: Request) => ({ userAgent: req.get('user-agent'), ip: req.ip });

/**
 * The refresh token travels only in an httpOnly, SameSite=Strict cookie scoped to the auth
 * routes: JavaScript can never read it (XSS-resistant) and other sites cannot send it (CSRF).
 * As defence in depth, refresh/logout also require a custom header, which a cross-site form
 * cannot set without a CORS preflight.
 */
function cookieOptions(c: Container, expires?: Date): CookieOptions {
  return {
    httpOnly: true,
    secure: c.env.cookieSecure,
    sameSite: 'strict',
    path: COOKIE_PATH,
    ...(expires && { expires }),
  };
}

function requireCsrfHeader(req: Request): void {
  if (req.get('x-requested-with') !== 'devhub')
    throw new UnauthenticatedError('Missing X-Requested-With header');
}

export function authRoutes(ctx: RouteContext, c: Container, authLimiter: RequestHandler): void {
  const respond = (
    res: Response,
    status: number,
    user: AuthResponse['user'],
    tokens: IssuedTokens,
  ) => {
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, cookieOptions(c, tokens.refreshExpiresAt));
    const body: AuthResponse = {
      user,
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
    };
    res.status(status).json(body);
  };

  defineRoute(ctx, {
    method: 'post',
    path: '/register',
    tag: 'Auth',
    summary: 'Create an account and sign in',
    body: registerSchema,
    middleware: [authLimiter],
    responses: {
      201: 'Account created; returns the user and an access token',
      409: 'Username or email taken',
    },
    handler: async (req, res) => {
      const { user, tokens } = await c.auth.register(req.body, client(req));
      respond(res, 201, user, tokens);
    },
  });

  defineRoute(ctx, {
    method: 'post',
    path: '/login',
    tag: 'Auth',
    summary: 'Sign in with email and password',
    body: loginSchema,
    middleware: [authLimiter],
    responses: { 200: 'Signed in', 401: 'Invalid email or password' },
    handler: async (req, res) => {
      const { user, tokens } = await c.auth.login(req.body, client(req));
      respond(res, 200, user, tokens);
    },
  });

  defineRoute(ctx, {
    method: 'post',
    path: '/refresh',
    tag: 'Auth',
    summary: 'Rotate the refresh cookie and get a new access token',
    responses: { 200: 'New access token', 401: 'Missing, expired or reused refresh token' },
    handler: async (req, res) => {
      requireCsrfHeader(req);
      const presented = req.cookies?.[REFRESH_COOKIE] as string | undefined;
      if (!presented) throw new UnauthenticatedError('No refresh token');
      try {
        const { user, tokens } = await c.auth.refresh(presented, client(req));
        respond(res, 200, user, tokens);
      } catch (err) {
        res.clearCookie(REFRESH_COOKIE, cookieOptions(c));
        throw err;
      }
    },
  });

  defineRoute(ctx, {
    method: 'post',
    path: '/logout',
    tag: 'Auth',
    summary: 'Revoke the refresh token family and clear the cookie',
    responses: { 204: 'Signed out' },
    handler: async (req, res) => {
      requireCsrfHeader(req);
      const presented = req.cookies?.[REFRESH_COOKIE] as string | undefined;
      if (presented) await c.tokens.revoke(presented);
      res.clearCookie(REFRESH_COOKIE, cookieOptions(c));
      res.status(204).end();
    },
  });

  defineRoute(ctx, {
    method: 'get',
    path: '/me',
    tag: 'Auth',
    summary: 'The signed-in user',
    auth: 'required',
    handler: async (req, res) => {
      res.json(await c.auth.me(currentUser(req).id));
    },
  });
}

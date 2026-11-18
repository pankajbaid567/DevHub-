import type { CookieOptions, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import {
  OAUTH_PROVIDERS,
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  mfaVerifySchema,
  twoFactorCodeSchema,
  type AuthResponse,
  type MfaChallengeResponse,
  type OAuthProvider,
} from '@devhub/shared';
import type { Container } from '../../container.js';
import { defineRoute, type RouteContext } from '../../core/route.js';
import { UnauthenticatedError } from '../../core/errors.js';
import { currentUser } from '../../middleware/auth.js';
import type { IssuedTokens } from './token.service.js';
import type { OAuthState } from './oauth.service.js';

export const REFRESH_COOKIE = 'dh_rt';
const COOKIE_PATH = '/api/v1/auth';
const OAUTH_COOKIE = 'dh_oauth';
const OAUTH_COOKIE_PATH = '/api/v1/auth/oauth';
const providerParams = z.object({ provider: z.enum(OAUTH_PROVIDERS) });

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
    responses: {
      200: 'Signed in, or { mfaRequired, mfaToken } for 2FA accounts',
      401: 'Invalid email or password',
    },
    handler: async (req, res) => {
      const result = await c.auth.login(req.body, client(req));
      if (result.mfa) {
        res.json({ mfaRequired: true, ...result.mfa } satisfies MfaChallengeResponse);
        return;
      }
      respond(res, 200, result.user, result.tokens);
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

  // ---------------------------------------------------------------- email & password flows

  defineRoute(ctx, {
    method: 'post',
    path: '/verify-email',
    tag: 'Auth',
    summary: 'Confirm an email address with the token from the verification email',
    body: verifyEmailSchema,
    middleware: [authLimiter],
    responses: { 200: 'Verified; returns the updated user', 400: 'Invalid or expired link' },
    handler: async (req, res) => {
      res.json(await c.auth.verifyEmail(req.body.token));
    },
  });

  defineRoute(ctx, {
    method: 'post',
    path: '/resend-verification',
    tag: 'Auth',
    summary: 'Send a new verification email',
    auth: 'required',
    middleware: [authLimiter],
    responses: { 202: 'Queued', 409: 'Already verified' },
    handler: async (req, res) => {
      await c.auth.resendVerification(currentUser(req).id);
      res.status(202).json({ queued: true });
    },
  });

  defineRoute(ctx, {
    method: 'post',
    path: '/forgot-password',
    tag: 'Auth',
    summary: 'Email a password-reset link (same response whether or not the account exists)',
    body: forgotPasswordSchema,
    middleware: [authLimiter],
    responses: { 202: 'If the account exists, an email is on its way' },
    handler: async (req, res) => {
      await c.auth.requestPasswordReset(req.body.email);
      res.status(202).json({ queued: true });
    },
  });

  defineRoute(ctx, {
    method: 'post',
    path: '/reset-password',
    tag: 'Auth',
    summary: 'Set a new password with a reset token; signs out every device',
    body: resetPasswordSchema,
    middleware: [authLimiter],
    responses: { 204: 'Password changed', 400: 'Invalid or expired link' },
    handler: async (req, res) => {
      await c.auth.resetPassword(req.body);
      res.status(204).end();
    },
  });

  defineRoute(ctx, {
    method: 'post',
    path: '/change-password',
    tag: 'Auth',
    summary:
      'Change (or, for GitHub/Google accounts, set) the password; other devices are signed out',
    auth: 'required',
    body: changePasswordSchema,
    middleware: [authLimiter],
    responses: { 200: 'Changed; returns fresh tokens for this device', 400: 'Wrong password' },
    handler: async (req, res) => {
      const { user, tokens } = await c.auth.changePassword(
        currentUser(req).id,
        req.body,
        client(req),
      );
      respond(res, 200, user, tokens);
    },
  });

  // ---------------------------------------------------------------- two-factor authentication

  defineRoute(ctx, {
    method: 'post',
    path: '/2fa/verify',
    tag: 'Auth',
    summary: 'Second login step: exchange the MFA challenge and a code for a session',
    body: mfaVerifySchema,
    middleware: [authLimiter],
    responses: {
      200: 'Signed in',
      400: 'Wrong code',
      401: 'Challenge expired',
      429: 'Locked after 5 wrong codes',
    },
    handler: async (req, res) => {
      const { user, tokens } = await c.auth.completeMfa(
        req.body.mfaToken,
        req.body.code,
        client(req),
      );
      respond(res, 200, user, tokens);
    },
  });

  defineRoute(ctx, {
    method: 'get',
    path: '/2fa',
    tag: 'Auth',
    summary: 'Two-factor status and remaining recovery codes',
    auth: 'required',
    handler: async (req, res) => {
      const me = await c.auth.me(currentUser(req).id);
      res.json({
        enabled: me.twoFactorEnabled,
        recoveryCodesLeft: me.twoFactorEnabled
          ? await c.twoFactor.remainingRecoveryCodes(me.id)
          : 0,
      });
    },
  });

  defineRoute(ctx, {
    method: 'post',
    path: '/2fa/setup',
    tag: 'Auth',
    summary: 'Start enrolment: returns the secret and an otpauth:// URI for the QR code',
    auth: 'required',
    responses: { 200: 'Secret generated (not active until confirmed)', 409: 'Already on' },
    handler: async (req, res) => {
      res.json(await c.twoFactor.setup(currentUser(req).id));
    },
  });

  defineRoute(ctx, {
    method: 'post',
    path: '/2fa/enable',
    tag: 'Auth',
    summary: 'Confirm enrolment with a code; returns 10 single-use recovery codes (shown once)',
    auth: 'required',
    body: twoFactorCodeSchema,
    middleware: [authLimiter],
    handler: async (req, res) => {
      res.json(await c.twoFactor.enable(currentUser(req).id, req.body.code));
    },
  });

  defineRoute(ctx, {
    method: 'post',
    path: '/2fa/disable',
    tag: 'Auth',
    summary: 'Turn two-factor off (requires a current code or a recovery code)',
    auth: 'required',
    body: twoFactorCodeSchema,
    middleware: [authLimiter],
    responses: { 204: 'Disabled', 400: 'Wrong code' },
    handler: async (req, res) => {
      await c.twoFactor.disable(currentUser(req).id, req.body.code);
      res.status(204).end();
    },
  });

  // ---------------------------------------------------------------- GitHub / Google sign-in

  defineRoute(ctx, {
    method: 'get',
    path: '/providers',
    tag: 'Auth',
    summary: 'Which social sign-in providers are configured',
    handler: (_req, res) => {
      res.json(c.oauth.enabled());
    },
  });

  defineRoute(ctx, {
    method: 'get',
    path: '/oauth/:provider/start',
    tag: 'Auth',
    summary: 'Redirect to GitHub/Google (authorization code + PKCE)',
    params: providerParams,
    middleware: [authLimiter],
    responses: { 302: 'Redirect to the provider' },
    handler: (req, res) => {
      const provider = req.params.provider as OAuthProvider;
      const { url, state } = c.oauth.start(provider, req.query.returnTo);
      // SameSite=Lax (not Strict): the provider sends the browser back with a top-level GET,
      // which Strict cookies would not accompany.
      res.cookie(OAUTH_COOKIE, JSON.stringify(state), {
        httpOnly: true,
        secure: c.env.cookieSecure,
        sameSite: 'lax',
        path: OAUTH_COOKIE_PATH,
        maxAge: 10 * 60_000,
      });
      res.redirect(302, url);
    },
  });

  defineRoute(ctx, {
    method: 'get',
    path: '/oauth/:provider/callback',
    tag: 'Auth',
    summary: 'Provider redirect target: signs in, sets the refresh cookie, returns to the app',
    params: providerParams,
    middleware: [authLimiter],
    responses: { 302: 'Redirect back to the web app' },
    handler: async (req, res) => {
      const provider = req.params.provider as OAuthProvider;
      let stored: OAuthState | null;
      try {
        stored = JSON.parse(String(req.cookies?.[OAUTH_COOKIE] ?? 'null')) as OAuthState | null;
      } catch {
        stored = null;
      }
      res.clearCookie(OAUTH_COOKIE, { path: OAUTH_COOKIE_PATH });
      try {
        const profile = await c.oauth.complete(provider, req.query, stored);
        const result = await c.auth.oauthLogin(profile, client(req));
        if (result.mfa) {
          // Second factor still required: the short-lived challenge alone cannot sign anyone in.
          const q = new URLSearchParams({
            mfaToken: result.mfa.mfaToken,
            next: stored?.returnTo ?? '/',
          });
          res.redirect(302, `${c.env.publicUrl}/login?${q}`);
          return;
        }
        const { tokens } = result;
        res.cookie(REFRESH_COOKIE, tokens.refreshToken, cookieOptions(c, tokens.refreshExpiresAt));
        // No token in the URL: the app calls /auth/refresh (cookie) to get an access token.
        const back = new URLSearchParams({ returnTo: stored?.returnTo ?? '/' });
        res.redirect(302, `${c.env.publicUrl}/auth/callback?${back}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Sign-in failed';
        c.logger.warn({ provider, err: message }, 'oauth sign-in failed');
        res.redirect(302, `${c.env.publicUrl}/login?${new URLSearchParams({ error: message })}`);
      }
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

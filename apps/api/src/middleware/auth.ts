import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Role } from '@devhub/shared';
import { ForbiddenError, UnauthenticatedError } from '../core/errors.js';
import type { TokenService } from '../modules/auth/token.service.js';

export interface AuthUser {
  id: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      requestId?: string;
    }
  }
}

function bearer(req: Request): string | null {
  const h = req.headers.authorization;
  return h?.startsWith('Bearer ') ? h.slice(7).trim() || null : null;
}

/** Stateless authentication: verifies the JWT signature and expiry, no DB round trip. */
export function authMiddleware(tokens: TokenService) {
  const requireAuth: RequestHandler = (req, _res, next) => {
    const token = bearer(req);
    if (!token) throw new UnauthenticatedError();
    const claims = tokens.verifyAccess(token);
    req.user = { id: claims.sub, role: claims.role };
    next();
  };

  /** Attaches the user if a valid token is present; anonymous otherwise (for public reads). */
  const optionalAuth: RequestHandler = (req, _res, next) => {
    const token = bearer(req);
    if (token) {
      try {
        const claims = tokens.verifyAccess(token);
        req.user = { id: claims.sub, role: claims.role };
      } catch {
        // An expired token on a public endpoint just means "anonymous".
      }
    }
    next();
  };

  const requireRole =
    (role: Role): RequestHandler =>
    (req: Request, _res: Response, next: NextFunction) => {
      if (!req.user) throw new UnauthenticatedError();
      if (req.user.role !== role) throw new ForbiddenError();
      next();
    };

  return { requireAuth, optionalAuth, requireRole };
}

/** Narrowing helper for handlers mounted behind requireAuth. */
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw new UnauthenticatedError();
  return req.user;
}

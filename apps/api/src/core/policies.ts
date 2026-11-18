import type { AuthUser } from '../middleware/auth.js';
import { ForbiddenError } from './errors.js';

/**
 * Authorisation rules in one place, so "who may do what" is reviewable at a glance
 * and unit-testable without HTTP. Admins can moderate any content.
 */
export const policies = {
  canModify(user: AuthUser, ownerId: string): boolean {
    return user.id === ownerId || user.role === 'ADMIN';
  },
  canAcceptAnswer(user: AuthUser, questionAuthorId: string): boolean {
    return user.id === questionAuthorId;
  },
  canVoteOn(user: AuthUser, contentAuthorId: string): boolean {
    return user.id !== contentAuthorId;
  },
  canManageSession(user: AuthUser, hostId: string): boolean {
    return user.id === hostId || user.role === 'ADMIN';
  },
};

export function assertCan(allowed: boolean, message?: string): void {
  if (!allowed) throw new ForbiddenError(message);
}

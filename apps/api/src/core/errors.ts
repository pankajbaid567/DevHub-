import { ErrorCode } from '@devhub/shared';

/**
 * Domain errors carry an HTTP status and a stable code. Services throw them; the error
 * middleware turns them into the uniform `{ error: { code, message } }` body. Anything that
 * is not an AppError is treated as a bug: logged with a stack and returned as a generic 500.
 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(details: Record<string, string[]>, message = 'Request validation failed') {
    super(400, ErrorCode.VALIDATION_FAILED, message, details);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = 'Authentication required', code: ErrorCode = ErrorCode.UNAUTHENTICATED) {
    super(401, code, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You are not allowed to do that') {
    super(403, ErrorCode.FORBIDDEN, message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, ErrorCode.NOT_FOUND, `${resource} not found`);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, string[]>) {
    super(409, ErrorCode.CONFLICT, message, details);
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests, please slow down') {
    super(429, ErrorCode.RATE_LIMITED, message);
  }
}

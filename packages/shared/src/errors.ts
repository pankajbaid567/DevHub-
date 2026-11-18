/**
 * Stable, machine-readable error codes. Clients branch on `code`, never on `message`.
 * Every API error has the shape {@link ApiErrorBody}.
 */
export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  SESSION_FULL: 'SESSION_FULL',
  SESSION_NOT_LIVE: 'SESSION_NOT_LIVE',
  AI_UNAVAILABLE: 'AI_UNAVAILABLE',
  INTERNAL: 'INTERNAL',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    /** Field-level problems for VALIDATION_FAILED, keyed by dotted path. */
    details?: Record<string, string[]>;
    requestId?: string;
  };
}

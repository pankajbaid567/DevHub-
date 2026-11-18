# ADR 0002: Short-lived JWT in memory plus a rotating refresh cookie

**Status:** Accepted

## Context

The MVP stored a 7-day JWT in `localStorage`. Any XSS could steal it, it couldn't be revoked, and logout did nothing on the server.

## Decision

- **Access token.** A 15-minute HS256 JWT (with issuer, audience and expiry) returned in the response body and kept **only in memory**. It's verified statelessly, with no database lookup per request.
- **Refresh token.** A 256-bit random value in an `httpOnly`, `Secure` (in production), `SameSite=Strict` cookie scoped to `/api/v1/auth`. Only its SHA-256 hash is stored.
- **Rotation.** Each refresh atomically revokes the presented token and issues a successor in the same family.
- **Reuse detection.** Presenting an already-revoked token revokes the entire family (OAuth 2.0 Security BCP).
- **CSRF.** `SameSite=Strict`, plus a required `X-Requested-With` header on refresh and logout.

## Consequences

- An XSS payload can't read a long-lived credential. A stolen refresh token is detected on first reuse.
- One extra request (`/auth/refresh`) restores the session after a reload. The client skips it when it has never signed in.
- Concurrent refreshes from one tab could trip reuse detection, so the client uses a single-flight refresh. This is unit-tested.

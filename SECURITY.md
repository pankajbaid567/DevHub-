# Security

## Reporting a vulnerability

Please use GitHub's **private vulnerability reporting** (Security tab → *Report a vulnerability*) with the details and steps to reproduce. Do not open a public issue. You'll get an acknowledgement within 72 hours.

## Threat model and controls

| Threat | Control | Where |
|---|---|---|
| Credential stuffing or brute force | Redis-backed limit on `/auth/*` (20 per 15 minutes per IP); bcrypt cost 12; NIST-style length-first password policy | `middleware/http.ts`, `shared/auth.ts` |
| User enumeration | Identical login errors; dummy bcrypt comparison for unknown emails (constant time) | `auth.service.ts` |
| Token theft through XSS | Access token in memory only (15 minutes); refresh token in an `httpOnly` cookie | ADR 0002 |
| Refresh token replay | Rotation on every use; reuse revokes the whole token family; atomic claim prevents races | `token.service.ts` (tested) |
| CSRF | `SameSite=Strict` cookie scoped to `/api/v1/auth`, plus a required `X-Requested-With` header; every other endpoint uses bearer tokens | `auth.routes.ts` |
| XSS through user content and AI output | Markdown is sanitised before highlighting: no raw HTML, event handlers or `javascript:` URLs. External links get `noopener noreferrer nofollow`. Strict CSP at nginx. | `Markdown.tsx` (tested), `nginx.conf` |
| IDOR and broken access control | Central policies; owner-scoped queries; private resources return **404**, not 403, so their existence isn't revealed | `core/policies.ts`, services (tested) |
| Socket impersonation | JWT required at handshake; identity derived server-side; per-session membership checks; token expiry enforced on every event | `realtime/socket.ts` (tested) |
| Injection | Prisma parameterised queries; raw SQL only through tagged templates with bound parameters; `websearch_to_tsquery` for user search syntax | `questions.service.ts` |
| Mass assignment and malformed input | zod schemas on every params, query and body, which also strip unknown keys | `core/validate.ts` |
| Malicious uploads | PDF only, 2 MB cap, held in memory, **magic-byte check** (the client's MIME type isn't trusted) | `ai.routes.ts` (tested) |
| Prompt injection | User content kept in user turns, separate from system prompts; JSON outputs validated before use | ADR 0006 |
| Denial of service and cost abuse | Body size limits, page caps, chat throttling, Yjs update and document size caps, per-user AI hourly limit, AI timeouts with abort on disconnect | various |
| Open redirect after login | `?next=` must be a same-site relative path | `lib/navigation.ts` (tested) |
| Secrets misconfiguration | The environment is validated at boot: the secret must be at least 32 characters, placeholders are refused in production, and disabling rate limits is refused in production. Logs redact authorisation headers, cookies and passwords. | `config/env.ts`, `lib/logger.ts` |
| Information leakage | Generic 500 bodies; stable error codes; `x-powered-by` removed; helmet headers; containers run as non-root | `middleware/http.ts`, Dockerfiles |

## Operational notes

- Set `COOKIE_SECURE=true` and serve over HTTPS in production.
- Set `TRUST_PROXY` to the number of proxies in front of the API, so rate limits see real client IPs.
- Rotate `JWT_ACCESS_SECRET` to invalidate every access token immediately. Refresh tokens can be revoked in the database by `familyId` or `userId`.

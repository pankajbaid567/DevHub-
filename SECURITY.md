# Security

## Reporting a vulnerability

Please use GitHub's **private vulnerability reporting** (Security tab → *Report a vulnerability*) with the details and steps to reproduce. Do not open a public issue. You'll get an acknowledgement within 72 hours.

## Threat model and controls

| Threat | Control | Where |
|---|---|---|
| Credential stuffing or brute force | Redis-backed limit on `/auth/*` (20 per 15 minutes per IP); bcrypt cost 12; NIST-style length-first password policy | `middleware/http.ts`, `shared/auth.ts` |
| User enumeration | Identical login errors; dummy bcrypt comparison for unknown emails and for social-only accounts (constant time); `forgot-password` answers `202` whether or not the account exists | `auth.service.ts` (tested) |
| Stolen passwords | Optional TOTP two-factor: secret AES-256-GCM sealed (HKDF key); single-use time steps (replay-proof); hashed single-use recovery codes; a 5-minute challenge JWT with a separate audience; lockout after 5 wrong codes (Redis, cluster-wide); enforced for social logins too | `two-factor.service.ts`, `totp.ts` (tested, including the RFC vector) |
| Email-link abuse | Reset and verification tokens are 256-bit random, stored only as SHA-256 hashes, single use (atomic conditional update), short-lived (30 min / 24 h), and voided when a new one is issued. A reset revokes every refresh token. | `email-token.service.ts` (tested) |
| OAuth login CSRF, code interception and account takeover | `state` compared with an httpOnly cookie; PKCE S256; only provider-**verified** emails are linked or used; tokens never placed in URLs; `returnTo` restricted to same-site paths | `oauth.service.ts`, ADR 0010 (tested) |
| HTML injection in emails | Every user-controlled value in email templates is HTML-escaped | `jobs/emails.ts` (tested) |
| Token theft through XSS | Access token in memory only (15 minutes); refresh token in an `httpOnly` cookie | ADR 0002 |
| Refresh token replay | Rotation on every use; reuse revokes the whole token family; atomic claim prevents races | `token.service.ts` (tested) |
| CSRF | `SameSite=Strict` cookie scoped to `/api/v1/auth`, plus a required `X-Requested-With` header; every other endpoint uses bearer tokens | `auth.routes.ts` |
| XSS through user content and AI output | Markdown is sanitised before highlighting: no raw HTML, event handlers or `javascript:` URLs. External links get `noopener noreferrer nofollow`. Strict CSP at nginx. | `Markdown.tsx` (tested), `nginx.conf` |
| Abuse and spam content | Reports (unique per user and item, 10 per hour), AI triage as a prioritisation signal only, admin-only resolution with an audit trail (who, when, action, note); the triage prompt treats the post as untrusted data | `moderation.service.ts` (tested) |
| IDOR and broken access control | Central policies; owner-scoped queries; private resources return **404**, not 403, so their existence isn't revealed | `core/policies.ts`, services (tested) |
| Socket impersonation | JWT required at handshake; identity derived server-side; per-session membership checks; token expiry enforced on every event | `realtime/socket.ts` (tested) |
| Injection | Prisma parameterised queries; raw SQL only through tagged templates with bound parameters; `websearch_to_tsquery` for user search syntax | `questions.service.ts` |
| Mass assignment and malformed input | zod schemas on every params, query and body, which also strip unknown keys | `core/validate.ts` |
| Malicious uploads | PDF only, 2 MB cap, held in memory, **magic-byte check** (the client's MIME type isn't trusted) | `ai.routes.ts` (tested) |
| Prompt injection | User content kept in user turns, separate from system prompts; retrieved community posts wrapped in `<community_sources>` and declared untrusted reference data; JSON outputs validated before use | ADR 0006, `prompts.ts` |
| Remote code execution (by design: users run code) | A separate runner service on a network with no internet; read-only rootfs; all capabilities dropped; non-root; memory, CPU and pids caps; per-run ulimits, scrubbed environment, temp directory and process-group kill; one run per session and a per-user cooldown | `apps/runner`, ADR 0011, [system design](docs/SYSTEM_DESIGN.md#sandboxed-code-execution) |
| Denial of service and cost abuse | Body size limits, page caps, chat throttling, Yjs update and document size caps, per-user AI hourly limit, AI timeouts with abort on disconnect | various |
| Open redirect after login | `?next=` must be a same-site relative path | `lib/navigation.ts` (tested) |
| Secrets misconfiguration | The environment is validated at boot: the secret must be at least 32 characters, placeholders are refused in production, and disabling rate limits is refused in production. Logs redact authorisation headers, cookies and passwords. | `config/env.ts`, `lib/logger.ts` |
| Information leakage | Generic 500 bodies; stable error codes; `x-powered-by` removed; helmet headers; containers run as non-root | `middleware/http.ts`, Dockerfiles |

## Operational notes

- Set `COOKIE_SECURE=true` and serve over HTTPS in production.
- Set `TRUST_PROXY` to the number of proxies in front of the API, so rate limits see real client IPs.
- Set a random `RUNNER_TOKEN` (shared by the API and the runner). For public deployments, run the runner under gVisor (`runtime: runsc`).
- Use a real SMTP provider with SPF, DKIM and DMARC for the `MAIL_FROM` domain. Register exact OAuth callback URLs with GitHub and Google.
- Rotate `JWT_ACCESS_SECRET` to invalidate every access token immediately. Refresh tokens can be revoked in the database by `familyId` or `userId`.

# Audit of the original MVP

This is a review of the `mvp 1` codebase (JavaScript, Express 4 style, React JSX), done before the TypeScript rebuild. It lists each finding by severity, with what was done about it. It's kept as a record of why the rebuild was needed and what it fixed.

Severity levels: 🔴 critical · 🟠 high · 🟡 medium · ⚪ low.

## Security

| # | Sev | Finding | Resolution |
|---|---|---|---|
| S1 | 🔴 | **Socket identity spoofing.** Socket events trusted `userId` and `username` from the client payload, and sockets were unauthenticated, so anyone could post chat or code as any user. | The handshake requires a JWT, and identity comes only from the token. A test sends a spoofed `userId` and asserts it is ignored. |
| S2 | 🔴 | **IDOR on resume reviews.** `PUT /api/resumes/:id/review` let any signed-in user overwrite anyone's resume review. | Reviews are owner-scoped (`findFirst({ id, userId })`), and the endpoint was replaced by AI review history. |
| S3 | 🟠 | **PII leak.** `GET /api/users/:id` returned every user's email publicly. | A structural `userSummarySelect` never selects the email. A test asserts no email appears in public profiles. |
| S4 | 🟠 | **Private data publicly readable.** Messages of private sessions and any user's resumes and messages were readable without authorisation. Private sessions were listed publicly and joinable by anyone. | Participant checks on chat. Private sessions return 404 to non-participants and require an invite code. |
| S5 | 🟠 | **Long-lived bearer token in `localStorage`** (7 days, no refresh, no revocation, and logout did nothing on the server). | A 15-minute access token in memory, plus a rotating httpOnly `SameSite=Strict` refresh cookie with reuse detection. Logout revokes the token family. |
| S6 | 🟠 | **No rate limiting** on login, registration or the paid AI endpoints. | Redis-backed limits: global, credentials (20 per 15 minutes) and AI (per user per hour). |
| S7 | 🟡 | **No input validation.** NaN ids caused 500s, page `limit` was unbounded (an easy denial of service), and bodies were unvalidated. | zod validation of params, query and body on every route, with page size capped at 50. |
| S8 | 🟡 | **AI error messages leaked to clients** (`AI service temporarily unavailable. Error: ${error.message}`). | Generic `503 AI_UNAVAILABLE`, with details logged server-side only. |
| S9 | 🟡 | **Hard-coded CORS origin and secrets loaded unchecked.** The app would boot without `JWT_SECRET` and fail at runtime. | The environment is validated at startup: the secret must be at least 32 characters and placeholders are refused in production. CORS uses an allowlist from the environment. |
| S10 | 🟡 | **User enumeration.** Registration and login responses distinguished existing accounts, and login timing differed. | Identical login errors, and bcrypt is compared against a dummy hash for unknown emails. |
| S11 | ⚪ | No security headers, `x-powered-by` exposed, sequential integer ids. | helmet, a strict CSP at nginx, and CUID ids. |

## Correctness

| # | Sev | Finding | Resolution |
|---|---|---|---|
| C1 | 🔴 | **Frontend called non-existent routes.** Pages posted to `/questions`, `/snippets` and `/sessions`, but the API served `/api/...`, so creating content and opening any detail page returned 404. `api.js` also declared endpoints the backend never had (question and snippet update/delete, `GET /api/skills`, `GET /api/resumes`, a wrong messages path). | One typed API client against a single versioned prefix (`/api/v1`), with shared contracts. E2E tests exercise every core flow. |
| C2 | 🔴 | **Lists and the dashboard were hard-coded fake data** (questions, snippets, sessions, stats). | Every page reads the real API. |
| C3 | 🔴 | **Migrations had drifted from the schema.** `session_participants`, `mentor_conversations` and several session columns were missing, so a fresh database didn't work. | A fresh baseline migration, plus a CI check (`prisma migrate diff`) for drift. |
| C4 | 🟠 | **The AI mentor crashed when related answers existed:** it read `answer.content` (the field is `body`) and `snippet.description` (which didn't exist). | Rewritten AI module, tested with a fake provider. |
| C5 | 🟠 | **Reputation, votes, stars and accepted answers were advertised but did not exist.** | Implemented transactionally, with a ledger and tests (including concurrency). |
| C6 | 🟠 | **Session join race:** a check-then-insert on capacity. | Row lock (`SELECT … FOR UPDATE`) plus a test with six concurrent joins. |
| C7 | 🟡 | After a reload the "user" was only `{ id }` decoded from the JWT client-side (no username, no expiry check). | Session restore through `/auth/refresh` returns the full current user. |
| C8 | 🟡 | Two Prisma clients (one created per AI module), and no graceful shutdown. | A single client from the composition root, and graceful shutdown that also flushes documents. |

## Quality, UX and operations

| # | Sev | Finding | Resolution |
|---|---|---|---|
| C9 | 🟠 | **The video call was a facade.** `VideoCall.jsx` showed only the local camera and screen. The server never relayed offers, answers or ICE candidates, so no one else could see or hear you. No whiteboard existed. | Real WebRTC calls with server signalling restricted to call members, and a CRDT-backed collaborative whiteboard. Both are verified by E2E tests with two browsers. |
| Q1 | 🟠 | No tests at all (only ad-hoc scripts such as `test-ai-curl.sh`). | 93 automated tests including E2E, and CI. |
| Q2 | 🟡 | 41 ESLint errors; duplicate files (`Register_backup.jsx`, `Register_fixed.jsx`, `Home_Fixed.jsx`), including one that failed to parse. | Strict TypeScript and zero lint warnings in CI. Dead files removed. |
| Q3 | 🟡 | A single 515 KB JavaScript bundle with no code splitting. Monaco would load from a CDN. | Route-level splitting, and Monaco bundled locally and lazy-loaded. |
| Q4 | 🟡 | About 5,000 lines of overlapping CSS (several design-token files, a 3,165-line `index.css`). | One token-based Tailwind 4 design system with three themes. |
| Q5 | 🟡 | README promised features that didn't exist (voice and video, refresh tokens, star system, reputation). | The README describes only what is implemented and tested. |
| Q6 | ⚪ | Page title "Vite + React", no meta description, AI scaffolding notes committed (`.github/copilot-instructions.md`). | Proper metadata; scaffolding notes removed. |
| Q7 | ⚪ | No Docker, no CI, no health checks, `console.log` logging. | Docker and Compose, CI, probes, structured logs and metrics. |

## Bugs found during the rebuild by its own tests

These are worth noting because the tests earned their keep:

1. **The event bus didn't isolate synchronous throws.** A unit test caught that a handler throwing synchronously escaped `Promise.allSettled`.
2. **The whole app rendered blank in Chrome.** `useEffect(() => window.scrollTo(0, 0))` returned the Promise that recent Chrome versions return from scroll methods, and React tried to call it as a cleanup. The browser smoke test caught it.
3. **Production-only crash on `/register`.** A catch-all vendor chunk created a circular chunk dependency (a temporal-dead-zone error). E2E against the production build caught it.
4. **Cross-replica edits were corrupted.** `Uint8Array` payloads didn't survive the Redis adapter's msgpack encoding. The multi-replica Docker test caught it.
5. **Replicas overwrote each other's document saves.** Fixed with CRDT-merge-on-save under a row lock, with a regression test.
6. **nginx sent no security headers on pages or assets.** A `location` with its own `add_header` silently drops inherited headers. The headers are now in a snippet included everywhere, and the CSP no longer allows inline scripts. Found by checking response headers on the Docker stack.
7. **Retired Gemini models.** The defaults had been retired for new API keys (404). They were switched to current models, and the fallback was hardened with a time-budget split and a circuit breaker after the primary was seen hanging under load.
8. **Colour contrast below WCAG AA** in avatars, status colours and syntax highlighting. axe in E2E caught it.

## Preserved work

The uncommitted cyberpunk theme from the MVP was kept on the `wip/cyberpunk-theme` branch. Its visual identity lives on as the optional **Cyberpunk** theme.

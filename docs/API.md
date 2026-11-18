# API

The live, interactive reference is generated from the route definitions and served at **`/docs`** (Swagger UI), with the raw spec at **`/openapi.json`**.

- **Base path:** `/api/v1`
- **Auth:** `Authorization: Bearer <accessToken>` (15 minutes). Refresh with `POST /api/v1/auth/refresh`; the refresh cookie is sent automatically, and the `X-Requested-With: devhub` header is required.
- **Pagination:**
  - lists: `?page=&limit=` (limit ≤ 50) → `{ items, meta: { page, limit, total, totalPages } }`;
  - feeds (chat, notifications): `?cursor=&limit=` → `{ items, nextCursor }`.

## Errors

Every error has the same shape:

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "Request validation failed",
             "details": { "title": ["Title needs at least 10 characters"] },
             "requestId": "7b0e…" } }
```

| HTTP | `code` |
|---|---|
| 400 | `VALIDATION_FAILED` |
| 401 | `UNAUTHENTICATED`, `TOKEN_EXPIRED` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND` (also used for private resources) |
| 409 | `CONFLICT`, `SESSION_FULL`, `SESSION_NOT_LIVE` |
| 413 / 415 | `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE` |
| 429 | `RATE_LIMITED` (with `RateLimit` headers) |
| 503 | `AI_UNAVAILABLE` |
| 500 | `INTERNAL` (details are logged, never returned) |

## Endpoints

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me` |
| Questions | `GET /questions?q&tag&author&sort=newest\|active\|votes\|unanswered`, `POST /questions`, `GET\|PATCH\|DELETE /questions/:id`, `POST /questions/:id/vote`, `POST /questions/:id/answers`, `PUT /questions/:id/accepted-answer` |
| Answers | `PATCH\|DELETE /answers/:id`, `POST /answers/:id/vote` |
| Tags | `GET /tags?q` |
| Snippets | `GET /snippets?q&language&tag&author&sort`, `POST /snippets`, `GET\|PATCH\|DELETE /snippets/:id`, `PUT\|DELETE /snippets/:id/star`, `POST /snippets/:id/fork` |
| Sessions | `GET /sessions?scope=public\|mine&status`, `POST /sessions`, `GET /sessions/:id`, `POST /sessions/:id/{join,leave,start,end,invite-code}`, `GET\|POST /sessions/:id/messages` |
| Users | `GET /users/leaderboard`, `GET /users/me/dashboard`, `PATCH /users/me`, `GET\|PUT /users/me/skills`, `GET /users/:username` |
| Notifications | `GET /notifications`, `POST /notifications/read` |
| AI | `GET /ai/status`, `GET\|POST /ai/conversations`, `GET\|DELETE /ai/conversations/:id`, `POST /ai/conversations/:id/messages` (SSE), `POST /ai/code`, `GET\|POST /ai/resume-reviews` (JSON or multipart PDF), `POST /ai/skill-assessment` |
| Operations | `GET /health`, `GET /ready`, `GET /metrics` |

## Streaming (mentor)

`POST /ai/conversations/:id/messages` responds with `text/event-stream`. Each frame is `data: <json>\n\n`, where the JSON is a `MentorStreamEvent`:

```
{"type":"start","messageId":"…","model":"gemini-2.5-flash"}
{"type":"delta","text":"Start by "}
…
{"type":"done","messageId":"…","title":"Debugging a slow API"}
```

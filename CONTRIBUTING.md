# Contributing

## Setup

```bash
npm install
npm run db:up                           # Postgres + Redis (Docker)
cp apps/api/.env.example apps/api/.env  # set JWT_ACCESS_SECRET
npm run db:migrate && npm run db:seed
npm run dev
```

## Before you push

```bash
npm run lint && npm run typecheck && npm run format:check && npm test
npm run e2e        # needs the dev servers (started automatically if not running)
```

`npm run db:up` also starts Redis and Mailpit. Set `TEST_REDIS_URL=redis://localhost:6379` to include the BullMQ integration test, and keep Mailpit running for the email E2E tests (they skip otherwise).

CI runs the same checks, plus a schema-drift check and Docker builds.

## Conventions

- **Contracts first.** A new endpoint starts with its zod schema and DTO in `packages/shared`.
- **Routes** are declared with `defineRoute()` (auth, validation and OpenAPI in one place). Handlers stay thin, and business rules live in services.
- **Authorisation** goes in `core/policies.ts`. Never inline ad-hoc ownership checks.
- **Consistency:** invariants in one transaction; side effects through `EventBus` after commit (ADR 0004).
- **Errors:** throw `AppError` subclasses. Never return ad-hoc error JSON.
- **Database changes:** run `npm run prisma:migrate:dev -w @devhub/api -- --name <change>`, and review the generated SQL.
- **Web:** server state goes in TanStack Query using keys from `qk`; filters live in the URL; every interactive element is keyboard-accessible and labelled.
- **Tests:** new behaviour needs a test at the lowest level that can prove it (unit, integration against Postgres, or E2E).
- **Commits:** imperative mood (`Add snippet forking`), one logical change per commit.

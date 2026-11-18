# ADR 0001: npm-workspaces monorepo with a shared contract package

**Status:** Accepted

## Context

The API and the web app must agree on request shapes, validation rules, error codes and real-time event payloads. In the original MVP these were duplicated by hand and drifted: the frontend called routes that did not exist.

## Decision

Use an npm-workspaces monorepo (`apps/api`, `apps/web`, `packages/shared`). `packages/shared` exports:

- the zod schemas, used for server validation and client forms;
- the DTO types;
- error codes;
- reputation rules;
- typed Socket.IO event maps.

## Consequences

- A contract change is one edit, and both apps fail to compile until they're updated.
- Client-side form validation is guaranteed to match the server's.
- The shared package must stay dependency-light; it depends only on zod.
- I chose plain npm workspaces over Nx or Turborepo: with three packages, extra tooling isn't worth it yet.

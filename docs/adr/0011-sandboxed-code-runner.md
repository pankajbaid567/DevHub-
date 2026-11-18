# ADR 0011: A purpose-built sandboxed runner instead of Judge0 or Piston

**Status:** Accepted

## Context

Sessions needed a Run button. Executing user code is remote code execution by definition, so the question is where it runs and what contains it.

## Options

- **A hosted API (Judge0 on RapidAPI, the public Piston API):** zero ops, but it needs keys, has rate limits, sends user code to a third party, and the public Piston API now requires an allow-listed token.
- **Self-hosted Piston or Judge0:** very capable (dozens of languages, isolate/nsjail). Both need `--privileged` containers, and Piston downloads its runtimes from GitHub at first start (this failed in a network-restricted environment). That's heavy for three languages.
- **In the browser (Web Workers, Pyodide):** no server risk, but output isn't authoritative or shared, and it's limited to languages compiled to WASM.
- **A small purpose-built service:** about 300 lines, no dependencies, and it runs in an ordinary *unprivileged* container whose isolation comes from Docker plus per-run limits.

## Decision

The purpose-built `apps/runner` service. It's reachable only from the API, over an internal network with no internet. The container is read-only, has no capabilities and no privilege escalation, and has memory, CPU and pids caps and tini. Each run gets ulimits, a scrubbed environment, a temp directory, a wall-clock process-group kill and output caps. The API enforces permissions, a distributed per-session lock and a cooldown, and broadcasts results to the room.

## Consequences

- Only JavaScript, TypeScript (Node's built-in type stripping) and Python. More languages means more toolchains in the image.
- Container isolation shares the host kernel. For public, hostile traffic the documented next step is gVisor (`runtime: runsc`) or Firecracker, with no code changes.
- The `CodeRunner` interface keeps Judge0 or Piston as drop-in alternatives (`HttpCodeRunner` talks to any service with the same small contract).

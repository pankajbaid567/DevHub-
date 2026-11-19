# ADR 0014: Hidden tests with server-side comparison

**Status:** Accepted

## Context

Interview problems needed automatic checking, and some tests should stay hidden, so a candidate can't just make the examples pass. The code already runs in the sandboxed runner (ADR 0011), which executes one program and returns stdout and stderr.

## Options

- **Send the tests, expected values included, into the sandbox and let a harness assert there.** Simple, but the answers sit next to untrusted code, and a solution can print "all passed" lines.
- **Run each test as a separate program.** Clean isolation, but N sandbox runs per click, and the session lock and cooldown would make that slow.
- **One run with inputs only, compared on the server.** A generated harness calls the solution with every test's input and prints the outputs as JSON after a random per-run marker. The API parses the outputs after the *last* marker and compares them with expected values it never sent.

## Decision

The third option.

- Suites live in `apps/api/src/modules/interviews/problem-tests.ts`, never in `@devhub/shared` (which the browser bundles). Expected values are computed by reference implementations in that file, and large hidden inputs come from a seeded PRNG, so every server agrees.
- Function problems receive argument lists; class problems (LRU cache, rate limiter) receive call sequences such as `[["LRUCache", 2], ["put", 1, 1], ["get", 1]]`, like LeetCode's design problems.
- Each test catches its own exception, so one failing test doesn't hide the others. A program that never reaches the harness (a syntax error, top-level crash, timeout) is reported as such with its stderr.
- Outputs go through JSON on both sides, so JavaScript and Python compare identically (`None`/`null`, tuples/arrays). Problems where order doesn't matter (two sum) compare unordered.
- Submissions share the runs' guard rails (live sessions, editors only, cooldown, one execution per session via the Redis lock), are stored for history and are broadcast to the room.

## Consequences

- Hidden *answers* never leave the server. A solution can still print the inputs it receives, so this stops hard-coding the examples, not a determined cheat; it's a practice tool.
- Reference solutions in JavaScript and Python are run through the harness with real interpreters in the API test suite, so a broken suite or harness fails CI rather than the candidate.
- The E2E suite caught a regression while this was built: the refactored run path passed the runner's full response (including `signal`) to Prisma. The integration tests' fake runner now returns an extra field too.

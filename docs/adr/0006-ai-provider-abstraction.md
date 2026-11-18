# ADR 0006: AI behind a provider interface, with a keyless demo mode

**Status:** Accepted

## Decision

The service layer depends on an `AIProvider` interface (`generate`, `stream`), not on Gemini directly.

- **`GeminiProvider`** adds a hard timeout combined with client-abort signals, and falls back to a cheaper model on quota, overload or not-found errors.
- **`DemoProvider`** returns deterministic, clearly labelled responses when no API key is configured.
- **Structured outputs** use a JSON Schema derived from the zod schema, are validated again with zod and retried once. Invalid model output is never stored.
- **Prompt-injection hygiene:** user content goes only in user turns, never into the system prompt. Output is rendered as sanitised markdown.
- **Cost controls:** a per-user hourly limit (Redis), abort on disconnect, and capped input sizes.

## Consequences

- Tests use a scripted fake provider, so there are no network calls in CI.
- The product is fully clickable in a demo or review environment without credentials.
- Adding another provider is one class.

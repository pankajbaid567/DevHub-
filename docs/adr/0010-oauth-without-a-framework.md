# ADR 0010: OAuth 2.0 (GitHub, Google) implemented directly, on top of our own sessions

**Status:** Accepted

## Decision

"Continue with GitHub/Google" uses the authorization-code flow with **PKCE (S256)** and a **state** value, implemented in about 150 lines (`OAuthService`) rather than with Passport or Auth.js:

- `state`, the PKCE verifier and `returnTo` live in a 10-minute httpOnly `SameSite=Lax` cookie scoped to the OAuth routes (Lax because the provider returns with a top-level cross-site GET).
- After the code exchange, the provider identity resolves to a user: an already-linked identity, else a **provider-verified** email matching an existing account (linked), else a new account (username derived from the profile, with retries on collision).
- The callback issues our **normal refresh cookie** and redirects to the SPA, which calls `/auth/refresh`. No token ever appears in a URL, so OAuth users get the same rotation and reuse detection as everyone else.

## Why

- Two redirects and two HTTP calls don't justify a framework that brings its own session model, which would conflict with ADR 0002.
- Every security property is explicit and tested with a fake provider: state mismatch, PKCE verifier sent, unverified email refused, open-redirect attempts neutralised, linking.

## Trade-offs

- Adding a provider means writing its profile mapping (about 20 lines). An OIDC discovery-based generic provider would be the next step if more are needed.
- Accounts created through OAuth have no password until the user sets one (`hasPassword: false`). Password login for them fails exactly like a wrong password, so it reveals nothing.

# Architecture decisions

## One language, two frameworks

Angular owns the browser experience and reactive UI state. NestJS supplies HTTP routing, dependency metadata and authorization guards. The domain store remains independently testable without starting NestJS. TypeScript strict checking and Angular strict template checking run during the build.

## Why built-in SQLite

The application can start without an external database or native npm build step. Node 24's SQLite API provides prepared statements and explicit transactions. WAL is enabled and foreign keys are enforced on startup. The database file must remain on local persistent storage; ephemeral hosting and multiple replicas are not supported by this setup.

The synchronous API keeps the review transaction short and makes its boundaries explicit. This is a portfolio-sized, single-process tradeoff: synchronous queries and scrypt block the event loop. Use asynchronous hashing and a server database before scaling traffic.

## Review consistency

1. Validate the grade, integer card version and bounded request ID.
2. Start `BEGIN IMMEDIATE`.
3. Look up a previous request by account and idempotency key. Return its saved due date if card and grade match; reject reuse for another payload.
4. Load the card through its owning collection; reject cross-account access.
5. Check the submitted version and server-side due time.
6. Update the interval, due timestamp and version; insert a review record.
7. Commit both writes, or roll back on any error.

The database uniqueness constraint on `(user_id, request_id)` provides a second integrity boundary. Every browser rating generates a request ID; API clients retrying a request must preserve its ID. A user encountering a stale queue can reopen the collection to reload current state.

## Session and request boundaries

Passwords are never stored in plain text. Session tokens are returned only in HttpOnly cookies; the database contains token digests. Session validity is checked on every authenticated request. Logout revokes the database record. All collection and card queries include ownership checks.

SameSite cookies and mutation-origin checks protect browser requests. The origin is configured explicitly, rather than trusted from a forwarded header. Non-browser clients may omit Origin but still need a valid session. There is no cross-origin API mode.

The authentication limiter is deliberately process-local and uses the direct socket IP. Behind a proxy, requests may share one bucket. Configure a shared limiter and trusted proxy handling before opening a high-traffic deployment. No credentials, API keys or production database are committed.

## Accessibility and UI

Forms use visible labels, native constraints and buttons. Status messages use live regions, error messages use alerts, and keyboard focus indicators remain visible. Card text is rendered by Angular interpolation, not HTML injection. Mobile layouts have browser checks for horizontal overflow. No formal WCAG audit has been performed.

## Future improvements

- Versioned schema migrations before modifying existing tables.
- Card editing with version checks and explicit review-history behavior.
- Import/export with strict schema validation.
- An asynchronous password-hashing queue and shared rate limiting.
- Optional FSRS scheduling, implemented against its actual specification and tested separately.

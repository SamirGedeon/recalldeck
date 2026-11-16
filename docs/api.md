# HTTP API

All endpoints are under `/api`; responses are JSON. Mutations accept JSON with `Content-Type: application/json`. Authentication uses a `session` cookie. In browsers the API and frontend share an origin. Supply the configured `APP_ORIGIN` in an Origin header for browser mutation requests.

| Method | Path | Request | Result |
| --- | --- | --- | --- |
| GET | `/health` | — | `{status: "ok"}` |
| POST | `/auth/signup` | `{email,password}` | User and session cookie |
| POST | `/auth/login` | `{email,password}` | User and session cookie |
| GET | `/me` | Cookie | Current `{id,email}` |
| POST | `/logout` | Cookie, `{}` | Revokes session |
| GET | `/decks` | Cookie | Collection summaries: `id,name,total,due` |
| POST | `/decks` | `{name}` | Created collection |
| GET | `/decks/:id/cards` | Cookie | Cards sorted by due timestamp and ID |
| POST | `/decks/:id/cards` | `{front,back}` | Created card ID |
| POST | `/cards/:id/reviews` | `{grade,version,requestId}` | New interval/due; duplicate returns saved due and `replayed:true` |
| GET | `/stats` | Cookie | `{reviews,recalled}`; recalled counts Good/Easy ratings |

Except for health and signup/login, all endpoints require a session. Creation and review routes return HTTP 201; GET routes return 200. Logout currently uses NestJS's default POST status, 201.

Passwords require 10–128 trimmed characters. Email limit: 254; collection name: 80; question: 500; answer: 2000. Text is trimmed on creation. Grade is `again`, `good`, or `easy`; request ID is 8–80 ASCII letters, digits or hyphens. Timestamps are Unix milliseconds. A card begins at version zero; each successful new review increments the version.

## Example

```sh
curl -c cookies.txt -H 'Content-Type: application/json' \
  -d '{"email":"learner@example.com","password":"a-long-unique-password"}' \
  http://localhost:8000/api/auth/signup

curl -b cookies.txt -H 'Content-Type: application/json' \
  -d '{"name":"TypeScript essentials"}' \
  http://localhost:8000/api/decks
```

For a review, read the card's current `version` and submit a fresh request ID. **Keep the same request ID when retrying an ambiguous or failed network request.** Reusing an ID for a different card or grade returns 409.

## Errors

NestJS JSON errors contain a `message` and normally `statusCode` and `error`. Middleware-origin and rate-limit errors contain a `message`.

- **400:** invalid fields, invalid integer path ID or invalid review payload.
- **401:** missing/expired session or invalid credentials.
- **403:** disallowed browser origin or cross-site mutation.
- **404:** collection/card missing, including another account's resources.
- **409:** email already registered, stale version, early review, or conflicting idempotency key.
- **429:** too many authentication attempts; `Retry-After` is provided.

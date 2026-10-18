# @mol/server — M2a foundation

Local setup (from the repository root):

```sh
pnpm --filter @mol/engine build
pnpm --filter @mol/shared build
cp apps/server/.dev.vars.example apps/server/.dev.vars
# Set TOKEN_SECRET to a random secret of at least 32 characters.
pnpm --filter @mol/server db:migrate
pnpm --filter @mol/server admin:create
pnpm --filter @mol/server dev
```

`admin:create` prompts for a username and a password (12–128 characters; hidden
on a terminal). For automation, use `MOL_ADMIN_USERNAME` and
`MOL_ADMIN_PASSWORD`. It refuses to overwrite the single existing admin account.
It defaults to local D1. `admin:create --remote` explicitly selects remote
`mol-db`; remote creation and migrations are not part of this task.

All API responses are JSON, errors are `{ "error": { "code": "..." } }`.
Cookies are HttpOnly, SameSite=Strict, Secure on HTTPS; account sessions last seven
days. Password hashes use PBKDF2-SHA256 with 100,000 iterations (Workers limit),
random 128-bit salt and 256-bit output. Cookie tokens are random 256-bit secrets;
only SHA-256 digests are stored in D1. Cross-origin writes are rejected.

| Method | Endpoint                             | Input / purpose                                                                                                           |
| ------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/auth/admin/login`              | `{ username, password }`                                                                                                  |
| POST   | `/api/auth/admin/logout`             | Revoke current admin cookie                                                                                               |
| POST   | `/api/auth/business/login`           | `{ username, password }`                                                                                                  |
| POST   | `/api/auth/business/logout`          | Revoke current business cookie                                                                                            |
| POST   | `/api/auth/business/password`        | `{ currentPassword, newPassword }`; retain this session, revoke others                                                    |
| GET    | `/api/admin/businesses`              | List businesses, without password hashes                                                                                  |
| POST   | `/api/admin/businesses`              | `{ name, username, credits, password? }`; generated password if omitted; returns credentials and copyable Turkish summary |
| GET    | `/api/admin/businesses/:id`          | Business detail                                                                                                           |
| PATCH  | `/api/admin/businesses/:id`          | `{ creditsDelta?, unlimitedCredits?, active?, concurrentSessionLimit?, lobbyLifetimeHours? }`                             |
| POST   | `/api/admin/businesses/:id/password` | `{ password? }`; reset password and revoke all business sessions                                                          |
| GET    | `/api/business/me`                   | Account, credits, privileges                                                                                              |
| POST   | `/api/business/sessions`             | `{ settings?: Partial<SessionConfig> }`; create lobby without consuming credits                                           |
| POST   | `/api/business/sessions/:id/cancel`  | Cancel own lobby                                                                                                          |
| GET    | `/api/rooms/:code`                   | `{ code, businessName, started }`                                                                                         |
| POST   | `/api/rooms/:code/join`              | `{ nickname, wants: 'player' \| 'voter' }`; `{ participantId, token }`                                                    |

Username lookup uses trimmed NFC text and Turkish case folding. Nicknames follow
the engine's Unicode/code-point length model. Lobby creation checks current credits,
account status, authentication and concurrency in one SQL insertion. Admin
mutations and audit entries are atomic; passwords never enter the audit payload.
Expired lobbies are cancelled on room access/lobby creation and by a minute cron.
Running/paused games count against the concurrency limit and survive password
resets and account deactivation.

Participant tokens are HMAC-SHA256 signed and scoped to session ID, room code and
participant ID. `verifyParticipantToken` checks signature and time; M2b must also
check current room/session and participant membership when accepting a token.
The join endpoint currently issues identity only, as required by M2a. It does not
reserve nicknames, track browser identity, execute `join`, or implement approvals,
reconnection, takeover, WebSockets or any room engine state. These belong to M2b.
No game start or credit consumption is implemented here.

`packages/shared` exports strict Zod validators for role-specific commands,
client/server messages, engine projections, join requests and token claims.
System commands are never accepted from clients; participant command payloads
cannot provide `participantId`. M2b must select the validator for the authenticated
connection role and inject identity. Public cues intentionally accept only public
cue kind and round number, never arbitrary engine event payloads.

Generate migrations with `pnpm --filter @mol/server db:generate`; apply locally
with `db:migrate`. Integration tests use Workers with an isolated D1 database and
apply the same committed SQL migrations. Run `pnpm verify` before delivery.

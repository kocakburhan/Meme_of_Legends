# @mol/server — M2 room server

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
participant ID. `verifyParticipantToken` checks signature and time; the room also checks its
credential digest and allowed issuing session. Rematches explicitly carry these
credentials into the new lobby; unrelated room/session tokens are rejected.
The join endpoint now executes the engine join, reserves the nickname and issues a
room-scoped HttpOnly browser cookie. Sending the issued token as a Bearer token or
in the room cookie reuses that identity; kicked identities cannot rejoin.

`GET /api/rooms/:code/ws?token=...` authenticates participants; the business cookie
authenticates the room's manager. An explicit participant token selects participant
mode even when the browser also has a manager cookie. Socket attachments retain
role, credential digest and expiry through hibernation. Manager credentials are
rechecked before commands and projections, so revoked sessions lose access.

The room runs the engine, persists every accepted state and command acknowledgement
in its SQLite-backed Durable Object storage, and sends only viewer projections.
Participant connections supersede older connections for that identity. Votes persist
immediately; vote projections are coalesced at 250 ms. Engine deadlines and lobby
expiry use Durable Object alarms. Hibernation preserves deadlines; restart without
surviving sockets invokes engine restore and reconciles connection state.

A durable intent bridges DO storage and D1: accepted transitions, audit records,
credit consumption and the final report can be replayed after interruption. Credit
updates are atomic across rooms and replay-safe, including unlimited accounts.
Finalization records `privateMediaCleanupRequested` as the M6 physical-deletion hook.
Prompt pools include active, unblocked platform and own-business prompts, cached for
one second during command bursts and refreshed before prompt draws.

Protocol v0.2 adds manager-only `shell` messages (`approveTakeover`,
`rejectTakeover`, `createDisplayPairCode`, `rematch`). They use ordinary `ack`
responses and persistent message IDs, including across rematches and message kinds.
Only manager `view` messages include `shell: ManagerShellInfo`; participant/display
views carry only their engine projection.

- `POST /api/rooms/:code/takeover` with `{ nickname }` returns HTTP 202 and
  `{ status: 'pending', requestId, receipt }`. Poll that same POST endpoint with
  `{ requestId, receipt }`. It returns `{ status: 'pending' | 'rejected' }`, or
  `{ status: 'approved', participantId, token }` plus the participant browser cookie.
  The receipt is private to the requesting device. Approval rotates the credential,
  supersedes the previous socket and preserves the engine's participant identity.
- `createDisplayPairCode` publishes a six-digit code in the manager's shell view.
  `POST /api/display/pair` with `{ code }` returns `{ token, roomCode }`. Connect
  the display with that token at the ordinary room WebSocket endpoint. Codes expire
  in five minutes, are consumed atomically, and a newly issued code invalidates the
  previous one. Pairing a new display revokes the previous display's credential.
  A separate index object in the existing ROOM namespace resolves numeric codes;
  it needs no additional Cloudflare resource or D1 migration.
- `rematch` creates a fresh D1 session and engine lobby under the same room code,
  preserving attached participants and display credentials. Participants choose
  their new role with `cmd: { type: 'join', nickname, wants }` or HTTP join; their
  existing participant IDs and browser tokens remain valid. No previous selections
  or votes enter the new engine. Lobby creation rechecks credits/account/concurrency;
  only the new game's accepted start consumes another credit. A durable rematch
  intent makes retries safe across DO/D1 interruptions.
- After lost connections indicate a restart, the first view is followed by
  `{ type: 'recovery', serverNow, resumesAt }` for a three-second countdown. Engine
  actions are rejected with `RECOVERING` during this window. Phase time is preserved,
  presentation restarts its media slot, and explicit pauses remain paused. Lost
  connections are reconciled after the countdown so review cannot close while
  voters are still reconnecting. Ordinary hibernation does not restart the countdown.

The engine API and D1 schema are unchanged. Physical private-media deletion remains
an M6 hook; no upload/YouTube validation or web UI is included here.

`packages/shared` exports strict Zod validators for role-specific commands,
client/server messages, engine projections, join requests and token claims.
System commands are never accepted from clients; participant command payloads
cannot provide `participantId`. The room selects the validator for the authenticated
connection role and injects identity. Public cues intentionally accept only public
cue kind and round number, never arbitrary engine event payloads.

Generate migrations with `pnpm --filter @mol/server db:generate`; apply locally
with `db:migrate`. Integration tests use Workers with an isolated D1 database and
apply the same committed SQL migrations. Run `pnpm verify` before delivery.

Room integration tests run full elimination and league games with actual Workers
WebSockets and cover anonymity, authorization, persistent idempotency, hibernation,
restart recovery, supersession, unlimited/concurrent credit handling, prompt scope,
vote coalescing, revoked managers, lobby cancellation and alarm expiry. Further
coverage exercises takeover approval/rejection and receipt privacy, display role
permissions and code races/expiry, cross-room credentials, rematch credit handling
and crash replay, plus recovery from selection/presentation/review/results/paused
states and hibernation during the countdown.

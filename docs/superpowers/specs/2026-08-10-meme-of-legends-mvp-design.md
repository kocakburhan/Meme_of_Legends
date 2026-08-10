# Meme of Legends — MVP Product Requirements and Design

**Date:** 2026-08-10
**Status:** Approved product and UX design specification
**Product type:** Business-operated, browser-based live event game
**Working title:** Meme of Legends

## 1. Executive Summary

Meme of Legends is a live, browser-based meme competition designed for events run by businesses such as cafés, bars, universities, corporate teams, and event organizers.

During a session, the system presents a situation such as “Maaşın yattığı an.” Each active player selects a system meme, uploads a private custom image or GIF, or adds a YouTube clip. Direct video-file uploads are not supported. Submissions are shown anonymously and rated from 1 to 5 by eligible players and voters. Scores drive one of three game modes: elimination, hybrid, or league.

The MVP is not a public consumer game. It is a managed event product in which platform admins provision business accounts, assign session rights, manage the central content library, and review session reports. A business runs one active session at a time. Participants join without accounts using a QR code or room code.

## 2. Product Opportunity

The product enables a business to run a structured, participatory entertainment event without requiring attendees to install an app or create an account. It combines the familiarity of Kahoot-style event participation with a WhatsApp-style GIF/meme picker and a game-show presentation layer.

The same product must work in multiple business contexts. The MVP is therefore scoped around a common operating format rather than one industry:

- A business-managed live event
- Predominantly mobile participation
- An optional shared display
- A fixed set of organizer controls
- A central, curated meme and situation library

## 3. MVP Outcome and Success Criteria

The MVP succeeds when a platform-admin-created business can independently create and complete a real session with at least two players, receive and finalize valid votes, and display the correct final result without a game-stopping critical error or technical-team intervention.

Independent voters are optional. A session may complete with two players and zero voters because players may rate every submission except their own.

### 3.1 Supported capacity

- Players: 2–16 per session
- Voters: no organizer-configured cap; verified MVP concurrency target is 250 voters per session
- One business manager connection
- One optional shared-display connection

### 3.2 Product non-goals for MVP

- Public self-registration for businesses
- Payments, subscriptions, invoicing, or checkout
- Multiple staff accounts per business
- Multiple simultaneous sessions per business
- Persistent participant accounts or profiles
- Public rooms, matchmaking, friends, or social feeds
- Business branding or white labeling
- User-created situation prompts
- Content packages, maturity labels, or safe-mode filters
- Strong attendee identity verification or device fingerprinting

## 4. Product Roles

### 4.1 Platform admin

- Creates, activates, and deactivates business accounts
- Sets initial session rights and adds rights later
- Resets business passwords
- Manages meme categories, system memes, and situation prompts
- Archives previously used content rather than deleting it
- Views live and historical session reports
- Views session settings, participants, content usage, votes, errors, and results

### 4.2 Business manager

- Signs in with credentials issued by the platform admin
- Changes the account password
- Views remaining session rights
- Creates and configures one active session
- Approves player requests and removes players
- Opens the optional shared display
- Starts, pauses, resumes, advances, or terminates the game
- Adds time to an active selection stage
- Changes future-round timing settings
- Resolves media failures
- Views historical session summaries

The full business-manager workflow must be operable from a mobile phone. Desktop and tablet layouts may show more information but must not introduce desktop-only capabilities.

### 4.3 Player

- Joins without an account
- Requests the player role using a unique nickname
- Selects a system meme, uploads a custom image/GIF, or adds a YouTube clip for each active round
- Rates every submission except their own
- Becomes a voter after elimination

### 4.4 Voter

- Joins without an account using a unique nickname
- May join while a session is running
- Rates submissions and participates in tie-break votes
- Does not submit memes

### 4.5 Shared display

- Is optional
- Shows the room QR/code, lobby, prompts, timers, anonymous submissions, tie-breaks, results, and champion
- Contains no business-manager controls
- Does not stop the game if disconnected

When no shared display is present, the same stage content is rendered on participant phones in a mobile layout.

## 5. Account and Session Rights

### 5.1 Business account provisioning

1. A platform admin creates the business.
2. The admin enters a business name, unique username, temporary password, account status, and positive integer session-right count.
3. The business may later change its password.
4. Businesses cannot self-register.

### 5.2 Session-right rules

- A business sees its remaining right count.
- Creating a session consumes exactly one right immediately.
- The creation action requires explicit confirmation that one right will be consumed.
- Cancelling or abandoning a created session does not automatically restore the right.
- A platform admin may manually add rights.
- A business with zero rights cannot create a session.
- A business may have only one active session. It must complete or terminate that session before creating another.

## 6. Session Creation and Settings

### 6.1 Configurable settings

| Setting | Allowed value | Default | Change behavior |
|---|---:|---:|---|
| Game mode | Elimination, Hybrid, League | Hybrid | Locked after game start |
| Player limit | 2–16 | Manager-selected | Locked after game start |
| Meme-selection duration | 30–240 seconds | 90 seconds | New value applies next round |
| Presentation and initial voting | Fixed 25 + 5 seconds | Fixed | Not configurable |
| Final vote-review duration | 15–120 seconds | 45 seconds | New value applies next round |
| League round count | 1–25 | 10 | Locked after game start |
| Custom media | Enabled/disabled | Enabled | Manager-controlled |

Hybrid mode is unavailable when fewer than four players are approved. The manager must select elimination or league mode instead.

### 6.2 Active-timer behavior

- The manager cannot shorten or replace an already-running selection timer.
- During an active selection stage, the manager may add +15, +30, or +60 seconds.
- Changing a configured duration during a live session affects the next round.
- The manager may pause and resume the game at any time.
- The shared-display mode may be opened or closed at any time.

## 7. Participant Join and Lobby Flow

1. The system creates a room code and QR link.
2. QR users skip manual room-code entry.
3. A participant enters a nickname unique within the room.
4. The participant chooses “Player” or “Voter.”
5. Voters enter directly.
6. Player requests enter a manager approval queue.
7. The manager accepts requests until the configured player limit.
8. Rejected requests and requests beyond capacity become voters rather than leaving the room.
9. The player roster locks when the game starts.
10. Voters may join during the game.

A signed browser/session identity restores the same participant and role after refresh or a short connection loss on the same device.

## 8. Central Content and Situation Prompts

### 8.1 Central meme library

- All active system memes are available in every session.
- There are no selectable content packages.
- Meme categories organize browsing but do not limit availability.
- The manager does not select or filter content before starting.
- The platform admin can create, preview, edit, categorize, and archive system memes.
- Supported system media concepts are image, GIF, and short video.
- When creating or editing a system video meme, the platform admin selects and previews a start/end range no longer than 25 seconds.
- Multiple players may choose the same meme in one round.
- A player may reuse the same meme in later rounds.

### 8.2 Situation prompts

- Prompts are centrally defined and managed by the platform admin.
- The system randomly selects a prompt not previously used in the current session.
- The manager does not see the prompt before the round.
- The manager may replace the displayed prompt once per round.
- Businesses and participants cannot create custom prompts in MVP.
- The platform must maintain at least 25 active prompts so the maximum-length league can complete without repetition.
- The platform admin cannot archive content in a way that reduces the active prompt count below 25; the admin UI explains why the operation is blocked.

### 8.3 No content filtering

- There are no maturity labels, environment filters, safe modes, or content packages.
- All active central content is available in all business contexts.

## 9. Meme Selection and Custom Media

### 9.1 System-meme selection

- The current situation prompt remains visible above the picker throughout selection.
- The mobile picker uses a search field, horizontal category controls, and a two-column media grid.
- Media cards display their type and duration where applicable.
- A player previews and explicitly confirms a selection.
- Confirmed selections may be changed while the selection stage is open.

### 9.2 Custom media

Players may privately add:

- An image
- A GIF
- A YouTube link

Players cannot upload video files directly. Custom moving-video content is accepted only through a YouTube link.

Custom content rules:

- It is visible only to the uploading player during selection.
- Other participants see it only when it is presented as an anonymous submission.
- It exists only in the current session and never enters the central library.
- The manager may disable custom content, remove a custom submission, and see its submitting player in the management console.
- There is no mandatory pre-approval queue.
- Custom files and YouTube-link details are deleted when the session ends.
- Historical reports retain only the fact that custom content was used.

### 9.3 YouTube trimming

- A valid YouTube source must be previewable before confirmation.
- The player selects start and end points on a touch-accessible timeline.
- The selected clip may not exceed 25 seconds.
- The player can preview and revise the clip before confirmation.

### 9.4 Selection timer completion

- The selection timer ends early when all active players confirm.
- At timeout, the last valid selected meme is submitted automatically even if the player did not press the final confirm button.
- A player with no valid selection receives zero points for that round.

## 10. Submission Presentation

### 10.1 Order and anonymity

- The server randomly orders submissions each round.
- Every client receives the same order.
- The order does not follow player, lobby, or leaderboard order.
- The owner remains hidden throughout presentation and final vote review.
- Owners are revealed only after all round votes lock.

### 10.2 Fixed 30-second submission slot

Each submission uses a fixed presentation slot:

1. First 25 seconds: the situation remains at the top, the anonymous submission is shown below it, and 1–5 voting is open.
2. Final 5 seconds: the same screen emphasizes “last decision”; ratings remain editable.
3. The system advances to the next submission.

Media behavior inside the 25-second display interval:

- Static images remain visible for the full interval.
- GIFs may loop for the interval.
- System-video and YouTube clips may not exceed 25 seconds and play once; if shorter than 25 seconds, the final frame remains visible until the last-decision phase.
- A clip is never cut before its selected end point.

## 11. Voting and Round Results

### 11.1 Eligibility and weight

- Every eligible participant vote has equal weight.
- Players cannot rate their own submission.
- Players may rate all other submissions.
- Voters may rate all submissions.
- Eliminated players vote as voters in later rounds.

### 11.2 Score calculation

- A submission score is the arithmetic mean of valid 1–5 ratings.
- Unrated submissions receive no implicit value such as 3.
- Partial ballots are valid.
- A submission with no valid ratings receives zero for scoring and advancement purposes.
- Live average scores are not displayed while voting is open.

### 11.3 Final vote review

After all submissions are presented:

- The final-review screen opens for the configured duration.
- Participants may replay missed content, add missing ratings, and revise ratings.
- Submission owners remain hidden.
- Missing ratings are visually emphasized but not required.
- If all eligible connected participants finalize early, the stage may close early.
- The manager may close the stage early or pause the game.
- Votes lock when the stage ends.

### 11.4 Reveal and leaderboard

- Owners, average scores, and valid vote counts are revealed after locking.
- The round result and relevant leaderboard remain visible until the manager advances.
- The shared display and phones show synchronized results.

## 12. Game Modes

### 12.1 Elimination mode

- Minimum: 2 players
- The number of rounds is calculated automatically from the active-player count and cannot be configured by the manager.
- Every active player responds to the same prompt each round.
- The system randomly creates new two-player matchups at the start of every round.
- Within each matchup, the higher submission score advances.
- Previous-round scores do not carry into the next elimination decision.
- If the active player count is odd, one randomly selected player receives a bye and advances automatically.
- Examples:
  - 15 players: 7 matchups + 1 bye → 8 players
  - 14 players: 7 winners → 7 players; next round is 3 matchups + 1 bye → 4 players
- Eliminated players become voters.
- When the final two play, the winner becomes champion and the loser is second.
- In the last-four round, the higher-scoring eliminated semifinalist is third; unresolved equality follows the tie chain.

### 12.2 League mode

- Minimum: 2 players
- Manager chooses 1–25 rounds; default is 10.
- No player is eliminated.
- Each round’s average submission score is added to the player’s cumulative league total.
- A missing submission adds zero.
- The final cumulative table determines first, second, third, and remaining places.

### 12.3 Hybrid mode

- Default game mode
- Minimum: 4 players
- Fixed total: 14 rounds

Structure:

1. League stage: all players play five rounds.
2. The top four qualify.
3. First semifinal: league position 1 vs position 4, played as three consecutive rounds.
4. Second semifinal: league position 2 vs position 3, played as three consecutive rounds.
5. Final: the two semifinal winners play three consecutive rounds.

Match scoring:

- The three round-average scores are summed.
- The higher three-round total wins the match.
- League points do not carry into the match total but are the first tie-breaker.

Third place:

- There is no separate third-place match.
- The semifinal loser with the higher five-round league score is third.
- The other semifinal loser is fourth.

Player-loss behavior:

- If fewer than four active players remain before the top four are established, semifinal play is cancelled and the five-round league table becomes the final result.
- If one of the four established semifinalists leaves/is removed, that player’s opponent advances by walkover and the other semifinal proceeds.
- If only two semifinalists remain, they advance directly to the three-round final.
- If one finalist leaves/is removed, the remaining finalist becomes champion by walkover.
- If only one eligible player remains at any later knockout point, that player wins by walkover.
- If no eligible player remains, the manager terminates the session without a champion.

## 13. Tie Resolution

### 13.1 Hybrid match tie

1. Compare the three-round match totals.
2. If equal, compare the five-round league totals.
3. If still equal, eligible participants choose one tied player/submission.
4. The tied competitors cannot vote.
5. If the choice vote is tied or no eligible voter exists, the manager chooses the winner.

### 13.2 Elimination and league ties

- Where no earlier comparable stage total exists, proceed directly to participant favorite selection.
- Tied competitors do not vote.
- If the selection remains tied or there are no eligible voters, the manager decides.

### 13.3 Multi-player ties

- All tied players appear in one favorite-selection vote.
- Eligible participants choose one favorite.
- Vote counts order the tied subset.
- Only still-tied players are voted on again.
- Remaining unresolved order is decided by the manager.

## 14. Disconnection, Removal, and Failure Rules

### 14.1 Participant reconnection

- Refresh or short disconnection restores the same session state and role on the same device.
- Timers continue when ordinary participants disconnect.
- A disconnected player is not automatically removed or eliminated.
- The manager decides whether to remove that player.

### 14.2 Business-manager disconnection

- If the business manager remains disconnected for more than five seconds, the server pauses the session.
- Participants see “Yönetici yeniden bağlanıyor.”
- Manager state restores on reconnection.
- The session resumes only after the manager explicitly continues.

### 14.3 Player removal

- Finalized historical rounds and votes remain unchanged.
- An unfinalized current submission is invalidated.
- The removed player is excluded from future rounds and leaderboards.
- If removal occurs before the current round's knockout matchups are locked, the remaining active players are paired again.
- If removal occurs after a knockout matchup is locked, the paired opponent advances by walkover at any elimination, semifinal, or final stage.
- Removal is written to the session audit trail.

### 14.4 Media failure

1. Media is validated and previewed during selection.
2. If presentation still fails, the system automatically retries once.
3. The game pauses and the manager receives “Retry” and “Invalidate submission” actions.
4. Invalidating gives the player zero for the round and advances the presentation.
5. The technical error is recorded in the platform-admin report.

## 15. Product-Level System Boundaries

The product consists of:

- Platform admin web application
- Business dashboard and mobile-first live manager console
- Player mobile web application
- Voter mobile web application
- Optional shared-display web client
- Authoritative real-time session/game engine
- Persistent account, session, vote, score, and reporting store
- Central and temporary media services

Core system principle: clients display state and issue authorized commands; the server owns timers, roles, phase transitions, matchups, vote locking, scoring, and recovery.

## 16. Reporting and Retention

### 16.1 Platform-admin session report

The report includes:

- Business and session identifiers
- Creation, start, end, and status timestamps
- Game mode and settings
- Participant nicknames and roles
- Player/voter counts
- Prompt history
- System meme identifiers and captured historical metadata
- Whether custom content was used
- Valid vote counts and average scores
- Round and match results
- Final ranking
- Player removals, media failures, pauses, and early termination

### 16.2 Retention rules

- System meme and prompt references remain resolvable after archival.
- Custom image/GIF files and YouTube-link details are deleted at session end.
- Reports retain only “custom content used” metadata.
- Finalized rounds are immutable in normal operation.

## 17. UX and Visual Design System

### 17.1 Foundation

- Component preset: shadcn/ui Luma
- Default Luma typography: Inter
- Default Luma icon set: Lucide
- Components use semantic theme tokens rather than raw colors in feature code.
- Radius, spacing, typography, and interaction patterns follow the Luma system.
- Avoid generic AI aesthetics: excessive gradients, purple defaults, oversized rounded cards, heavy shadows, and decorative stock grids.

### 17.2 Player, voter, business-manager, and shared-display language

Design direction: **Esprili ve Asi**
Palette direction: **Sıcak Zine**

Visual characteristics:

- Open, light, warm-cream large surfaces
- Dark ink foreground
- Controlled tomato-red primary accents
- Chartreuse/green selection and success accents with dark foreground
- Thin borders, restrained radius, minimal shadow
- Color concentrated in timers, statuses, selected ratings, and primary feedback

Representative exploratory tokens:

| Semantic role | Color |
|---|---|
| Background | `#FFF9F1` |
| Foreground | `#211E1A` |
| Primary | `#A8382D` |
| Accent/selected | `#A5C83B` |
| Soft accent | `#F1D9D1` |

These combinations were checked for WCAG AA contrast in their intended foreground/background pairings. Final implementation must store them as semantic OKLCH/CSS variables and revalidate contrast.

Voice examples:

- “Şaka ciddileşti.”
- “Pişmanlık serbest.”
- “Oy ver, kaçma.”
- “Meme avı başladı. Panik opsiyonel.”
- “Taht sallandı. Jüri koltuğun hazır.”
- “Video naz yaptı.” followed by a direct explanation and standard actions
- “Şaka tahta çıktı.”

Voice rule: humor may appear throughout the game, waiting, empty, transition, result, and success states. Form labels, critical actions, destructive confirmations, and recovery instructions remain direct and unambiguous.

### 17.3 Motion and feedback

- Selection confirmation: short pop animation
- Last-five countdown: slow pulse, never rapid flashing
- Lobby/waiting: restrained looping icon/sticker movement
- Elimination and role change: one-time transition
- Champion: short confetti and winner mark, then a stable result screen
- Error: no decorative looping animation; show cause, effect, and recovery
- Honor `prefers-reduced-motion` with static equivalents

### 17.4 Platform-admin design language

- shadcn/ui Luma remains the component foundation.
- Neutral SaaS palette and direct operational wording
- Compact tables, filters, breadcrumbs, forms, and clear status badges
- No playful game copy or decorative motion
- Standard actions such as “İşletme Oluştur,” “Hak Ekle,” “Şifre Sıfırla,” and “İçeriği Arşivle”

## 18. Screen Inventory

### 18.1 Participant/mobile

- Manual room-code entry
- QR deep link
- Nickname and role selection
- Player-request pending
- Player lobby
- Voter lobby/live join
- Situation and meme picker
- Search/categories
- System meme preview and confirm
- Custom source selection
- Image/GIF upload progress/error
- YouTube URL validation
- 25-second timeline trim and preview
- Selection confirmed/waiting
- Submission presentation and rating
- Own-submission locked state
- Last-five state
- Final vote-review list
- Round result and leaderboard
- Eliminated-to-voter transition
- Tie-break choice
- Champion/final ranking
- Reconnecting/paused/error states

### 18.2 Business manager

- Login and password change
- Dashboard and rights counter
- Session creation and mode selection
- Timing and custom-content settings
- Right-consumption confirmation
- Live lobby, QR/code, requests, and participants
- Shared-display opener
- Mobile live console
- Pause/resume, add time, replace prompt, advance
- Future-round timing settings
- Player removal and session termination confirmations
- Media failure resolution
- Round, match, and final results
- Session history and report summary

### 18.3 Platform admin

- Login
- SaaS overview dashboard
- Business list, create, detail, activate/deactivate
- Right assignment and adjustment
- Password reset
- Live/historical sessions and filters
- Session detail, results, and audit trail
- Meme library, categories, create/edit/archive
- Situation prompt create/edit/archive
- System error logs
- Responsive mobile layouts

### 18.4 Shared display

- QR/code lobby
- Prompt and selection countdown
- Anonymous submission presentation
- Final-review waiting
- Tie-break vote
- Round result and leaderboard
- Manager reconnect/pause
- Final podium and champion

## 19. Accessibility Requirements

- WCAG 2.1 AA minimum
- Normal text contrast at least 4.5:1; large text at least 3:1
- UI component contrast at least 3:1
- Touch targets at least 44×44 px
- Complete keyboard navigation and visible focus
- Logical heading order and one page-level heading
- Visible form labels and field-associated errors
- Status changes announced with appropriate live regions
- Color is never the only state indicator
- Content remains usable at 200% text zoom
- No flashing more than three times per second
- Dialog focus trapping and focus return
- Shared-display text scaled for distance and 16:9 projection
- Audio is not required to understand the game
- Captions shown when available

## 20. Reliability and Performance Requirements

- Target load: 16 players, 250 voters, manager, and shared display in one session
- User-visible selection/vote acknowledgement within one second under normal supported conditions
- Session phase divergence across connected clients no greater than one second
- Critical phase and locked-vote state persisted for restart recovery
- A restarted session restores paused and requires manager continuation
- Duplicate and late commands processed idempotently/rejected
- Next media preloaded where possible
- Supported browsers: current mobile Chrome and Safari; current desktop Chrome, Edge, and Safari
- Responsive validation at 320, 768, 1024, and 1440 px

## 21. Verification Strategy

### 21.1 Game-rule tests

- All three modes
- Every starting player count from 2 to 16 where allowed
- Random pairings and odd-player byes
- League cumulative scoring
- Hybrid qualification, semifinals, final, third place
- All tie chains, including multi-player ties
- Missing submissions and zero valid ratings
- Dropouts, removals, walkovers, and no-champion termination

### 21.2 Account and quota tests

- Manual business provisioning
- Password change/reset
- Positive initial rights
- Right decrement on creation
- No automatic refund on cancellation
- Zero-right creation prevention
- Manual admin right addition
- One-active-session constraint

### 21.3 Real-time and recovery tests

- Participant refresh/reconnect
- Manager disconnect and automatic pause
- Shared-display disconnect without pause
- Duplicate commands and late votes
- Server restart and paused recovery
- Synchronized random submission order
- Vote locking and owner reveal

### 21.4 Media tests

- System images, GIFs, and videos
- Custom images, GIFs, and YouTube links; direct video-file uploads must be rejected
- Timeline trimming and 25-second maximum
- Upload progress, cancellation, invalid source, and retry
- Presentation failure and manager invalidation
- End-of-session custom-media deletion

### 21.5 Load, accessibility, and UX tests

- 16-player and 250-voter concurrency
- Full player, voter, manager, admin, and display journeys
- Keyboard-only operation
- Screen-reader announcements
- Automated accessibility checks
- Reduced-motion behavior
- Responsive layouts at required widths
- Loading, empty, error, offline, and recovery states

## 22. Delivery Boundary

This document approves product behavior, UX structure, and product-level system boundaries. Technology stack, deployment platform, database, real-time transport, object storage, media processing, YouTube integration details, and infrastructure topology must be selected in the next technical-design phase.

No implementation or scaffolding begins until this written specification is reviewed and approved.

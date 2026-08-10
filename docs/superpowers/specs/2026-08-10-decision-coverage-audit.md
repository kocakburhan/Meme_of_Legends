# Meme of Legends — Decision Coverage Audit

**Date:** 2026-08-10
**Audited specification:** `docs/superpowers/specs/2026-08-10-meme-of-legends-mvp-design.md`
**Result:** All approved product and UX decisions are represented in the specification. No unresolved product decision is knowingly presented as approved.

## Purpose

This audit maps the decisions approved during product discovery to the written specification. It also distinguishes final decisions from earlier alternatives that were later replaced.

## Coverage Matrix

| Decision area | Final approved decision | Specification section | Status |
|---|---|---|---|
| Product scope | Business-operated, browser-based, mobile-first live event game | 1–3 | Covered |
| Event contexts | One common product for cafés, bars, universities, companies, and event organizers | 1–2 | Covered |
| Shared display | Optional; stage content also appears on participant phones | 4.5, 6.2, 18.4 | Covered |
| Roles | Platform admin, business manager, player, voter, shared display | 4 | Covered |
| Business onboarding | Platform admin creates accounts; no self-registration or payment | 3.2, 5.1 | Covered |
| Credentials | Admin-issued username/temporary password; business changes password; admin can reset | 4.1–4.2, 5.1 | Covered |
| Session quota | Any positive initial right count; visible balance; one right consumed on creation; no automatic refund; admin can add rights | 5 | Covered |
| Concurrent sessions | One active session per business account | 3.2, 5.2 | Covered |
| Capacity | 2–16 players; zero voters allowed; no configured voter cap; 250-voter validation target | 3.1 | Covered |
| Join flow | QR or room code, unique nickname, role choice, player approval, fallback to voter | 7 | Covered |
| Reconnection | Same device restores participant and role | 7, 14.1 | Covered |
| Mid-game participation | Player roster locks at start; voters may join later | 7 | Covered |
| Central library | All memes enabled in every environment; categories aid browsing; no packages or safety labels | 8 | Covered |
| System-video clipping | Admin selects/previews a maximum 25-second range when maintaining a system video meme | 8.1, 10.2 | Covered |
| Duplicate/reused memes | Multiple players may choose the same meme and reuse it later | 8.1 | Covered |
| Prompt library | Platform admin manages prompts; random non-repeating prompt; manager may replace once per round | 8.2 | Covered |
| Prompt capacity | At least 25 active prompts; archival cannot reduce the total below 25 | 8.2 | Covered |
| Custom media | Players upload image/GIF or add YouTube; direct video-file upload is rejected | 9.2, 21.4 | Covered |
| Custom-media privacy | Private during selection; manager can identify/remove; no preapproval queue | 9.2 | Covered |
| Custom-media retention | Files and YouTube details deleted after session; report keeps only “custom content used” | 9.2, 16 | Covered |
| YouTube clipping | Touch-accessible start/end selection; maximum 25 seconds; preview/revise | 9.3 | Covered |
| Selection timing | Manager selects 30–240 seconds; default 90; all confirmations end early | 6.1, 9.4 | Covered |
| Selection timeout | Last valid choice submits automatically; no valid choice scores zero | 9.4 | Covered |
| Live timing changes | Future-round values can change; active selection can only gain +15/+30/+60 | 6.2 | Covered |
| Presentation order | Random and identical for every screen; owner remains anonymous until vote lock | 10.1 | Covered |
| Presentation layout | Situation above, meme below, voting on the same screen | 9.1, 10.2 | Covered |
| Per-meme timing | Fixed 25 seconds presentation/voting plus 5 seconds last decision | 6.1, 10.2 | Covered |
| Media playback | Static image persists, GIF loops, video/YouTube plays once and holds final frame | 10.2 | Covered |
| Voting | Scores 1–5; player cannot vote for self; all eligible votes have equal weight | 11.1 | Covered |
| Scoring | Arithmetic mean; partial votes valid; missing votes excluded; zero valid votes scores zero | 11.2 | Covered |
| Final review | 15–120 seconds, default 45; replay/revise; early completion and manager close | 6.1, 11.3 | Covered |
| Results | Owner and scores reveal after locking; manager advances from result screen | 11.4 | Covered |
| Elimination mode | Automatic, non-configurable round count; new random pairs; odd-player random bye; current-round score decides | 12.1 | Covered |
| League mode | 1–25 rounds, default 10; nobody eliminated; cumulative table | 12.2 | Covered |
| Hybrid mode | Default, minimum four, fixed 14 rounds: 5 league + 3 + 3 semifinals + 3 final | 12.3 | Covered |
| Hybrid third place | Higher league score among semifinal losers; no third-place match | 12.3 | Covered |
| Hybrid departures | League fallback before top four; walkovers/direct final after top four; zero-player no-champion end | 12.3 | Covered |
| Tie chain | Match score, hybrid league score, participant favorite vote, manager decision | 13 | Covered |
| Multi-player tie | Vote among tied subset; repeat only unresolved subset; manager resolves remainder | 13.3 | Covered |
| Player removal | Past rounds remain; current unfinalized submission invalidates; re-pair before lock, walkover after lock | 14.3 | Covered |
| Manager disconnect | Auto-pause after five seconds; explicit resume | 14.2 | Covered |
| Shared-display disconnect | Does not pause the game | 4.5, 21.3 | Covered |
| Media failure | Validate, retry once, pause, manager retries or invalidates for zero | 14.4 | Covered |
| Reporting | Business/session/settings/participants/content/votes/results/errors/audit information | 16.1 | Covered |
| Manager mobility | Entire manager journey available on mobile; no desktop-only capability | 4.2, 18.2 | Covered |
| Game visual language | shadcn/ui Luma, Inter, Lucide, warm light “Esprili ve Asi / Sıcak Zine” direction | 17.1–17.3 | Covered |
| Game copy and motion | Playful voice across noncritical states; clear critical copy; reduced-motion equivalent | 17.2–17.3 | Covered |
| Admin visual language | Neutral, compact, direct SaaS language using Luma | 17.4 | Covered |
| Accessibility | WCAG 2.1 AA, 44 px targets, keyboard/focus/live regions/reduced motion | 19 | Covered |
| Reliability | Server-authoritative state, persistence, paused recovery, idempotency and synchronization targets | 15, 20 | Covered |
| Browser/responsive scope | Current supported browsers and 320/768/1024/1440 validation sizes | 20 | Covered |

## Superseded Decisions

These earlier values are intentionally absent from the final rules because later approvals replaced them:

- A separate 10–30 second rating screen with a 15-second default was replaced by the fixed combined `25 + 5` presentation-and-voting slot.
- A 15-second maximum clip was replaced by a 25-second maximum clip.
- Direct custom video-file upload was removed; custom moving-video content is now YouTube-only.
- An always-dark live-game surface was replaced by the approved warm, open, light “Sıcak Zine” presentation.
- A two-mode game design was replaced by elimination, league, and default hybrid modes.

## Intentionally Deferred to Technical Design

The approved product specification intentionally does not yet select:

- Application framework and repository structure
- Hosting and deployment platform
- Database and data-access layer
- Real-time transport and synchronization implementation
- Authentication/session implementation
- Object storage and media-processing implementation
- YouTube playback, validation, and clipping integration
- Observability, queues, caching, CI/CD, and infrastructure topology

These are not missing product decisions. They are the next explicitly approved decision phase.

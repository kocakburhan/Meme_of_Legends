/**
 * Skeleton of the per-room Durable Object.
 *
 * Filled in during M2 (game server core). It will wrap the pure engine
 * (`packages/engine`) and is prepared for:
 * - SQLite-backed persistent state (see `new_sqlite_classes` in wrangler.jsonc),
 * - WebSocket Hibernation API for participant / screen connections,
 * - alarm-based timers (turn countdowns, lobby expiry).
 */
export class RoomDurableObject {
  constructor(
    readonly state: DurableObjectState,
    readonly env: Cloudflare.Env,
  ) {}
}

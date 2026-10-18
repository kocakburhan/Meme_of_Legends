/**
 * Placeholder export for the M0 scaffold.
 *
 * The real engine API (state machine, commands, events, injected clock and
 * randomness) is designed in M1. The engine must stay pure: no I/O, no DOM
 * and no Cloudflare dependencies.
 */
export function enginePlaceholder(name: string): string {
  return `engine: ${name}`;
}

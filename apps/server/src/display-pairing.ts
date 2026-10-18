import { displayPairRequestSchema } from '@mol/shared';
import { ApiFailure, body, json } from './auth';

interface PairEntry {
  roomCode: string;
  sessionId: string;
  code: string;
  expiresAt: number;
}
// A local index in the existing namespace resolves numeric codes to room objects.
// The room remains the authority that consumes a code and rotates the display token.
export function pairingRegistry(env: Cloudflare.Env) {
  return env.ROOM.get(env.ROOM.idFromName('display-pair-registry'));
}
export async function pairingRegistryRoute(request: Request, state: DurableObjectState) {
  const path = new URL(request.url).pathname;
  if (path === '/pair-index/reserve') {
    const owner = await request.json<{ roomCode: string; sessionId: string }>();
    for (let attempt = 0; attempt < 32; attempt++) {
      const value = crypto.getRandomValues(new Uint32Array(1))[0]!;
      if (value >= 4_294_000_000) continue;
      const code = String(value % 1_000_000).padStart(6, '0');
      const key = `pair:${code}`;
      const previous = await state.storage.get<PairEntry>(key);
      if (previous && previous.expiresAt > Date.now()) continue;
      const entry: PairEntry = { ...owner, code, expiresAt: Date.now() + 300_000 };
      await state.storage.put(key, entry);
      const alarm = await state.storage.getAlarm();
      await state.storage.setAlarm(Math.min(alarm ?? Infinity, entry.expiresAt));
      return json(entry);
    }
    throw new ApiFailure(503, 'PAIR_CODE_UNAVAILABLE');
  }
  const { code } = await body(request, displayPairRequestSchema);
  const entry = await state.storage.get<PairEntry>(`pair:${code}`);
  if (!entry || entry.expiresAt <= Date.now()) throw new ApiFailure(404, 'PAIR_CODE_INVALID');
  return json(entry);
}
export async function expirePairIndex(state: DurableObjectState) {
  const entries = await state.storage.list<PairEntry>({ prefix: 'pair:' });
  let next = Infinity;
  for (const [key, entry] of entries) {
    if (entry.expiresAt <= Date.now()) await state.storage.delete(key);
    else next = Math.min(next, entry.expiresAt);
  }
  if (Number.isFinite(next)) await state.storage.setAlarm(next);
}
export async function pairDisplay(request: Request, env: Cloudflare.Env) {
  const input = await body(request, displayPairRequestSchema);
  const found = await pairingRegistry(env).fetch('https://room/pair-index/lookup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!found.ok) return found;
  const entry = await found.json<PairEntry>();
  return env.ROOM.get(env.ROOM.idFromName(entry.roomCode)).fetch('https://room/display-pair', {
    method: 'POST',
    body: JSON.stringify(entry),
  });
}

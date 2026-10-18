import type { Ctx, EngineState, PromptRef } from './types.js';

/** Mulberry32: all entropy is serialized in state.rng. */
export function random(state: EngineState): number {
  state.rng = (state.rng + 0x6d2b79f5) >>> 0;
  let value = state.rng;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}
export function shuffle<T>(state: EngineState, input: readonly T[]): T[] {
  const result = [...input];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random(state) * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
export function drawPrompt(state: EngineState, ctx: Ctx): PromptRef | null {
  const pool = [...new Map(ctx.prompts.map((p) => [p.id, p])).values()];
  if (!pool.length) return null;
  const lastUse = (id: string) =>
    Object.hasOwn(state.usedPromptIds, id) ? state.usedPromptIds[id]! : -1;
  const age = Math.min(...pool.map((p) => lastUse(p.id)));
  const candidates = pool.filter((p) => lastUse(p.id) === age);
  const prompt = candidates[Math.floor(random(state) * candidates.length)]!;
  Object.defineProperty(state.usedPromptIds, prompt.id, {
    value: ++state.promptDraw,
    enumerable: true,
    configurable: true,
    writable: true,
  });
  return { ...prompt };
}

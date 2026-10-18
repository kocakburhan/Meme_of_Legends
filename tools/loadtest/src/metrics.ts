import type { View } from '@mol/shared';
export function summary(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p: number) => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] ?? null;
  return {
    count: sorted.length,
    p50: percentile(0.5),
    p95: percentile(0.95),
    p99: percentile(0.99),
    max: sorted.at(-1) ?? null,
  };
}
export function phaseKey(view: View): string {
  return JSON.stringify(view.phase);
}
export class PhaseMetrics {
  transitions = new Map<string, Map<string, { local: number; server: number }>>();
  observe(key: string, client: string, local: number, server: number) {
    const entries = this.transitions.get(key) ?? new Map();
    if (!entries.has(client)) entries.set(client, { local, server });
    this.transitions.set(key, entries);
  }
  report(expected: number) {
    const groups = [...this.transitions.values()];
    const spread = (field: 'local' | 'server') =>
      groups
        .filter((g) => g.size >= 2)
        .map((g) => {
          const times = [...g.values()].map((v) => v[field]);
          return Math.max(...times) - Math.min(...times);
        });
    return {
      transitions: groups.length,
      completeTransitions: groups.filter((g) => g.size === expected).length,
      localMs: summary(spread('local')),
      serverNowMs: summary(spread('server')),
    };
  }
}

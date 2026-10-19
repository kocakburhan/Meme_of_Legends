import { describe, expect, it } from 'vitest';
import { PhaseMetrics, summary } from './metrics.js';
describe('ölçümler', () => {
  it('boş örnekleri sıfır gecikme gibi göstermez', () => {
    expect(summary([]).p95).toBeNull();
  });
  it('nearest rank yüzdeliklerini ve maksimumu hesaplar', () => {
    expect(summary(Array.from({ length: 100 }, (_, i) => 100 - i))).toEqual({
      count: 100,
      p50: 50,
      p95: 95,
      p99: 99,
      max: 100,
    });
  });
  it('tekrar görünümü ve yeniden bağlantıyı ilk teslimden ayırır', () => {
    const metrics = new PhaseMetrics();
    metrics.observe('round1', 'a', 100, 90);
    metrics.observe('round1', 'a', 800, 790);
    metrics.observe('round1', 'b', 130, 110);
    metrics.observe('round2', 'a', 1000, 990);
    expect(metrics.report(2).localMs.max).toBe(30);
    expect(metrics.report(2).serverNowMs.max).toBe(20);
    expect(metrics.report(2).completeTransitions).toBe(1);
  });
});

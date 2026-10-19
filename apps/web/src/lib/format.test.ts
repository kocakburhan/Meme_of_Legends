import { describe, expect, it } from 'vitest';

import { formatClock, remainingSeconds } from './format';

const NOW = 1_000_000;

describe('remainingSeconds', () => {
  it('tam sayıya yuvarlar ve negatif olmaz', () => {
    expect(remainingSeconds(NOW + 15_181, NOW)).toBe(16);
    expect(remainingSeconds(NOW + 15_000, NOW)).toBe(15);
    expect(remainingSeconds(NOW + 499, NOW)).toBe(1);
    expect(remainingSeconds(NOW - 5_000, NOW)).toBe(0);
  });

  it('formatClock ondalık saniye göstermez', () => {
    expect(formatClock(15.181449951171874)).toBe('0:15');
  });
});

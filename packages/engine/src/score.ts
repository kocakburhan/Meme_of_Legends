/** Compare full-precision scores while ignoring accumulated floating-point roundoff.
 * Relative tolerance 1e-12 is far below meaningful vote differences at room capacity.
 * Keep stored scores untouched and preserve the JSON/API number representation.
 */
export function compareScores(a: number, b: number): number {
  const difference = a - b;
  return Math.abs(difference) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b))
    ? 0
    : Math.sign(difference);
}

/**
 * Format a leaf count for display in the HUD and upgrade cards.
 *
 * Idle-game UX calibration:
 *   - Under 1000 → integer (no decimals feels cleaner at small numbers).
 *   - ≥ 1K → one-decimal SI suffix (K, M, B, T, Qa, Qi).
 *   - Beyond Qi → scientific notation (extremely unlikely in a 5-min run).
 *
 * Rationale: 2 decimals ("1.23K") feels busy for leaves-per-second tickers
 * that refresh every frame; 1 decimal reads as "growing" without visual
 * chatter. Round-half-down (Math.floor) so we never round the player's
 * balance up past the amount they actually own.
 */
const SUFFIXES = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp"];

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "—";
  // Sub-unit: show one decimal so tiny rates (e.g., 0.2/s) aren't floored to "0".
  if (n > 0 && n < 10) return (Math.floor(n * 10) / 10).toFixed(1).replace(/\.0$/, "");
  if (n < 1000) return String(Math.floor(n));
  const tier = Math.min(SUFFIXES.length - 1, Math.floor(Math.log10(n) / 3));
  const scaled = n / Math.pow(10, tier * 3);
  // Floor to 1 decimal: Math.floor(n * 10) / 10 never rounds up.
  const rounded = Math.floor(scaled * 10) / 10;
  if (tier >= SUFFIXES.length - 1 && scaled >= 1000) {
    // Beyond our suffix list — fall back to exponential notation.
    return n.toExponential(2);
  }
  return `${rounded.toFixed(1)}${SUFFIXES[tier]}`;
}

/** Same formatter but with an explicit sign prefix for rate readouts. */
export function formatRate(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  return `${formatNumber(n)}/s`;
}

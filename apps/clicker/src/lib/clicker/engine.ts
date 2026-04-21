// ───────────────────────────────────────────────────────────────────────────
// Clicker engine — intentionally minimal.
//
// Unlike the other games in this monorepo, Clicker has no puzzle state to
// derive deterministically from the seed. It is pure skill: both duelists
// face the same 2-minute timer and the same backend counting rule (raw
// tap count), so fair play is guaranteed by the timer + contract, not by
// a seeded board.
//
// We use the seed for one cosmetic concern: picking a tap-button emoji
// from a small set so both players see the same visual theme. Zero
// gameplay impact. Keeps the test surface consistent with Wordle / Sudoku /
// Minesweeper (all have a `numberFromSeed`-style hash fold).
//
// V1 trust-client scoring: score = number of clicks the frontend reports.
// No bot/throttle detection. V2 can add attestations (server-timestamped
// click bursts, rate limits, bot heuristics) if needed — track that as a
// separate workstream.
// ───────────────────────────────────────────────────────────────────────────

/** Emoji choices for the tap button. All neutral-positive, tap-friendly. */
export const TAP_EMOJIS = [
  "🍃", // leaf — legacy Clicker theme
  "⚡", // energy
  "🎯", // target
  "💎", // gem
  "🔥", // fire
  "✨", // spark
  "🎮", // game
  "🚀", // rocket
] as const;

/**
 * FNV-1a fold of the bytes32 seed to a uint32. Matches the pattern in
 * the other game engines.
 */
export function numberFromSeed(seed: string): number {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h === 0 ? 0xdeadbeef : h;
}

/**
 * Pick a tap-button emoji deterministically from the match seed.
 * Same seed → same emoji for both duelists.
 */
export function pickEmojiFromSeed(seed: string): string {
  return TAP_EMOJIS[numberFromSeed(seed) % TAP_EMOJIS.length];
}

/**
 * Hard ceiling enforced before submit. The shared backend rejects scores
 * `>= 50000` (implausible_score). A human at ~2.5 clicks/sec can reach
 * ~300 in 2 minutes — nowhere near the cap. Any number above 49_999
 * indicates a non-human input rate; we trim to the ceiling rather than
 * fail the submit outright, so legitimate autoclickers (if any) at least
 * record the max accepted score. Anti-cheat proper is V2.
 */
export const MAX_SUBMITTABLE_SCORE = 49_999;

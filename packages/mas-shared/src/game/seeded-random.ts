/**
 * Deterministic 32-bit PRNG using Knuth's multiplicative hash.
 *
 * The same `seed` always produces the same stream — critical for
 * tournaments where every player must see the same puzzle / ball serve /
 * mine layout. `Math.imul` keeps the multiplication in 32-bit integer
 * space; `>>> 0` converts signed → unsigned to avoid negative-number
 * rollover in floats.
 *
 * This was duplicated across every MAS game's engine (same 4 lines,
 * sometimes wrapped differently). Single source now.
 */
export function seededRandom(seed: number): () => number {
  let state = (seed >>> 0) || 1; // guard against zero-seed locking the stream
  return () => {
    state = Math.imul(state, 2654435761) >>> 0;
    return state / 0x100000000;
  };
}

/** Fisher–Yates shuffle driven by a provided RNG (usually seededRandom). */
export function shuffle<T>(arr: readonly T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

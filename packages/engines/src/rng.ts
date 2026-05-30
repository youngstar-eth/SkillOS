// Deterministic seeded RNG shared by every Δ6 replay engine.
//
// 32-bit LCG (Numerical Recipes constants) + FNV-1a seed hash. Lifted
// VERBATIM from `apps/2048/src/lib/game2048.ts` so each engine's RNG draw
// order byte-matches the production game UI bit-for-bit.
//
// ⚠ Do NOT "improve" the constants, the warm-up, or the hash mixing. A
// change here silently invalidates every committed golden vector AND every
// score already anchored on-chain — the RNG sequence is part of the
// game's consensus rules, not an implementation detail.
//
// No I/O, no `Math.random`, no wall-clock. Pure over a uint32 state.

/**
 * Seedable RNG: 32-bit LCG (Numerical Recipes constants). Produces a
 * deterministic sequence of [0,1) floats from a uint32 state.
 */
export class SeededRng {
  private state: number;

  constructor(seed: string | number) {
    this.state = hashSeed(seed);
    // Warm-up — the first LCG value after tiny seeds is often close to the
    // seed; discard four draws so low-entropy seeds don't bias the opening.
    for (let i = 0; i < 4; i++) this.nextUint32();
  }

  nextUint32(): number {
    // state = state * 1664525 + 1013904223, mod 2^32.
    // Multiplication in two 16-bit halves to avoid 32-bit overflow in JS.
    const lo = (this.state & 0xffff) * 1664525;
    const hi = ((this.state >>> 16) * 1664525) & 0xffff;
    this.state = ((hi << 16) + lo + 1013904223) >>> 0;
    return this.state;
  }

  /** Uniform in [0,1). */
  next(): number {
    return this.nextUint32() / 0x1_0000_0000;
  }

  /** Integer in [0, n). */
  nextInt(n: number): number {
    return Math.floor(this.next() * n);
  }
}

/**
 * Hashes any seed (hex string, decimal string, or number) to a uint32.
 * FNV-1a-style mixing; guarantees a non-zero state.
 */
export function hashSeed(seed: string | number): number {
  let h = 0x811c9dc5 >>> 0;
  const s = typeof seed === 'number' ? seed.toString(16) : seed;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h === 0 ? 0xdeadbeef : h;
}

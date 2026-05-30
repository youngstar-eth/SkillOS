// Deterministic clicker replay engine (Δ6 Stage 2).
//
// Source-of-truth: apps/clicker/src/lib/clicker/engine.ts + GameClicker.tsx.
//
// Clicker is DELIBERATELY the odd one out: it has NO seeded gameplay state and
// NO natural terminal. The seed is used for ONE cosmetic concern only — picking
// a shared tap-button emoji (zero score impact). Scoring is pure skill: each
// tap is +1 (the live component: "each tap is both a +1 score and a +1 move;
// the two signals coincide"). The live session is bounded by a shared
// 2-minute duel timer (wall-clock, frontend) — there is no engine-side
// game-over.
//
// ── SESSION BOUND (explicit DESIGN CHOICE — not derived from a live terminal) ──
// The live terminal is a 2-minute wall-clock timer; the engine cannot read a
// clock, so the replayable bound is THE INPUT LOG ITSELF: the session is the
// recorded taps, and `score = number of taps`. `SESSION_MS = 120_000` encodes
// the live timer so that — WHEN a tap carries an optional integer timestamp
// `t` (a V2 attestation hook; absent in today's trust-client V1) — the engine
// also enforces 0 ≤ t ≤ SESSION_MS and monotonic non-decreasing order, making
// the 2-minute window replayable. The bound is identical for all entrants and
// injects no luck (the only seed use is cosmetic). This is a deliberate choice
// surfaced for founder review (sessionBoundIsDesignChoice = true), NOT an
// inherited cap (cf. the 2048 MAX_MOVES=100 lesson).
//
// FIDELITY NOTE: because clicker has no seeded gameplay state, the live-vs-
// engine cross-check is necessarily shallow — only the cosmetic seed-fold
// (pickEmojiFromSeed) and the count rule (score === tap count) are
// cross-validatable. Score is trust-client by design in live V1 (no bot/rate
// detection); server-side attestation is a tracked V2 workstream.

import { type GameEngine, type MoveRecord, type VerifyResult, orderedMoves } from '../types';

/** The live 2-minute duel timer, in ms — the conceptual session bound. */
export const SESSION_MS = 120_000;

/**
 * Submit-layer ceiling (lifted from the live engine): the shared backend
 * rejects scores ≥ 50000 as implausible. Exposed via {@link clampSubmitScore}
 * but NOT applied inside `verify` — the engine reports the raw, skill-pure tap
 * count (mirrors wordle/match3: verify returns the deterministic score; the
 * submit clamp is a settlement-layer concern).
 */
export const MAX_SUBMITTABLE_SCORE = 49_999;

/** Tap-button emoji set — lifted verbatim from the live engine (cosmetic). */
export const TAP_EMOJIS = ['🍃', '⚡', '🎯', '💎', '🔥', '✨', '🎮', '🚀'] as const;

/**
 * One tap. `t` is an optional integer ms-offset within the session (a V2
 * attestation hook); today's trust-client V1 logs carry no timestamps, so most
 * records are an empty `{}`.
 */
export type MoveClicker = { t?: number };

/** FNV-1a fold of the bytes32 seed to a uint32 — verbatim from the live engine. */
export function numberFromSeed(seed: string): number {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h === 0 ? 0xdeadbeef : h;
}

/** Deterministic tap-button emoji for a seed (same seed → same emoji). */
export function pickEmojiFromSeed(seed: string): string {
  return TAP_EMOJIS[numberFromSeed(seed) % TAP_EMOJIS.length];
}

/** Submit-layer clamp (NOT applied in verify); exposed for settlement callers. */
export function clampSubmitScore(score: number): number {
  return Math.min(Math.max(0, score), MAX_SUBMITTABLE_SCORE);
}

/** Replay outcome: the raw tap count is the score. */
export interface ClickerReplay {
  score: number;
  taps: number;
}

/**
 * Pure replay: score = number of valid taps. Throws on a structurally invalid
 * tap (the verify wrapper turns that into a `{ valid:false }` result); callers
 * that have already validated the envelope can use this directly.
 */
export function replay(taps: MoveClicker[]): ClickerReplay {
  let prevT = -1;
  for (const tap of taps) {
    if (tap === null || typeof tap !== 'object' || Array.isArray(tap)) {
      throw new Error('tap_not_object');
    }
    const t = tap.t;
    if (t !== undefined) {
      if (!Number.isInteger(t) || t < 0 || t > SESSION_MS) throw new Error('tap_timestamp_invalid');
      if (t < prevT) throw new Error('taps_not_monotonic');
      prevT = t;
    }
  }
  return { score: taps.length, taps: taps.length };
}

/**
 * The clicker entry in the Δ6 adjudicator registry. The seed is accepted for
 * interface symmetry (and the cosmetic emoji) but does not affect the score.
 *
 * Contract: validate the `MoveRecord` envelope (reject null/malformed), then
 * validate each tap (object; optional integer `t` in [0, SESSION_MS], monotonic
 * non-decreasing), then return `{ score: tapCount, valid:true }`. Raw count —
 * the submit-layer clamp is NOT applied here.
 */
export const engineClicker: GameEngine<MoveClicker> = {
  gameId: 'clicker',
  verify(_seed: string, log: MoveRecord<MoveClicker>[]): VerifyResult {
    const parsed = orderedMoves(log);
    if (!parsed.ok) return { score: 0, valid: false, reason: parsed.reason };
    try {
      const { score } = replay(parsed.moves);
      return { score, valid: true };
    } catch (e) {
      return { score: 0, valid: false, reason: (e as Error).message };
    }
  },
};

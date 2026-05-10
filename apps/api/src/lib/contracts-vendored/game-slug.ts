// ───────────────────────────────────────────────────────────────────────────
// gameSlug helper.
//
// ChallengeEscrow accepts any bytes32 for gameSlug — it's metadata only,
// no admin registration required. By convention each app derives its slug
// as keccak256(utf8("<name>")).
// ───────────────────────────────────────────────────────────────────────────

import { type Hex, keccak256, toBytes } from "viem";

/**
 * Derive a deterministic bytes32 gameSlug from a short name.
 * Browser-safe (viem's keccak256 is isomorphic).
 *
 * @example
 *   gameSlug("2048")   // 0x...
 *   gameSlug("wordle") // 0x...
 */
export function gameSlug(name: string): Hex {
  return keccak256(toBytes(name));
}

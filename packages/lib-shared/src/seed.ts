// ───────────────────────────────────────────────────────────────────────────
// Seed + on-chain id generators — SERVER-ONLY.
//
// Uses node:crypto for cryptographically strong randomness. Browser code
// must NOT import this module — use @skillbase/contracts' `match-id.ts`
// instead (client-safe via crypto.randomUUID + viem keccak256).
//
// Seed format for the game engine's deterministic RNG:
//   "0x" + 64 hex chars (32 bytes, lower-case).
//
// On-chain challenge id: bytes32 derived from the DB matchId (uuid v4) via
// keccak256. This gives the server a deterministic, debuggable mapping from
// the Supabase row to the contract's `challenges[id]` entry without a
// separate random draw. Using `keccak256(utf8Bytes(uuid))` is collision-safe
// for our scale and inspectable via any hex decoder.
// ───────────────────────────────────────────────────────────────────────────

import { randomBytes } from "node:crypto";
import { type Hex, keccak256, toHex } from "viem";

/**
 * Generate a cryptographically strong 32-byte seed.
 * Returns "0x" + 64 lowercase hex characters.
 */
export function generateSeed(): Hex {
  return toHex(randomBytes(32)) as Hex;
}

/**
 * Derive a deterministic bytes32 challenge id from a uuid v4 (our DB matchId).
 * Same matchId always produces the same on-chain id — useful for recovery
 * and for cross-referencing Supabase rows against contract state.
 */
export function bytes32FromUuid(uuid: string): Hex {
  // keccak256 of the UTF-8 bytes of the uuid string (including dashes).
  return keccak256(new TextEncoder().encode(uuid));
}

/**
 * Type-guard: does this string look like our seed / bytes32 format?
 * Used in request validation; not a cryptographic check.
 */
export function isBytes32Hex(value: unknown): value is Hex {
  return (
    typeof value === "string" && /^0x[0-9a-f]{64}$/i.test(value)
  );
}

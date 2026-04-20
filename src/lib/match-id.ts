/**
 * Client-safe helpers for generating a match's identifiers.
 *
 * Kept separate from src/lib/seed.ts because that module imports
 * `node:crypto` for server-side random bytes — pulling it into the
 * browser bundle would blow up webpack. This file uses only
 * `crypto.randomUUID()` (available in all modern browsers and Node 19+)
 * plus viem's isomorphic keccak256.
 */

import { type Hex, keccak256 } from "viem";

/** Generate a client-side uuid v4 to use as the match id. */
export function generateMatchId(): string {
  return crypto.randomUUID();
}

/**
 * Derive the deterministic bytes32 challenge id from a match uuid.
 * Must match the server's `bytes32FromUuid` in src/lib/seed.ts.
 */
export function bytes32FromUuid(uuid: string): Hex {
  return keccak256(new TextEncoder().encode(uuid));
}

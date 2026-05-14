import { gameSlug } from './contracts-vendored/game-slug.js';

// Known game slugs in the SkillOS monorepo. The on-chain `game` field is
// keccak256(utf8(name)) — irreversible — so we maintain a static reverse map
// and fall back to the raw hex when a slug isn't in this list.
export const KNOWN_GAMES = [
  '2048',
  'wordle',
  'sudoku',
  'minesweeper',
  'clicker',
  'match3',
] as const;
export type KnownGame = (typeof KNOWN_GAMES)[number];

const SLUG_TO_NAME = new Map<string, string>(
  KNOWN_GAMES.map((name) => [gameSlug(name).toLowerCase(), name]),
);

export const decodeGame = (bytes32: `0x${string}`): string =>
  SLUG_TO_NAME.get(bytes32.toLowerCase()) ?? bytes32;

// ─── Builder Codes (X10) ───────────────────────────────────────────────────

/**
 * Per-game Builder Codes for ERC-8021 dataSuffix attribution on Path A
 * (server-side agent submit) submissions. These attribute on-chain Path A
 * traffic to the per-game Builder Code, mirroring the client-side W1+W2
 * attribution that wagmi `dataSuffix` capability provides for SIWB-bearer
 * human users.
 *
 * X10 sprint closure (PR #82). Pre-X10 the server-side submit path attached
 * NO dataSuffix → minimum ABI-encoded calldata = 712 hex chars, attribution
 * gap proven by tx 0x18446ccf... (Phase D Step 3 retry, score 784, raw
 * calldata 712 hex). Post-X10: 712 + 22 = 734 hex chars with a trailing
 * ASCII-encoded "bc_xxxxxxxx" identifier (11 chars × 2 = 22 hex bytes).
 *
 * Why the codes live here (vs @skillos/sdk): apps/api avoids the SDK
 * workspace dep to keep the public API package surface decoupled from
 * client-SDK churn. The SDK has its own client-side copy for SIWB flows;
 * this is the server-side authoritative map. Both must agree.
 */
export const BUILDER_CODES: Record<KnownGame, string> = {
  '2048': 'bc_o6szuvg1',
  wordle: 'bc_l0drfg77',
  sudoku: 'bc_ixx8hzql',
  minesweeper: 'bc_6gsgkv5q',
  clicker: 'bc_m59xxykm',
  match3: 'bc_iqoz78rc',
} as const;

/**
 * Encode a Builder Code as a `0x`-prefixed ASCII-hex `dataSuffix` for
 * viem's `writeContract`. The suffix is appended to the standard ABI
 * calldata; the contract ignores the tail bytes (they're invisible at the
 * EVM execution level but visible in tx.input for off-chain indexers).
 *
 * Equivalent to `@skillos/sdk`'s `builderCodeToDataSuffix` — kept inline
 * here to avoid a public-API → SDK workspace dep. Update both together if
 * the encoding ever changes (it won't — ASCII hex is canonical ERC-8021).
 */
export function builderCodeToDataSuffix(code: string): `0x${string}` {
  const hex = Array.from(code)
    .map((ch) => ch.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('');
  return `0x${hex}` as `0x${string}`;
}

/**
 * Resolve the `dataSuffix` for a Path A (server-side) submit given the
 * game slug from the request body. Returns the encoded `0x`-prefixed hex
 * suffix; throws if the game isn't in `KNOWN_GAMES` (caller should
 * validate via Zod enum first).
 */
export function dataSuffixForGame(game: KnownGame): `0x${string}` {
  const code = BUILDER_CODES[game];
  if (!code) {
    throw new Error(`No Builder Code registered for game: ${game}`);
  }
  return builderCodeToDataSuffix(code);
}

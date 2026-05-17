// ───────────────────────────────────────────────────────────────────────────
// Per-game Builder Codes for ERC-8021 dataSuffix attribution.
//
// Server-authoritative map for the on-chain attribution tail that wagmi's
// `dataSuffix` capability appends to writeContract calldata. The contract
// ignores these trailing bytes (invisible at EVM execution); off-chain
// indexers (Blockscout, Base App store) parse the ASCII tail to credit
// per-game Builder Codes.
//
// Pre-X10  → 712 hex chars (minimum ABI encoding of submitSoloScore(7 args))
// Post-X10 → 712 + 22 = 734 hex chars (ASCII-encoded "bc_xxxxxxxx", 11 chars
//            × 2 hex digits/char = 22 hex bytes)
//
// Origin: apps/api/src/lib/games.ts (X10 PR #82). Promoted here in X10b so
// that packages/duel-backend (human submit path) can share the single source
// of truth with apps/api (agent submit path) — without forcing apps/api to
// take a workspace dep on @skillos/sdk (the X10-original duplication
// motivation, preserved). @skillos/contracts is infra (ABIs + addresses +
// game-slug helpers) and is already a clean dep for both apps/api and
// packages/duel-backend, so collapsing the server-side duplication here
// does not violate the X10 sdk/api decoupling boundary.
//
// The @skillos/sdk client-side copy remains intentionally separate; both
// must agree.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Canonical set of game slugs that carry a Builder Code for server-side
 * attribution. Subset of all possible on-chain gameSlug values — only
 * games with a tournament submit path appear here.
 */
export const BUILDER_CODE_GAMES = [
  "2048",
  "wordle",
  "sudoku",
  "minesweeper",
  "clicker",
  "match3",
] as const;
export type BuilderCodeGame = (typeof BUILDER_CODE_GAMES)[number];

/**
 * Canonical per-game Builder Code map. Values are pinned to the X10 task
 * spec; any change here must land in lockstep with the on-chain attribution
 * indexer + Base App store mapping.
 */
export const BUILDER_CODES: Record<BuilderCodeGame, string> = {
  "2048": "bc_o6szuvg1",
  wordle: "bc_l0drfg77",
  sudoku: "bc_ixx8hzql",
  minesweeper: "bc_6gsgkv5q",
  clicker: "bc_m59xxykm",
  match3: "bc_iqoz78rc",
} as const;

/**
 * Encode a Builder Code as a `0x`-prefixed ASCII-hex `dataSuffix` for
 * viem's `writeContract`. ASCII hex is the canonical ERC-8021 encoding.
 */
export function builderCodeToDataSuffix(code: string): `0x${string}` {
  const hex = Array.from(code)
    .map((ch) => ch.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("");
  return `0x${hex}` as `0x${string}`;
}

/**
 * Resolve the `dataSuffix` for a server-side submit given the game slug.
 * Throws if the game isn't in `BUILDER_CODE_GAMES` (caller should validate
 * via the type system or a Zod enum first).
 */
export function dataSuffixForGame(game: BuilderCodeGame): `0x${string}` {
  const code = BUILDER_CODES[game];
  if (!code) {
    throw new Error(`No Builder Code registered for game: ${game}`);
  }
  return builderCodeToDataSuffix(code);
}

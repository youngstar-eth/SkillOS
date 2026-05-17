// Run with: npx tsx --test packages/contracts/test/builder-codes.test.ts
//
// ─── X10b canonical Builder Code surface tests ─────────────────────────────
//
// Pins the @skillos/contracts authoritative copy of BUILDER_CODES + the
// ERC-8021 ASCII-hex encoder. Mirrors apps/api/test/games.test.ts (X10)
// against the same pinned values — drift between the two server-side
// copies is caught by both test files failing with conflicting expectations.
//
// X10b promoted these constants to @skillos/contracts so the human submit
// path (packages/duel-backend) shares the canonical map. apps/api keeps an
// inline copy to preserve deploy-bundle hygiene (no @skillos/contracts
// workspace dep). @skillos/sdk keeps a third client-side copy. All three
// must agree.
//
// Convention: node:test + node:assert/strict, matches duel-backend test
// files (see CI workflow `test-ts` job).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BUILDER_CODES,
  BUILDER_CODE_GAMES,
  type BuilderCodeGame,
  builderCodeToDataSuffix,
  dataSuffixForGame,
} from "../src/builder-codes";

// ─── BUILDER_CODES map ─────────────────────────────────────────────────────

test("BUILDER_CODES: covers all 6 BUILDER_CODE_GAMES", () => {
  for (const game of BUILDER_CODE_GAMES) {
    assert.ok(BUILDER_CODES[game], `Missing Builder Code for game: ${game}`);
  }
  assert.equal(
    Object.keys(BUILDER_CODES).length,
    BUILDER_CODE_GAMES.length,
  );
});

test("BUILDER_CODES: every code matches bc_xxxxxxxx (11 chars total)", () => {
  for (const [game, code] of Object.entries(BUILDER_CODES)) {
    assert.match(
      code,
      /^bc_[a-z0-9]{8}$/,
      `Builder Code for ${game} doesn't match bc_<8 alnum>: ${code}`,
    );
    assert.equal(code.length, 11, `Code "${code}" not 11 chars`);
  }
});

test("BUILDER_CODES: canonical map values pinned (regression guard)", () => {
  // Pin matches apps/api/test/games.test.ts (X10) + @skillos/sdk client
  // copy. Any change here must land in lockstep with the other two
  // server-side copies + the on-chain attribution indexer + Base App
  // store mapping. The duplication is intentional (deploy-bundle hygiene
  // for apps/api, client decoupling for sdk); the pin-test cross-check is
  // the guard against silent drift.
  assert.equal(BUILDER_CODES["2048"], "bc_o6szuvg1");
  assert.equal(BUILDER_CODES.wordle, "bc_l0drfg77");
  assert.equal(BUILDER_CODES.sudoku, "bc_ixx8hzql");
  assert.equal(BUILDER_CODES.minesweeper, "bc_6gsgkv5q");
  assert.equal(BUILDER_CODES.clicker, "bc_m59xxykm");
  assert.equal(BUILDER_CODES.match3, "bc_iqoz78rc");
});

// ─── builderCodeToDataSuffix encoder ───────────────────────────────────────

test("builderCodeToDataSuffix: clicker bc_m59xxykm encodes to 22-hex-char ASCII tail", () => {
  const suffix = builderCodeToDataSuffix("bc_m59xxykm");
  // ASCII bytes: b=0x62, c=0x63, _=0x5f, m=0x6d, 5=0x35, 9=0x39,
  // x=0x78, x=0x78, y=0x79, k=0x6b, m=0x6d
  assert.equal(suffix, "0x62635f6d35397878796b6d");
  // 11 chars × 2 hex digits/char = 22 hex chars + '0x' prefix = 24 total
  assert.equal(suffix.length, 24);
});

test("builderCodeToDataSuffix: 2048 bc_o6szuvg1 encodes deterministically", () => {
  // ASCII: b=0x62, c=0x63, _=0x5f, o=0x6f, 6=0x36, s=0x73,
  // z=0x7a, u=0x75, v=0x76, g=0x67, 1=0x31
  assert.equal(
    builderCodeToDataSuffix("bc_o6szuvg1"),
    "0x62635f6f36737a75766731",
  );
});

test("builderCodeToDataSuffix: every BUILDER_CODE_GAMES code produces a valid 22-hex suffix", () => {
  for (const game of BUILDER_CODE_GAMES) {
    const suffix = builderCodeToDataSuffix(BUILDER_CODES[game]);
    assert.match(
      suffix,
      /^0x[0-9a-f]{22}$/,
      `Suffix for ${game} not 22-hex: ${suffix}`,
    );
  }
});

// ─── dataSuffixForGame resolver ────────────────────────────────────────────

test("dataSuffixForGame: clicker → bc_m59xxykm hex tail", () => {
  assert.equal(dataSuffixForGame("clicker"), "0x62635f6d35397878796b6d");
});

test("dataSuffixForGame: all 6 games resolve without throw", () => {
  for (const game of BUILDER_CODE_GAMES) {
    assert.doesNotThrow(() => dataSuffixForGame(game as BuilderCodeGame));
  }
});

// ─── ERC-8021 calldata-tail invariants ─────────────────────────────────────

test("calldata tail length invariant: 712 (ABI) + 22 (suffix) = 734 hex chars expected", () => {
  // Reference: Phase D Step 3 retry tx 0x18446ccf... had raw calldata
  // 712 hex chars = minimum ABI encoding of submitSoloScore(7 args).
  // Post-X10 (Path A / agent) + X10b (human path via packages/duel-backend)
  // both produce 712 + 22 = 734 hex chars. Chain verification uses this
  // invariant to confirm the dataSuffix landed.
  const ABI_HEX_LEN = 712;
  const SUFFIX_HEX_LEN = 22;
  const EXPECTED_TOTAL = ABI_HEX_LEN + SUFFIX_HEX_LEN;
  assert.equal(EXPECTED_TOTAL, 734);
  for (const game of BUILDER_CODE_GAMES) {
    const suffix = dataSuffixForGame(game as BuilderCodeGame);
    // -2 for the '0x' prefix to count only hex chars
    assert.equal(suffix.length - 2, SUFFIX_HEX_LEN);
  }
});

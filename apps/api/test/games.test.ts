// Run with: npx tsx --test apps/api/test/games.test.ts
//
// ─── X10 server-side dataSuffix attribution tests ──────────────────────────
//
// Verifies the per-game Builder Code resolution + ERC-8021 ASCII-hex
// encoding for Path A (server-side agent submit) attribution. Tests pin
// the canonical bc_xxxxxxxx → hex mapping and the calldata-tail length
// invariant that Blockscout / on-chain attribution indexers expect.
//
// Convention: node:test + node:assert/strict, matches the duel-backend
// test files (see CI workflow `test-ts` job).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILDER_CODES,
  KNOWN_GAMES,
  builderCodeToDataSuffix,
  dataSuffixForGame,
  type KnownGame,
} from '../src/lib/games.js';

// ─── BUILDER_CODES map ─────────────────────────────────────────────────────

test('BUILDER_CODES: covers all 6 KNOWN_GAMES', () => {
  for (const game of KNOWN_GAMES) {
    assert.ok(
      BUILDER_CODES[game],
      `Missing Builder Code for game: ${game}`,
    );
  }
  assert.equal(Object.keys(BUILDER_CODES).length, KNOWN_GAMES.length);
});

test('BUILDER_CODES: every code matches bc_xxxxxxxx (11 chars total)', () => {
  for (const [game, code] of Object.entries(BUILDER_CODES)) {
    assert.match(
      code,
      /^bc_[a-z0-9]{8}$/,
      `Builder Code for ${game} doesn't match bc_<8 alnum>: ${code}`,
    );
    assert.equal(code.length, 11, `Code "${code}" not 11 chars`);
  }
});

test('BUILDER_CODES: canonical map values pinned (regression guard)', () => {
  // Pin the exact values from the X10 task spec. If any of these change,
  // the on-chain attribution indexer + Base App store mapping break.
  // Update intentionally and in lockstep with the indexer config.
  assert.equal(BUILDER_CODES['2048'], 'bc_o6szuvg1');
  assert.equal(BUILDER_CODES.wordle, 'bc_l0drfg77');
  assert.equal(BUILDER_CODES.sudoku, 'bc_ixx8hzql');
  assert.equal(BUILDER_CODES.minesweeper, 'bc_6gsgkv5q');
  assert.equal(BUILDER_CODES.clicker, 'bc_m59xxykm');
  assert.equal(BUILDER_CODES.match3, 'bc_iqoz78rc');
});

// ─── builderCodeToDataSuffix encoder ───────────────────────────────────────

test('builderCodeToDataSuffix: clicker bc_m59xxykm encodes to 22-hex-char ASCII tail', () => {
  const suffix = builderCodeToDataSuffix('bc_m59xxykm');
  // ASCII bytes: b=0x62, c=0x63, _=0x5f, m=0x6d, 5=0x35, 9=0x39,
  // x=0x78, x=0x78, y=0x79, k=0x6b, m=0x6d
  assert.equal(suffix, '0x62635f6d35397878796b6d');
  // 11 chars × 2 hex digits/char = 22 hex chars + '0x' prefix = 24 total
  assert.equal(suffix.length, 24);
});

test('builderCodeToDataSuffix: 2048 bc_o6szuvg1 encodes deterministically', () => {
  // ASCII: b=0x62, c=0x63, _=0x5f, o=0x6f, 6=0x36, s=0x73,
  // z=0x7a, u=0x75, v=0x76, g=0x67, 1=0x31
  assert.equal(
    builderCodeToDataSuffix('bc_o6szuvg1'),
    '0x62635f6f36737a75766731',
  );
});

test('builderCodeToDataSuffix: every KNOWN_GAMES code produces a valid 22-hex suffix', () => {
  for (const game of KNOWN_GAMES) {
    const suffix = builderCodeToDataSuffix(BUILDER_CODES[game]);
    assert.match(
      suffix,
      /^0x[0-9a-f]{22}$/,
      `Suffix for ${game} not 22-hex: ${suffix}`,
    );
  }
});

// ─── dataSuffixForGame resolver ────────────────────────────────────────────

test('dataSuffixForGame: clicker → bc_m59xxykm hex tail', () => {
  assert.equal(dataSuffixForGame('clicker'), '0x62635f6d35397878796b6d');
});

test('dataSuffixForGame: all 6 games resolve without throw', () => {
  for (const game of KNOWN_GAMES) {
    assert.doesNotThrow(() => dataSuffixForGame(game as KnownGame));
  }
});

// ─── ERC-8021 calldata-tail invariants ─────────────────────────────────────

test('calldata tail length invariant: 712 (ABI) + 22 (suffix) = 734 hex chars expected', () => {
  // Reference: Phase D Step 3 retry tx 0x18446ccf... had raw calldata
  // 712 hex chars = minimum ABI encoding of submitSoloScore(7 args). Path A
  // post-X10 produces 712 + 22 = 734 hex chars. The verification step in
  // X10 Phase D uses this invariant to confirm dataSuffix landed on-chain.
  const ABI_HEX_LEN = 712;
  const SUFFIX_HEX_LEN = 22;
  const EXPECTED_TOTAL = ABI_HEX_LEN + SUFFIX_HEX_LEN;
  assert.equal(EXPECTED_TOTAL, 734);
  // Sanity-check that an actual suffix matches the expected length contribution
  for (const game of KNOWN_GAMES) {
    const suffix = dataSuffixForGame(game as KnownGame);
    // -2 for the '0x' prefix to count only hex chars
    assert.equal(suffix.length - 2, SUFFIX_HEX_LEN);
  }
});

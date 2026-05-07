// Run with: npx tsx --test packages/ui/test/duel-result-branch.test.ts
//
// Pure-function unit test for the DuelResultCard branch selector.
// packages/ui has no RTL setup as of this PR (per directives, RTL is not
// added as a devDep in this PR). Coverage is structural only:
//   - the pure helper is import-reachable
//   - all four branches resolve as documented
//
// The render shell of DuelResultCard.tsx itself is not exercised here;
// that lands when v2.2 wiring replaces <DuelComingSoon /> in each app.

import { test } from "node:test";
import assert from "node:assert/strict";
import { getAddress, type Address } from "viem";
import { selectDuelResultBranch } from "../src/duel-result-branch";

const P1 = getAddress("0x000000000000000000000000000000000000cafe") as Address;
const P2 = getAddress("0x000000000000000000000000000000000000beef") as Address;

test("pending — non-terminal status (player1_submitted)", () => {
  const b = selectDuelResultBranch({
    status: "player1_submitted",
    winnerAddress: null,
    viewerAddress: P1,
  });
  assert.equal(b, "pending");
});

test("pending — non-terminal status (matched)", () => {
  const b = selectDuelResultBranch({
    status: "matched",
    winnerAddress: null,
    viewerAddress: P1,
  });
  assert.equal(b, "pending");
});

test("void — settled with null winner (lie-state safety branch)", () => {
  const b = selectDuelResultBranch({
    status: "settled",
    winnerAddress: null,
    viewerAddress: P1,
  });
  assert.equal(b, "void");
});

test("void — refunded status (expireAccepted dual-refund path)", () => {
  const b = selectDuelResultBranch({
    status: "refunded",
    winnerAddress: null,
    viewerAddress: P1,
  });
  assert.equal(b, "void");
});

test("win — viewer is on-chain winner (checksum-equal)", () => {
  const b = selectDuelResultBranch({
    status: "settled",
    winnerAddress: P1,
    viewerAddress: P1,
  });
  assert.equal(b, "win");
});

test("win — viewer is on-chain winner (case-insensitive compare)", () => {
  const b = selectDuelResultBranch({
    status: "settled",
    winnerAddress: P1, // checksum
    viewerAddress: P1.toLowerCase() as Address, // raw lowercase
  });
  assert.equal(b, "win");
});

test("loss — winner set, viewer is not the winner", () => {
  const b = selectDuelResultBranch({
    status: "settled",
    winnerAddress: P2,
    viewerAddress: P1,
  });
  assert.equal(b, "loss");
});

test("loss — disconnected viewer (null) is treated as non-winner", () => {
  const b = selectDuelResultBranch({
    status: "settled",
    winnerAddress: P2,
    viewerAddress: null,
  });
  assert.equal(b, "loss");
});

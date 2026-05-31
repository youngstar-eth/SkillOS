import { test } from "node:test";
import assert from "node:assert/strict";
import type { Move2048 } from "@skillos/engines";
import { commitSeed, resolveClaim, toInputLog } from "./resolver";

const SEED = "replay-determinism";
const GOLDEN_MOVES: Move2048[] = [
  "left", "down", "right", "up", "left", "left", "down",
];

test("commitSeed matches the on-chain SEED_COMMIT", () => {
  assert.equal(
    commitSeed(SEED),
    "0x3d73a8824f5363670690e631fd24e631cf7bca266a6eb0871afc58b7ed16420d",
  );
});

test("honest claim (20) replays to 20 and is not fraud", () => {
  const v = resolveClaim({
    seed: SEED,
    inputLog: toInputLog(GOLDEN_MOVES),
    claimedScore: 20,
  });
  assert.equal(v.replayedScore, 20);
  assert.equal(v.engineValid, true);
  assert.equal(v.fraud, false);
});

test("fraudulent claim (9999) replays to 20 and is fraud", () => {
  const v = resolveClaim({
    seed: SEED,
    inputLog: toInputLog(GOLDEN_MOVES),
    claimedScore: 9999,
  });
  assert.equal(v.replayedScore, 20);
  assert.equal(v.engineValid, true);
  assert.equal(v.fraud, true);
});

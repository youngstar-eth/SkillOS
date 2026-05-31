// Faz-0 — static, on-chain-anchored facts for the challenge-evidence page.
//
// These are a CONVENIENCE SUMMARY. The source of truth is the chain (linked to
// Blockscout below) + the public Δ6 engine (recomputed live via ./resolver).
// Every value here is independently verifiable; the page says so explicitly.
//
// Verbatim from docs/faz0/STAGE3-EVIDENCE.md (faz0-challenge-demo branch).
// SettlementDemo is a STANDALONE Faz-0 demo: not the v2.3 production settle,
// not the audit-#1 fix, NOT wired into the production settlement path.

import type { Move2048 } from "@skillos/engines";

export const CHAIN_ID = 84532; // Base Sepolia
export const BLOCKSCOUT = "https://base-sepolia.blockscout.com";

export const txUrl = (hash: string) => `${BLOCKSCOUT}/tx/${hash}`;
export const addressUrl = (addr: string) => `${BLOCKSCOUT}/address/${addr}`;

/** Honest label the demo earns — never "trustless". */
export const HONEST_LABEL =
  "economically-secured optimistic, deterministic-auditable";

export const CONTRACT = {
  name: "SettlementDemo",
  address: "0xD7323fCCa888793D5c92F006911DB06Af3CF8B1E",
  deployTx:
    "0xbd0cc98e8976bf79c0a5a321aea62708336732092a243fbf40fd69d943f4f522",
} as const;

export const ROLES = {
  // A — deployer / owner / claimer
  owner: "0x3a4F9eB7fBa1A0015a6F070259F3B9E883d95EEe",
  // B — resolver (distinct EOA, enforced on-chain)
  resolver: "0xA24f9122568e98b72f4dDD61119C7D92D0975692",
  // C — challenger
  challenger: "0x724fCfeE408e0f05068feD0Bb5d1245EDd3a16F5",
} as const;

/** The committed seed + 7-move golden vector that replays to 20. */
export const GOLDEN = {
  seed: "replay-determinism",
  seedCommit:
    "0x3d73a8824f5363670690e631fd24e631cf7bca266a6eb0871afc58b7ed16420d",
  moves: ["left", "down", "right", "up", "left", "left", "down"] as Move2048[],
  score: 20,
} as const;

export const HONEST_LOOP = {
  arena: "0x6c2f124c131d1579ef93323facb395b286e5a62f3273bf0d51a3e9451becd75d",
  claim: "0x52054c761ca2750eaf8204d830c4eb5d1848a83ff634b5f1c833ee7352ca7a14",
  claimedScore: 20,
  finalizeTx:
    "0xc3653355d35d90b1912b77ae984cafa4d07d436b63562a25c12cdd91de1dfc39",
  finalState: "Finalized (3)",
  creditedScore: 20,
} as const;

export const FRAUD_LOOP = {
  arena: "0xf29c596bf664b2649bc001b7ffccc0d15f70696958ee63fa6b936d5f055195bc",
  claim: "0xc33692cc5c01a5a81c829bb0e3325a8ea0b1c180435da0ab35e9550a9a2dca10",
  claimedScore: 9999,
  challengeTx:
    "0x7ab769d66c37369494b25016d6bb9f733f3300c41a910f3ca5eeab3110377f8c",
  resolveTx:
    "0xc40372614aa656f5d2407464fc91f54daa2e3cf98508787197992538b20ae2fb",
  finalState: "ResolvedFraud (5)",
  creditedScore: 0,
  decodedEvent: {
    fraud: true,
    replayedScore: 20,
    claimedScore: 9999,
    slashed: "0x3a4F9eB7fBa1A0015a6F070259F3B9E883d95EEe", // A
    rewarded: "0x724fCfeE408e0f05068feD0Bb5d1245EDd3a16F5", // C
    pot: "200000000000000", // 2 × 0.0001 ETH
  },
} as const;

/** Full ordered tx trail (10 txs) — for the "verify it yourself" table. */
export const ALL_TXS: ReadonlyArray<{
  step: string;
  signer: "A" | "B" | "C";
  hash: string;
}> = [
  { step: "deploy SettlementDemo", signer: "A", hash: CONTRACT.deployTx },
  { step: "createArena (honest)", signer: "A", hash: "0x6193a2a98e747003c14d8bc3b9a3b5b7d776d6d2b99430127317b3a256dcb61c" },
  { step: "revealSeed (honest)", signer: "A", hash: "0xe64604cdb3bf58fe351ed39f6dda61506f9bd1d45f0ef5320f893a4454097583" },
  { step: "submitClaim 20 (honest)", signer: "A", hash: "0xde2984f1ca924c2bea449d9a7263ee24e0d26bcbf7d1f78208f300d5be03c714" },
  { step: "createArena (fraud)", signer: "A", hash: "0xeb1231c9522e891040b46cbd8024bc989ef80393bb67782e01b50e779c8ad18b" },
  { step: "revealSeed (fraud)", signer: "A", hash: "0xe2d6e47d1ad5fb6df89c1af014a0853cf6114c1b09ef90046700679a3216019c" },
  { step: "submitClaim 9999 (fraud)", signer: "A", hash: "0x40e8b7e2e337d3a0880080466b9a7db38f735316b196992c85e10c3efa47bd2f" },
  { step: "challenge (fraud)", signer: "C", hash: FRAUD_LOOP.challengeTx },
  { step: "resolve → slash (fraud)", signer: "B", hash: FRAUD_LOOP.resolveTx },
  { step: "finalize → credit (honest)", signer: "A", hash: HONEST_LOOP.finalizeTx },
];

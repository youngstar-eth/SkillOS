// ───────────────────────────────────────────────────────────────────────────
// ChallengeEscrow chain + address + timing constants.
//
// On gameSlug: ChallengeEscrow does NOT validate gameSlug — it's pure
// metadata stored in the Challenge struct and emitted in ChallengeCreated.
// Any bytes32 is accepted, no admin `registerGame` tx is required before
// first use.
//
// Settle signature digest is:
//   keccak256(abi.encode(id, winner, creatorScore, challengerScore,
//                        contractAddress, chainId))
// wrapped with "\x19Ethereum Signed Message:\n32" (EIP-191 / personal_sign).
//
// NOTE: STUDIO_PRIVATE_KEY (server env) MUST correspond to the
// `trustedSigner` address set on the deployed ChallengeEscrow, otherwise
// settle() reverts with BadSignature.
// ───────────────────────────────────────────────────────────────────────────

import type { Address } from "viem";

// ─── Chain + addresses ─────────────────────────────────────────────────────

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 84532);

export const CHALLENGE_ESCROW_ADDRESS = (process.env
  .NEXT_PUBLIC_CHALLENGE_ESCROW_ADDRESS ??
  "0x52e5E45456DeC882048b430a968Cda6061575be0") as Address;

// F4 TournamentPool v1 (duel-gated submit) — Base Sepolia.
// Preserved for rollback only; no new code paths should route here.
// All active flows target TOURNAMENT_POOL_V2_ADDRESS.
export const TOURNAMENT_POOL_ADDRESS = (process.env
  .NEXT_PUBLIC_TOURNAMENT_POOL_ADDRESS ??
  "0xc5d13168908E29496B7C5072b08d06C2c65290F8") as Address;

// TournamentPool v2.1 (drop-in superset of v2.0) — Base Sepolia, deployed 2026-04-29.
// Adds permissionless fundPrizePool() + PrizePoolFunded event; storage layout
// binary-identical to v2.0. Migrated stack default 2026-05-02 (post-sponsor-flow fix).
// Architectural invariant: retry fees (feeCollected) isolated from prize pool.
// submitSoloScore() enforces feePaidByPlayer ≥ priorSoloCount·RETRY_FEE on-chain.
// Basescan: https://sepolia.basescan.org/address/0x52049b812780134d2F69D6c20C2ef881D49702da
// Constant kept as TOURNAMENT_POOL_V2_ADDRESS for now (rename = post-YC backlog).
// Legacy v2.0 (0x5CadD5557B7e5182216E4d7c50B35495D93aA9d1) holds in-flight tournaments
// only; no new code paths route there.
export const TOURNAMENT_POOL_V2_ADDRESS = (process.env
  .NEXT_PUBLIC_TOURNAMENT_POOL_V2_ADDRESS ??
  "0x52049b812780134d2F69D6c20C2ef881D49702da") as Address;

export const USDC_ADDRESS = (process.env.NEXT_PUBLIC_USDC_ADDRESS ??
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e") as Address;

// ─── V2 demo constants ─────────────────────────────────────────────────────

/** Fixed stake for V2 demo: 1 USDC (6 decimals). */
export const STAKE_AMOUNT = 1_000_000n;

/** Single on-chain expiry covers queue wait + play window + buffer. */
export const CHALLENGE_DURATION_SECONDS = 600n;

/** Server/client-side target for queue wait before P1 may call expireOpen. */
export const QUEUE_WAIT_BUDGET_MS = 5 * 60 * 1000;

/** Client-visible play window after matchedAt. */
export const PLAY_WINDOW_MS = 2 * 60 * 1000;

/** Extra server-side grace after PLAY_WINDOW_MS before walkover is legal. */
export const SUBMIT_GRACE_MS = 30 * 1000;

// ─── Tournaments v2 constants ──────────────────────────────────────────────

/** Retry fee per paid solo submission — 1 USDC (6 decimals). Matches contract RETRY_FEE. */
export const RETRY_FEE = 1_000_000n;

/** Match-count cap applied in on-chain effective score. Matches contract MATCH_COUNT_CAP. */
export const MATCH_COUNT_CAP = 10n;

// ─── F4.1 Permissionless Sponsor Pool — Base Sepolia, deployed 2026-04-29 ──

// TournamentPool v2.1 — adds permissionless fundPrizePool() entry point.
// New deployment, separate from the v2 above. Frontend tournament reads
// should target this address; legacy v2 left for any in-flight settlements.
export const TOURNAMENT_POOL_V21_ADDRESS = (process.env
  .NEXT_PUBLIC_TOURNAMENT_POOL_V21_ADDRESS ??
  "0x52049b812780134d2F69D6c20C2ef881D49702da") as Address;

// SponsorshipModule — sanctions-screened sponsor entry; mints SBT on success.
export const SPONSORSHIP_MODULE_ADDRESS = (process.env
  .NEXT_PUBLIC_SPONSORSHIP_MODULE_ADDRESS ??
  "0xD76670adB574A4C8D06dfF47127e7143d780ff87") as Address;

// SponsorReceiptSBT — ERC-5192 soulbound receipt minted to sponsor on each
// successful sponsorPool() call. tokenId monotonic from 1.
export const SPONSOR_RECEIPT_SBT_ADDRESS = (process.env
  .NEXT_PUBLIC_SPONSOR_RECEIPT_SBT_ADDRESS ??
  "0xCCC183c72D666A16E03bf38E8c2DFa8a68b2e768") as Address;

// MockSanctionsOracle (testnet only) — owner-curated blacklist. Mainnet
// swaps to Chainalysis at 0x40C57923924B5c5c5455c48D93317139ADDaC8fb.
export const SANCTIONS_ORACLE_ADDRESS = (process.env
  .NEXT_PUBLIC_SANCTIONS_ORACLE_ADDRESS ??
  "0x0CB38F0A0511aF07FC34A20DCaB9e2Fc8061B1CC") as Address;

// ─── SkillbaseAnchor (SP ledger snapshot anchoring) ─────────────────────────

/**
 * SkillbaseAnchor contract — Base Sepolia. Stores SHA-256 hashes of canonical
 * SP ledger snapshots, keyed by unix timestamp. Empty default (set via env
 * after deploy); cron route refuses to run without it (fail-loud is correct).
 */
export const SKILLBASE_ANCHOR_ADDRESS = (process.env
  .NEXT_PUBLIC_SKILLBASE_ANCHOR_ADDRESS ?? "") as Address;

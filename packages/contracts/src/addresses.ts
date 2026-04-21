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

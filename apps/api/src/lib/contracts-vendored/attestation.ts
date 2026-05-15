// Server-side attestation signing for TournamentPool v2.1 submitSoloScore.
//
// Mirrors packages/lib-shared/src/attestation.ts exactly — see note in
// ./README.md for why this file is vendored. Cleanup PR drops both copies.
//
// Digest format MUST match TournamentPool._verifySoloSubmitSignature
// byte-for-byte. Any field drift and submitSoloScore() reverts with
// BadSignature on-chain — the kind of bug that only shows up in production
// because contract reverts don't surface as TypeScript errors.

import {
  type Address,
  type Hex,
  encodeAbiParameters,
  keccak256,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { CHAIN_ID, TOURNAMENT_POOL_V21_ADDRESS } from './addresses.js';

let cachedAccount: ReturnType<typeof privateKeyToAccount> | null = null;

export function getSignerAccount() {
  if (cachedAccount) return cachedAccount;
  const key = process.env.STUDIO_PRIVATE_KEY;
  if (!key) throw new Error('STUDIO_PRIVATE_KEY is not set');
  const hex = (key.startsWith('0x') ? key : `0x${key}`) as Hex;
  cachedAccount = privateKeyToAccount(hex);
  return cachedAccount;
}

// X15.3 — the agent wallet that self-pays for paid retries (chargeRetryFee
// msg.sender == player constraint). Separate key from STUDIO_PRIVATE_KEY:
// studio continues to sign + broadcast submitSoloScore (D11), but the agent
// is the on-chain `player` and broadcasts chargeRetryFee itself (D1).
// Pre-X15.3 the studio wallet masqueraded as the agent on testnet; X15.3
// unwinds that masquerade so the wallet roles match the contract semantics.
let cachedAgentAccount: ReturnType<typeof privateKeyToAccount> | null = null;

export function getAgentAccount() {
  if (cachedAgentAccount) return cachedAgentAccount;
  const key = process.env.AGENT_PRIVATE_KEY;
  if (!key) throw new Error('AGENT_PRIVATE_KEY is not set');
  const hex = (key.startsWith('0x') ? key : `0x${key}`) as Hex;
  cachedAgentAccount = privateKeyToAccount(hex);
  return cachedAgentAccount;
}

/**
 * Build the tournament solo-submit digest (TournamentPool v2.1).
 *
 * Mirrors: keccak256(abi.encode(id, player, score, soloRunId, matchCountDelta,
 *                               nonce, address(this), block.chainid))
 * in TournamentPool._verifySoloSubmitSignature.
 *
 * The soloRunId discriminates submissions sharing the global usedNonces
 * map; nonces alone aren't unique-per-submission.
 */
export function buildSoloSubmitDigest(params: {
  tournamentId: Hex;
  player: Address;
  score: bigint;
  soloRunId: Hex;
  matchCountDelta: bigint;
  nonce: Hex;
}): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'bytes32' },
        { type: 'address' },
        { type: 'uint256' },
        { type: 'bytes32' },
        { type: 'uint256' },
        { type: 'bytes32' },
        { type: 'address' },
        { type: 'uint256' },
      ],
      [
        params.tournamentId,
        params.player,
        params.score,
        params.soloRunId,
        params.matchCountDelta,
        params.nonce,
        TOURNAMENT_POOL_V21_ADDRESS,
        BigInt(CHAIN_ID),
      ],
    ),
  );
}

/** Sign a raw digest with EIP-191 personal_sign prefix. */
export async function signDigest(digest: Hex): Promise<Hex> {
  const account = getSignerAccount();
  return account.signMessage({ message: { raw: digest } });
}

export async function signSoloSubmitAttestation(params: {
  tournamentId: Hex;
  player: Address;
  score: bigint;
  soloRunId: Hex;
  matchCountDelta: bigint;
  nonce: Hex;
}): Promise<Hex> {
  return signDigest(buildSoloSubmitDigest(params));
}

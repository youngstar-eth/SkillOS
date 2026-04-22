// ───────────────────────────────────────────────────────────────────────────
// Server-side settle + walkover attestations.
//
// Both digests mirror ChallengeEscrow._verifySettleSignature /
// _verifyWalkoverSignature exactly — any drift and settle() reverts with
// BadSignature. Signatures are EIP-191 (personal_sign) — viem's signMessage
// with `{ raw: digest }` applies the "\x19Ethereum Signed Message:\n32"
// prefix for us.
//
// SECURITY: The signer's private key (STUDIO_PRIVATE_KEY) must match
// the address set as `trustedSigner` on the deployed escrow. A mismatch
// causes on-chain revert at settle time. This file is server-only — never
// import from a client component.
// ───────────────────────────────────────────────────────────────────────────

import {
  type Address,
  type Hex,
  encodeAbiParameters,
  keccak256,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  CHAIN_ID,
  CHALLENGE_ESCROW_ADDRESS,
  TOURNAMENT_POOL_ADDRESS,
} from "@skillbase/contracts";

function requireSignerAccount() {
  const key = process.env.STUDIO_PRIVATE_KEY;
  if (!key) throw new Error("STUDIO_PRIVATE_KEY is not set");
  const hex = (key.startsWith("0x") ? key : `0x${key}`) as Hex;
  return privateKeyToAccount(hex);
}

/** Lazy singleton so we don't parse the key on every invocation. */
let cachedAccount: ReturnType<typeof privateKeyToAccount> | null = null;
export function getSignerAccount() {
  if (!cachedAccount) cachedAccount = requireSignerAccount();
  return cachedAccount;
}

/**
 * Build the settle digest.
 * Mirrors: keccak256(abi.encode(id, winner, creatorScore, challengerScore,
 *                               address(this), block.chainid))
 */
export function buildSettleDigest(params: {
  challengeId: Hex;
  winner: Address;
  creatorScore: bigint;
  challengerScore: bigint;
}): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "address" },
        { type: "uint256" },
      ],
      [
        params.challengeId,
        params.winner,
        params.creatorScore,
        params.challengerScore,
        CHALLENGE_ESCROW_ADDRESS,
        BigInt(CHAIN_ID),
      ],
    ),
  );
}

/**
 * Build the walkover digest.
 * Mirrors: keccak256(abi.encode(id, winner, "walkover", address(this), block.chainid))
 */
export function buildWalkoverDigest(params: {
  challengeId: Hex;
  winner: Address;
}): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "address" },
        { type: "string" },
        { type: "address" },
        { type: "uint256" },
      ],
      [
        params.challengeId,
        params.winner,
        "walkover",
        CHALLENGE_ESCROW_ADDRESS,
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

export async function signSettleAttestation(params: {
  challengeId: Hex;
  winner: Address;
  creatorScore: bigint;
  challengerScore: bigint;
}): Promise<Hex> {
  return signDigest(buildSettleDigest(params));
}

export async function signWalkoverAttestation(params: {
  challengeId: Hex;
  winner: Address;
}): Promise<Hex> {
  return signDigest(buildWalkoverDigest(params));
}

/**
 * Build the tournament submit digest.
 * Mirrors: keccak256(abi.encode(id, player, score, matchCountDelta, nonce,
 *                               address(this), block.chainid))
 * in TournamentPool._verifySubmitSignature. Any field drift and submitScore
 * reverts with BadSignature.
 */
export function buildTournamentSubmitDigest(params: {
  tournamentId: Hex;
  player: Address;
  score: bigint;
  matchCountDelta: bigint;
  nonce: Hex;
}): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "address" },
        { type: "uint256" },
      ],
      [
        params.tournamentId,
        params.player,
        params.score,
        params.matchCountDelta,
        params.nonce,
        TOURNAMENT_POOL_ADDRESS,
        BigInt(CHAIN_ID),
      ],
    ),
  );
}

export async function signTournamentSubmitAttestation(params: {
  tournamentId: Hex;
  player: Address;
  score: bigint;
  matchCountDelta: bigint;
  nonce: Hex;
}): Promise<Hex> {
  return signDigest(buildTournamentSubmitDigest(params));
}

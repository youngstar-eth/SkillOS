/**
 * Server-side ECDSA attestation signing for ChallengeEscrow settlement.
 *
 * The server never holds or transfers funds — it only signs witness data
 * that the client then submits to the on-chain settle() / walkover()
 * functions. Digest construction MUST match ChallengeEscrow.sol exactly:
 *
 *   settle:   keccak256(abi.encode(id, winner, creatorScore, challengerScore,
 *                                  contractAddress, chainId))
 *   walkover: keccak256(abi.encode(id, winner, "walkover",
 *                                  contractAddress, chainId))
 *
 * The final signature is an eth_sign (prefix \x19Ethereum Signed Message:\n32)
 * — matches Solidity ECDSA.recover on the prefixed digest.
 *
 * Ported from ceos.run d4002e7 packages/shared/utils/challenge/sign-attestation.ts.
 */

import {
  encodeAbiParameters,
  keccak256,
  parseAbiParameters,
  toBytes,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

export interface SettleAttestationInput {
  challengeId: Hex;
  winner: Address;
  creatorScore: bigint;
  challengerScore: bigint;
  contractAddress: Address;
  chainId: bigint;
  signerPrivateKey: Hex;
}

export interface WalkoverAttestationInput {
  challengeId: Hex;
  winner: Address;
  contractAddress: Address;
  chainId: bigint;
  signerPrivateKey: Hex;
}

export interface AttestationResult {
  signature: Hex;
  signer: Address;
}

export async function signSettleAttestation(
  input: SettleAttestationInput,
): Promise<AttestationResult> {
  const {
    challengeId,
    winner,
    creatorScore,
    challengerScore,
    contractAddress,
    chainId,
    signerPrivateKey,
  } = input;

  const encoded = encodeAbiParameters(
    parseAbiParameters(
      "bytes32 id, address winner, uint256 creatorScore, uint256 challengerScore, address contractAddress, uint256 chainId",
    ),
    [challengeId, winner, creatorScore, challengerScore, contractAddress, chainId],
  );
  const digest = keccak256(encoded);

  const account = privateKeyToAccount(signerPrivateKey);
  const signature = await account.signMessage({
    message: { raw: toBytes(digest) },
  });
  return { signature, signer: account.address };
}

export async function signWalkoverAttestation(
  input: WalkoverAttestationInput,
): Promise<AttestationResult> {
  const { challengeId, winner, contractAddress, chainId, signerPrivateKey } = input;

  const encoded = encodeAbiParameters(
    parseAbiParameters(
      "bytes32 id, address winner, string label, address contractAddress, uint256 chainId",
    ),
    [challengeId, winner, "walkover", contractAddress, chainId],
  );
  const digest = keccak256(encoded);

  const account = privateKeyToAccount(signerPrivateKey);
  const signature = await account.signMessage({
    message: { raw: toBytes(digest) },
  });
  return { signature, signer: account.address };
}

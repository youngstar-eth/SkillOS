import { privateKeyToAccount } from "viem/accounts";
import { verifyTypedData, type Address, type Hex } from "viem";

/**
 * EIP-712 typed data schema for ArcadePool.submitScore(…).
 *
 * The contract MUST declare the identical EIP712Domain and `Score` struct
 * hash — any divergence breaks ecrecover. Treat this file as the canonical
 * source when deploying the Solidity contract.
 */
export const SCORE_PRIMARY_TYPE = "Score" as const;

export const SCORE_TYPES = {
  Score: [
    { name: "tournamentId", type: "uint256" },
    { name: "player", type: "address" },
    { name: "score", type: "uint256" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

export type ScoreMessage = {
  tournamentId: bigint;
  player: Address;
  score: bigint;
  nonce: bigint;
};

export type ScoreDomain = {
  name: "ArcadePool";
  version: "1";
  chainId: number;
  verifyingContract: Address;
};

export function getScoreDomain(
  chainId: number,
  verifyingContract: Address,
): ScoreDomain {
  return {
    name: "ArcadePool",
    version: "1",
    chainId,
    verifyingContract,
  };
}

/**
 * Deterministically map a session UUID to a uint256 nonce.
 * UUID v4 has 128 bits of entropy — fits in uint256 with zero-padding.
 */
export function uuidToNonce(sessionId: string): bigint {
  const hex = sessionId.replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/i.test(hex)) {
    throw new Error(`invalid session uuid: ${sessionId}`);
  }
  return BigInt("0x" + hex);
}

export type SignScoreInput = {
  sessionId: string;
  tournamentId: bigint;
  player: Address;
  score: bigint;
  chainId: number;
  contract: Address;
};

export type SignScoreOutput = {
  signature: Hex;
  nonce: bigint;
  signer: Address;
  message: ScoreMessage;
  domain: ScoreDomain;
};

/**
 * Sign a Score typed message using SCORE_SIGNER_PRIVATE_KEY.
 * This key is the only account the ArcadePool contract will trust as
 * an oracle — it must remain server-side.
 */
export async function signScore(
  input: SignScoreInput,
): Promise<SignScoreOutput> {
  const pk = process.env.SCORE_SIGNER_PRIVATE_KEY as Hex | undefined;
  if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) {
    throw new Error("SCORE_SIGNER_PRIVATE_KEY missing or malformed");
  }
  const account = privateKeyToAccount(pk);
  const domain = getScoreDomain(input.chainId, input.contract);
  const nonce = uuidToNonce(input.sessionId);
  const message: ScoreMessage = {
    tournamentId: input.tournamentId,
    player: input.player,
    score: input.score,
    nonce,
  };
  const signature = await account.signTypedData({
    domain,
    types: SCORE_TYPES,
    primaryType: SCORE_PRIMARY_TYPE,
    message,
  });
  return { signature, nonce, signer: account.address, message, domain };
}

/**
 * Off-chain pre-verification — mirrors what the contract will do on-chain.
 * Useful for unit tests and for surfacing signing bugs before gas is spent.
 */
export async function verifyScoreSignature(args: {
  signer: Address;
  chainId: number;
  contract: Address;
  message: ScoreMessage;
  signature: Hex;
}): Promise<boolean> {
  return verifyTypedData({
    address: args.signer,
    domain: getScoreDomain(args.chainId, args.contract),
    types: SCORE_TYPES,
    primaryType: SCORE_PRIMARY_TYPE,
    message: args.message,
    signature: args.signature,
  });
}

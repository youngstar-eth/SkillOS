// Lazy viem wallet/public client constructors + SIWA signer adapter.
//
// The wallet is built only when a tool actually needs it — the MCP server
// boots without a private key so read-only tools work on stock installs.
//
// `buildSiwaSigner` adapts a viem account to the library's ethers-shaped
// Signer interface (.getAddress() / .signMessage(string)). We don't supply
// signTransaction because we never use the library helpers that construct
// transactions — every on-chain write goes through viem.writeContract
// directly per the X4 brittleness lesson.

import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { base, baseSepolia } from 'viem/chains';
import type { SkillOSMcpConfig } from './config.js';

// Loose return type: viem's narrowed-by-chain client types are too deep for
// TS to serialize when re-exported (TS7056). The tools that consume this
// only need `writeContract` + `waitForTransactionReceipt` which both live
// on the structural `WalletClient` / `PublicClient` shapes.
export interface WalletBundle {
  account: PrivateKeyAccount;
  address: Address;
  publicClient: PublicClient;
  walletClient: WalletClient;
}

export function buildWallet(
  config: SkillOSMcpConfig & { privateKey: `0x${string}` },
): WalletBundle {
  const chain = config.chainId === 8453 ? base : baseSepolia;
  const account = privateKeyToAccount(config.privateKey);
  const transport = http(config.rpcUrl);

  // viem's chain-narrowed clients (Base / Base Sepolia include OP-stack
  // transaction types) don't structurally match the generic PublicClient /
  // WalletClient our WalletBundle exposes. The narrowing is irrelevant to
  // the methods we call (writeContract, waitForTransactionReceipt). Cast
  // through `unknown` to widen.
  const publicClient = createPublicClient({ chain, transport }) as unknown as PublicClient;
  const walletClient = createWalletClient({ account, chain, transport }) as unknown as WalletClient;

  return {
    account,
    address: account.address,
    publicClient,
    walletClient,
  };
}

// Minimal adapter that satisfies the @buildersgarden/siwa Signer interface
// for signing-only operations (signSIWAMessage, signAuthenticatedRequest).
//
// Library entry points use two distinct signing paths:
//   - SIWA flow (`signSIWAMessage`) calls `signer.signMessage(string)` —
//     signs the EIP-191 wrapping of the UTF-8 SIWA message template.
//   - ERC-8128 flow (`signAuthenticatedRequest` → `createErc8128Signer`)
//     calls `signer.signRawMessage(hex)` preferentially. The `hex` is the
//     hex encoding of the RFC 9421 signature-base BYTES; the verifier
//     reconstructs the same bytes and calls `verifyMessage({message:
//     {raw: hex}})`. If `signRawMessage` is missing, the adapter falls
//     back to `signer.signMessage(hex)` which would sign the UTF-8 of
//     the hex string — producing a signature that does NOT recover under
//     the verifier's raw-bytes view. That mismatch surfaced as
//     `/v1/agents/scores` returning 401 in X32-2 broadcast (PR #173).
//
// Both methods delegate to viem: `account.signMessage({ message })` for
// UTF-8 strings, `account.signMessage({ message: { raw: hex } })` for
// raw bytes.
export function buildSiwaSigner(account: PrivateKeyAccount): {
  getAddress: () => Promise<Address>;
  signMessage: (message: string) => Promise<Hex>;
  signRawMessage: (rawHex: `0x${string}`) => Promise<Hex>;
} {
  return {
    getAddress: async () => account.address,
    signMessage: async (message: string) => account.signMessage({ message }),
    signRawMessage: async (rawHex: `0x${string}`) =>
      account.signMessage({ message: { raw: rawHex } }),
  };
}

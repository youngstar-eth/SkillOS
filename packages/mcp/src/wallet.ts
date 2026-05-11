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
// Library expects `.getAddress(): Promise<string>` and `.signMessage(message:
// string): Promise<Hex>` — viem exposes `account.address` (property) and
// `account.signMessage({ message })` so we wrap.
export function buildSiwaSigner(account: PrivateKeyAccount): {
  getAddress: () => Promise<Address>;
  signMessage: (message: string) => Promise<Hex>;
} {
  return {
    getAddress: async () => account.address,
    signMessage: async (message: string) => account.signMessage({ message }),
  };
}

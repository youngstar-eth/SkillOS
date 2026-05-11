// Lazy viem wallet builder for CLI commands that need to sign or write.
//
// Mirrors @skillos/mcp's wallet module shape (same chain narrowing cast)
// so future code sharing through a shared `@skillos/cli-core` package
// becomes trivial.

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
import type { CliConfig } from './config.js';

export interface WalletBundle {
  account: PrivateKeyAccount;
  address: Address;
  publicClient: PublicClient;
  walletClient: WalletClient;
}

export function buildWallet(config: CliConfig & { privateKey: `0x${string}` }): WalletBundle {
  const chain = config.chainId === 8453 ? base : baseSepolia;
  const account = privateKeyToAccount(config.privateKey);
  const transport = http(config.rpcUrl);

  const publicClient = createPublicClient({ chain, transport }) as unknown as PublicClient;
  const walletClient = createWalletClient({ account, chain, transport }) as unknown as WalletClient;

  return {
    account,
    address: account.address,
    publicClient,
    walletClient,
  };
}

export function buildSiwaSigner(account: PrivateKeyAccount): {
  getAddress: () => Promise<Address>;
  signMessage: (message: string) => Promise<Hex>;
} {
  return {
    getAddress: async () => account.address,
    signMessage: async (message: string) => account.signMessage({ message }),
  };
}

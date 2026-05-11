// x402-aware paid fetcher for the /v1/data/* tier endpoints.
//
// `wrapAxiosWithPayment` intercepts 402 responses, signs an EIP-3009 USDC
// transfer authorization for the price quoted in the `PAYMENT-REQUIRED`
// header, then transparently retries with `PAYMENT-SIGNATURE`. Server-side
// the request looks like a single GET; client-side the signer's USDC
// balance funds the cost (Base Sepolia testnet, $0.01–$0.10 per call).
//
// Lazy-build: factory is invoked only when a paid tool is actually called,
// so a wallet-less MCP install never pays the @x402/axios setup cost.

import axios, { type AxiosInstance } from 'axios';
import { x402Client, wrapAxiosWithPayment } from '@x402/axios';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import type { PrivateKeyAccount } from 'viem/accounts';

export interface PaidFetcher {
  get<T = unknown>(path: string, params?: Record<string, unknown>): Promise<T>;
}

export function buildPaidFetcher(account: PrivateKeyAccount, baseUrl: string): PaidFetcher {
  const client = new x402Client();
  registerExactEvmScheme(client, { signer: account });

  const instance: AxiosInstance = wrapAxiosWithPayment(
    axios.create({ baseURL: baseUrl, timeout: 30_000 }),
    client,
  );

  return {
    async get<T = unknown>(path: string, params?: Record<string, unknown>): Promise<T> {
      const response = await instance.get<T>(path, params ? { params } : undefined);
      return response.data;
    },
  };
}

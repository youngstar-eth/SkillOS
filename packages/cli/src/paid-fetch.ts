// x402 paid fetcher for CLI `skillos data fetch` — same shape as
// @skillos/mcp's paid-fetch so consumers can reason about the same code
// path across the two surfaces.

import axios, { type AxiosInstance } from 'axios';
import { x402Client, wrapAxiosWithPayment } from '@x402/axios';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import type { PrivateKeyAccount } from 'viem/accounts';

export interface PaidFetcher {
  get<T = unknown>(path: string): Promise<T>;
}

export function buildPaidFetcher(account: PrivateKeyAccount, baseUrl: string): PaidFetcher {
  const client = new x402Client();
  registerExactEvmScheme(client, { signer: account });

  const instance: AxiosInstance = wrapAxiosWithPayment(
    axios.create({ baseURL: baseUrl, timeout: 30_000 }),
    client,
  );

  return {
    async get<T = unknown>(p: string): Promise<T> {
      const response = await instance.get<T>(p);
      return response.data;
    },
  };
}

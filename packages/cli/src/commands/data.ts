// `skillos data fetch <path>` — paid GET against a SkillOS data tier
// endpoint via x402. EIP-3009 USDC transfer authorization is signed by
// the configured wallet on Base Sepolia (testnet, free facilitator) or
// Base mainnet (CDP facilitator, $0.001/tx after 1k tx/month free tier).

import { defineCommand } from 'citty';
import { loadConfig, MissingWalletError } from '../config.js';
import { buildPaidFetcher } from '../paid-fetch.js';
import { buildWallet } from '../wallet.js';
import { fail, info, printJSON } from '../output.js';

const fetchCommand = defineCommand({
  meta: {
    name: 'fetch',
    description: 'Paid GET against /v1/data/* tier endpoints (x402).',
  },
  args: {
    path: {
      type: 'positional',
      description: 'Path or full URL (e.g. /v1/data/match-replay/0x… or /v1/data/cohort-snapshot).',
      required: true,
    },
    key: {
      type: 'string',
      description: 'Private key override.',
    },
    env: {
      type: 'enum',
      description: 'Environment override.',
      options: ['testnet', 'mainnet'],
    },
  },
  async run({ args }) {
    const config = loadConfig({ env: args.env, privateKey: args.key });
    if (!config.privateKey) throw new MissingWalletError();

    const wallet = buildWallet({ ...config, privateKey: config.privateKey });

    let path = args.path;
    if (path.startsWith('http://') || path.startsWith('https://')) {
      try {
        const url = new URL(path);
        if (`${url.protocol}//${url.host}` !== config.baseUrl) {
          fail(`URL host doesn't match configured baseUrl=${config.baseUrl}: ${path}`);
        }
        path = url.pathname + url.search;
      } catch {
        fail(`Invalid URL: ${path}`);
      }
    }
    if (!path.startsWith('/')) path = `/${path}`;

    info(`Paid GET ${config.baseUrl}${path}…`);
    const paid = buildPaidFetcher(wallet.account, config.baseUrl);
    const data = await paid.get(path);
    printJSON(data);
  },
});

export const dataCommand = defineCommand({
  meta: {
    name: 'data',
    description: 'x402-paywalled data tier access.',
  },
  subCommands: { fetch: fetchCommand },
});

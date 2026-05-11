// `skillos sponsor receipts` — list ERC-5192 SBT receipts owned by a wallet.

import { defineCommand } from 'citty';
import { createSkillOSClient } from '@skillos/sdk';
import { loadConfig } from '../config.js';
import { buildWallet } from '../wallet.js';
import { fail, printJSON } from '../output.js';

const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;

const receiptsCommand = defineCommand({
  meta: {
    name: 'receipts',
    description: 'Sponsor receipts (soulbound SBTs) owned by a wallet.',
  },
  args: {
    wallet: {
      type: 'positional',
      description: 'EVM wallet address (defaults to the configured wallet).',
      required: false,
    },
    limit: {
      type: 'string',
      description: 'Items per page (1-50). Defaults to 20.',
    },
    cursor: {
      type: 'string',
      description: 'Opaque cursor from a previous response.',
    },
    env: {
      type: 'enum',
      description: 'Environment override.',
      options: ['testnet', 'mainnet'],
    },
  },
  async run({ args }) {
    const config = loadConfig({ env: args.env });

    let wallet = args.wallet;
    if (!wallet) {
      if (!config.privateKey) {
        fail('Pass a wallet address as positional arg, or set SKILLOS_PRIVATE_KEY.');
      }
      wallet = buildWallet({ ...config, privateKey: config.privateKey }).address;
    } else if (!WALLET_RE.test(wallet)) {
      fail(`wallet must be 0x-prefixed 40-char hex, got ${wallet}`);
    }

    const limit = args.limit ? Number(args.limit) : undefined;
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 50)) {
      fail(`--limit must be 1..50`);
    }

    const sdk = createSkillOSClient({ env: config.env, baseUrl: config.baseUrl });
    const page = await sdk.sponsors.receipts(wallet as `0x${string}`, {
      ...(limit !== undefined ? { limit } : {}),
      ...(args.cursor ? { cursor: args.cursor } : {}),
    });
    printJSON(page);
  },
});

export const sponsorCommand = defineCommand({
  meta: {
    name: 'sponsor',
    description: 'Sponsor receipt queries.',
  },
  subCommands: { receipts: receiptsCommand },
});

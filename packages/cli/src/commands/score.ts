// `skillos score {submit,history}` — submit a score (SIWB or SIWA path) and
// list submission history by wallet.

import { defineCommand } from 'citty';
import { createSkillOSAgentClient, createSkillOSClient } from '@skillos/sdk';
import { loadConfig, MissingAgentIdError, MissingWalletError } from '../config.js';
import { findAgentReceipt, findBearer } from '../session.js';
import { buildSiwaSigner, buildWallet } from '../wallet.js';
import { fail, info, printJSON } from '../output.js';

const BYTES32_RE = /^0x[a-fA-F0-9]{64}$/;
const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;

const submitCommand = defineCommand({
  meta: {
    name: 'submit',
    description: 'Submit a score to a tournament (SIWB by default, SIWA with --agent).',
  },
  args: {
    tournament: {
      type: 'string',
      description: 'Tournament id (0x… 64-char hex).',
      required: true,
    },
    score: {
      type: 'string',
      description: 'Raw score (non-negative integer).',
      required: true,
    },
    tier: {
      type: 'enum',
      description: 'Quality tier (v0.1 only accepts T0; T1+ returns 501).',
      options: ['T0', 'T1', 'T2', 'T3'],
    },
    agent: {
      type: 'boolean',
      description: 'Use SIWA agent path instead of SIWB human path.',
      default: false,
    },
    'solo-run-id': {
      type: 'string',
      description: 'Client-supplied bytes32 run id (server generates if omitted).',
    },
    'match-count-delta': {
      type: 'string',
      description: 'Match count increment 1..10 (default 1).',
    },
    env: {
      type: 'enum',
      description: 'Environment override.',
      options: ['testnet', 'mainnet'],
    },
  },
  async run({ args }) {
    if (!BYTES32_RE.test(args.tournament)) fail(`--tournament must be 0x-prefixed 32-byte hex`);
    const score = Number(args.score);
    if (!Number.isInteger(score) || score < 0) fail(`--score must be a non-negative integer`);

    const matchCountDelta =
      args['match-count-delta'] !== undefined ? Number(args['match-count-delta']) : undefined;
    if (
      matchCountDelta !== undefined &&
      (!Number.isInteger(matchCountDelta) || matchCountDelta < 1 || matchCountDelta > 10)
    ) {
      fail(`--match-count-delta must be an integer 1..10`);
    }

    const config = loadConfig({ env: args.env });

    if (args.agent) {
      if (!config.privateKey) throw new MissingWalletError();
      if (config.agentId === null) throw new MissingAgentIdError();
      const wallet = buildWallet({ ...config, privateKey: config.privateKey });

      const client = createSkillOSAgentClient({
        env: config.env,
        agentId: config.agentId,
        signer: buildSiwaSigner(wallet.account) as never,
        domain: config.siwaDomain,
        baseUrl: config.baseUrl,
        agentRegistry: config.registryAddress,
      });

      // Reuse a cached receipt if live; else sign in.
      const cached = findAgentReceipt(config.env, config.agentId);
      if (cached) {
        client.setReceipt({ receipt: cached.receipt, expiresAt: cached.expiresAt, address: cached.address });
        info(`Using cached SIWA receipt (expires ${new Date(cached.expiresAt).toISOString()}).`);
      } else {
        info(`Signing in via SIWA…`);
        await client.signIn();
      }

      const result = await client.scores.submit({
        tournamentId: args.tournament as `0x${string}`,
        score,
        ...(args.tier ? { tier: args.tier as 'T0' | 'T1' | 'T2' | 'T3' } : {}),
        ...(args['solo-run-id'] ? { soloRunId: args['solo-run-id'] as `0x${string}` } : {}),
        ...(matchCountDelta !== undefined ? { matchCountDelta } : {}),
      });
      printJSON(result);
      return;
    }

    // Human / SIWB path
    if (!config.privateKey) throw new MissingWalletError();
    const wallet = buildWallet({ ...config, privateKey: config.privateKey });
    const cached = findBearer(config.env, wallet.address);
    if (!cached) {
      fail('No SIWB session for this wallet. Run `skillos login` first.');
    }

    const sdk = createSkillOSClient({
      env: config.env,
      baseUrl: config.baseUrl,
      bearerToken: cached.token,
    });
    const result = await sdk.scores.submit({
      tournamentId: args.tournament,
      score,
      ...(args.tier ? { tier: args.tier as 'T0' | 'T1' | 'T2' | 'T3' } : { tier: 'T0' }),
      ...(args['solo-run-id'] ? { soloRunId: args['solo-run-id'] } : {}),
      ...(matchCountDelta !== undefined ? { matchCountDelta } : { matchCountDelta: 1 }),
    });
    printJSON(result);
  },
});

const historyCommand = defineCommand({
  meta: {
    name: 'history',
    description: 'Score submissions for a wallet (defaults to the configured wallet).',
  },
  args: {
    wallet: {
      type: 'positional',
      description: 'EVM wallet address (defaults to the wallet derived from SKILLOS_PRIVATE_KEY).',
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
        fail('No wallet provided. Pass a wallet address as positional arg, or set SKILLOS_PRIVATE_KEY.');
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
    const page = await sdk.scores.history(wallet as `0x${string}`, {
      ...(limit !== undefined ? { limit } : {}),
      ...(args.cursor ? { cursor: args.cursor } : {}),
    });
    printJSON(page);
  },
});

export const scoreCommand = defineCommand({
  meta: {
    name: 'score',
    description: 'Submit scores and inspect submission history.',
  },
  subCommands: {
    submit: submitCommand,
    history: historyCommand,
  },
});

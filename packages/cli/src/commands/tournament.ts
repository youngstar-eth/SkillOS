// `skillos tournament {list,get,fund}` — three subcommands grouped under
// the `tournament` namespace. List/get are read-only (no wallet needed);
// fund is the permissionless USDC sponsorship flow.

import { defineCommand } from 'citty';
import {
  createSkillOSClient,
  ERC20_APPROVE_ABI,
  SPONSORSHIP_MODULE_ABI,
  getChainAddresses,
  usdcAtoms,
} from '@skillos/sdk';
import { loadConfig, MissingWalletError } from '../config.js';
import { buildWallet } from '../wallet.js';
import { fail, info, printJSON, renderTable, shortAddress, shortHash } from '../output.js';

const BYTES32_RE = /^0x[a-fA-F0-9]{64}$/;
const AMOUNT_RE = /^[0-9]+(\.[0-9]{1,6})?$/;

const listCommand = defineCommand({
  meta: {
    name: 'list',
    description: 'List tournaments (paginated, newest first).',
  },
  args: {
    game: {
      type: 'string',
      description: 'Game slug filter (e.g. 2048, wordle).',
    },
    status: {
      type: 'enum',
      description: 'Lifecycle filter.',
      options: ['live', 'upcoming', 'settled'],
    },
    limit: {
      type: 'string',
      description: 'Items per page (1-50). Defaults to 20.',
    },
    cursor: {
      type: 'string',
      description: 'Opaque cursor from a previous response.',
    },
    json: {
      type: 'boolean',
      description: 'Emit raw JSON instead of a table.',
      default: false,
    },
    env: {
      type: 'enum',
      description: 'Environment override.',
      options: ['testnet', 'mainnet'],
    },
  },
  async run({ args }) {
    const config = loadConfig({ env: args.env });
    const sdk = createSkillOSClient({ env: config.env, baseUrl: config.baseUrl });

    const limit = args.limit ? Number(args.limit) : undefined;
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 50)) {
      fail(`--limit must be an integer 1..50, got ${args.limit}`);
    }

    const page = await sdk.tournaments.list({
      ...(limit !== undefined ? { limit } : {}),
      ...(args.cursor ? { cursor: args.cursor } : {}),
    });

    const now = Math.floor(Date.now() / 1000);
    const filtered = page.items.filter((t) => {
      if (args.game && t.game !== args.game) return false;
      if (!args.status) return true;
      if (args.status === 'settled') return t.settled;
      if (args.status === 'upcoming') return now < t.startsAt;
      return t.startsAt <= now && now < t.endsAt && !t.settled;
    });

    if (args.json) {
      printJSON({ items: filtered, pagination: page.pagination });
      return;
    }

    process.stdout.write(
      renderTable(filtered, [
        { header: 'ID', format: (t) => shortHash(t.id, 8, 6) },
        { header: 'GAME', format: (t) => t.game },
        { header: 'SPONSOR', format: (t) => shortAddress(t.sponsor as `0x${string}`) },
        {
          header: 'PRIZE (USDC)',
          format: (t) => (Number(t.prizePool) / 1_000_000).toFixed(2),
        },
        {
          header: 'STATUS',
          format: (t) => {
            if (t.settled) return 'settled';
            if (now < t.startsAt) return 'upcoming';
            if (now < t.endsAt) return 'live';
            return 'pending-settle';
          },
        },
        { header: 'PLAYERS', format: (t) => String(t.participantsCount) },
      ]) + '\n',
    );
    if (page.pagination.next) {
      info(`Next page: --cursor=${page.pagination.next}`);
    }
  },
});

const getCommand = defineCommand({
  meta: {
    name: 'get',
    description: 'Fetch a single tournament by bytes32 id.',
  },
  args: {
    id: {
      type: 'positional',
      description: 'Tournament id (0x… 64-char hex).',
      required: true,
    },
    env: {
      type: 'enum',
      description: 'Environment override.',
      options: ['testnet', 'mainnet'],
    },
  },
  async run({ args }) {
    if (!BYTES32_RE.test(args.id)) {
      fail(`tournament id must be 0x-prefixed 32-byte hex, got ${args.id}`);
    }
    const config = loadConfig({ env: args.env });
    const sdk = createSkillOSClient({ env: config.env, baseUrl: config.baseUrl });
    const tournament = await sdk.tournaments.get(args.id as `0x${string}`);
    printJSON(tournament);
  },
});

const fundCommand = defineCommand({
  meta: {
    name: 'fund',
    description: 'Sponsor a tournament prize pool with USDC (approve + sponsorPool).',
  },
  args: {
    id: {
      type: 'positional',
      description: 'Tournament id (0x… 64-char hex).',
      required: true,
    },
    amount: {
      type: 'string',
      description: 'USDC amount, e.g. "5" or "0.50".',
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
    if (!BYTES32_RE.test(args.id)) fail(`tournament id must be 0x-prefixed 32-byte hex, got ${args.id}`);
    if (!AMOUNT_RE.test(args.amount)) {
      fail(`--amount must be a decimal USD amount with ≤6 fractional digits, got "${args.amount}"`);
    }

    const config = loadConfig({ env: args.env, privateKey: args.key });
    if (!config.privateKey) throw new MissingWalletError();

    const addresses = getChainAddresses(config.env);
    const wallet = buildWallet({ ...config, privateKey: config.privateKey });
    const atoms = usdcAtoms(args.amount);

    info(`Approving ${args.amount} USDC for SponsorshipModule…`);
    const approveHash = await wallet.walletClient.writeContract({
      account: wallet.account,
      chain: null,
      address: addresses.usdc,
      abi: ERC20_APPROVE_ABI,
      functionName: 'approve',
      args: [addresses.sponsorshipModule, atoms],
    });
    info(`  approve tx: ${approveHash}`);
    const approveReceipt = await wallet.publicClient.waitForTransactionReceipt({ hash: approveHash });
    if (approveReceipt.status !== 'success') fail(`approve reverted: ${approveHash}`);

    info(`Sponsoring tournament ${shortHash(args.id, 8, 6)}…`);
    const sponsorHash = await wallet.walletClient.writeContract({
      account: wallet.account,
      chain: null,
      address: addresses.sponsorshipModule,
      abi: SPONSORSHIP_MODULE_ABI,
      functionName: 'sponsorPool',
      args: [args.id as `0x${string}`, atoms],
    });
    info(`  sponsorPool tx: ${sponsorHash}`);
    const sponsorReceipt = await wallet.publicClient.waitForTransactionReceipt({ hash: sponsorHash });
    if (sponsorReceipt.status !== 'success') fail(`sponsorPool reverted: ${sponsorHash}`);

    printJSON({
      ok: true,
      tournamentId: args.id,
      amount: args.amount,
      atoms: atoms.toString(),
      sponsor: wallet.address,
      approveTxHash: approveHash,
      sponsorTxHash: sponsorHash,
      chainId: config.chainId,
    });
  },
});

export const tournamentCommand = defineCommand({
  meta: {
    name: 'tournament',
    description: 'Tournament discovery + sponsorship.',
  },
  subCommands: {
    list: listCommand,
    get: getCommand,
    fund: fundCommand,
  },
});

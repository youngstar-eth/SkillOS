// `skillos init` — write ~/.skillos/config.json from flags + prompts.
//
// Non-interactive paths require --key + --env. Interactive (TTY) is the
// default human path: prompt for env, private key, optional agent id.
// Persists to a 0600-mode file in $HOME/.skillos/. Never logs the key.

import { defineCommand } from 'citty';
import { createInterface } from 'node:readline/promises';
import { CONFIG_PATH, writeOnDiskConfig, readOnDiskConfig } from '../config.js';
import { info, fail } from '../output.js';

const PK_RE = /^0x[a-fA-F0-9]{64}$/;

async function prompt(question: string, mask = false): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  if (mask) {
    // Best-effort echo suppression on TTYs. Falls back to plain read on
    // non-TTY (which is rare for an interactive prompt). The native
    // readline doesn't expose a portable "no echo"; we use a quick toggle.
    const stdin = process.stdin;
    if (stdin.isTTY) stdin.setRawMode?.(true);
    const answer = await rl.question(question);
    if (stdin.isTTY) stdin.setRawMode?.(false);
    return answer.trim();
  }
  const answer = await rl.question(question);
  rl.close();
  return answer.trim();
}

export const initCommand = defineCommand({
  meta: {
    name: 'init',
    description: 'Persist SkillOS CLI configuration to ~/.skillos/config.json',
  },
  args: {
    env: {
      type: 'enum',
      description: 'Chain environment',
      options: ['testnet', 'mainnet'],
    },
    key: {
      type: 'string',
      description: '0x-prefixed 32-byte private key (warning: appears in shell history).',
    },
    'agent-id': {
      type: 'string',
      description: 'ERC-8004 tokenId owned by the configured wallet (optional).',
    },
    'base-url': {
      type: 'string',
      description: 'API base URL override.',
    },
    force: {
      type: 'boolean',
      description: 'Overwrite an existing config file without prompting.',
      default: false,
    },
  },
  async run({ args }) {
    const existing = readOnDiskConfig();
    const hasExisting = Object.keys(existing).length > 0;

    if (hasExisting && !args.force) {
      info(`Existing config detected at ${CONFIG_PATH}. Pass --force to overwrite.`);
      return;
    }

    const env = (args.env as 'testnet' | 'mainnet' | undefined) ??
      (process.stdin.isTTY
        ? ((await prompt('Environment [testnet|mainnet] (testnet): ')) || 'testnet')
        : 'testnet');
    if (env !== 'testnet' && env !== 'mainnet') {
      fail(`env must be "testnet" or "mainnet", got "${env}"`);
    }

    let privateKey = args.key?.trim();
    if (!privateKey && process.stdin.isTTY) {
      privateKey = await prompt('Private key (0x… 32-byte hex; leave blank to skip): ', true);
    }
    if (privateKey && !PK_RE.test(privateKey)) {
      fail('Private key must be 0x-prefixed 32-byte hex (66 chars).');
    }

    let agentId: number | undefined;
    const rawAgentId = args['agent-id']?.trim();
    if (rawAgentId) {
      const n = Number(rawAgentId);
      if (!Number.isInteger(n) || n < 0) fail(`agent-id must be a non-negative integer, got "${rawAgentId}"`);
      agentId = n;
    }

    writeOnDiskConfig({
      env,
      ...(privateKey ? { privateKey: privateKey as `0x${string}` } : {}),
      ...(agentId !== undefined ? { agentId } : {}),
      ...(args['base-url']?.trim() ? { baseUrl: args['base-url'].trim() } : {}),
    });

    info(`Wrote ${CONFIG_PATH} (0600).`);
    info(`env=${env}${agentId !== undefined ? ` agentId=${agentId}` : ''}`);
    info('Run `skillos tournament list` to verify connectivity.');
  },
});

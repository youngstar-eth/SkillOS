import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';

export const GAMES = ['wordle', 'sudoku', 'match3', 'minesweeper', 'clicker'] as const;
export type Game = (typeof GAMES)[number];

export interface WalletIdentity {
  address: `0x${string}`;
  account: PrivateKeyAccount;
  agentId: number;
  game: Game;
  source: string;
}

interface WalletFile {
  game: string;
  address: string;
  privateKey: string;
  mnemonic?: string;
  // Stored as string in keystore JSON; coerced via Number() on load to unify
  // with CI mode (env vars are always strings).
  agentId: number | string;
  registerTx?: string;
  builderCode?: string;
}

const HEX_PRIVATE_KEY = /^0x[a-fA-F0-9]{64}$/;

export function loadWallet(game: Game): WalletIdentity {
  const upper = game.toUpperCase();
  const envPk = process.env[`AGENT_PK_${upper}`];
  const envAgentId = process.env[`AGENT_ID_${upper}`];
  const isCI = Boolean(process.env.CI);

  let pk: string;
  let agentId: number;
  let source: string;

  if (isCI) {
    if (!envPk || !envAgentId) {
      throw new Error(
        `CI mode requires AGENT_PK_${upper} and AGENT_ID_${upper} env vars`,
      );
    }
    pk = envPk;
    agentId = Number(envAgentId);
    source = 'env (CI)';
  } else {
    const walletPath = join(homedir(), '.skillos', 'wallets', `${game}.json`);
    const file = JSON.parse(readFileSync(walletPath, 'utf8')) as WalletFile;
    pk = file.privateKey;
    agentId = Number(file.agentId);
    source = walletPath;
  }

  if (!HEX_PRIVATE_KEY.test(pk)) {
    throw new Error(`Invalid privateKey for ${game} (source: ${source})`);
  }
  if (!Number.isFinite(agentId) || agentId <= 0) {
    throw new Error(`Invalid agentId for ${game} (source: ${source})`);
  }

  const account = privateKeyToAccount(pk as `0x${string}`);
  return { address: account.address, account, agentId, game, source };
}

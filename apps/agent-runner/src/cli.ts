#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { loadWallet, GAMES, type Game } from './lib/wallet.js';
import { resolveTournament } from './lib/tournament.js';

function usage(exitCode = 0): never {
  console.error(
    [
      'Usage: tsx src/cli.ts --game <game> [--dry-run|--live] [--tournament <id>]',
      '',
      `  --game         Required. One of: ${GAMES.join(', ')}.`,
      '  --dry-run      Construct SIWA receipt + signed request, DO NOT POST. (default)',
      '  --live         Actually POST to /v1/agents/scores. Mutex with --dry-run.',
      '  --tournament   Override resolved tournament id (bytes32 hex).',
      '',
      'Env (local): reads ~/.skillos/wallets/<game>.json',
      'Env (CI):    AGENT_PK_<GAME>, AGENT_ID_<GAME>',
      '             SKILLOS_BASE_URL (default: https://api.skillos.network)',
    ].join('\n'),
  );
  process.exit(exitCode);
}

const { values } = parseArgs({
  options: {
    game: { type: 'string' },
    'dry-run': { type: 'boolean' },
    live: { type: 'boolean' },
    tournament: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
  strict: true,
});

if (values.help) usage(0);

const game = values.game as Game | undefined;
if (!game || !GAMES.includes(game)) {
  console.error(`Error: --game required, one of ${GAMES.join('|')}`);
  usage(1);
}
if (values['dry-run'] && values.live) {
  console.error('Error: --dry-run and --live are mutually exclusive');
  process.exit(1);
}

const mode: 'dry-run' | 'live' = values.live ? 'live' : 'dry-run';

async function main(): Promise<void> {
  const wallet = loadWallet(game!);
  const tournamentId = values.tournament ?? (await resolveTournament(game!));

  // Phase A scaffold — submit wrapper lands in Phase B (B.2).
  console.log(
    JSON.stringify(
      {
        phase: 'A-scaffold',
        mode,
        game,
        agent: wallet.address,
        agentId: wallet.agentId,
        tournament: tournamentId,
        baseUrl: process.env.SKILLOS_BASE_URL ?? 'https://api.skillos.network',
        note: 'scoring + submit wrapper land in Phase B',
      },
      null,
      2,
    ),
  );
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[agent-runner] FAIL: ${msg}`);
  process.exit(1);
});

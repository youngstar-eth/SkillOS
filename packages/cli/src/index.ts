// bin entry — composes subcommands and routes unhandled errors to stderr.

import { defineCommand, runMain } from 'citty';
import { agentCommand } from './commands/agent.js';
import { dataCommand } from './commands/data.js';
import { initCommand } from './commands/init.js';
import { loginCommand } from './commands/login.js';
import { scoreCommand } from './commands/score.js';
import { sponsorCommand } from './commands/sponsor.js';
import { tournamentCommand } from './commands/tournament.js';

const main = defineCommand({
  meta: {
    name: 'skillos',
    version: '0.1.0',
    description:
      'SkillOS command-line interface. Wraps @skillos/sdk for tournaments, scores, sponsors, agents, and x402-paywalled data tiers.',
  },
  subCommands: {
    init: initCommand,
    login: loginCommand,
    tournament: tournamentCommand,
    score: scoreCommand,
    sponsor: sponsorCommand,
    agent: agentCommand,
    data: dataCommand,
  },
});

runMain(main).catch((err: unknown) => {
  if (err instanceof Error) {
    process.stderr.write(`error: ${err.message}\n`);
  } else {
    process.stderr.write(`error: ${String(err)}\n`);
  }
  process.exit(1);
});

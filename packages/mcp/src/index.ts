// Entry point — bin "skillos-mcp". Parses transport flags and connects.
//
// Default transport: stdio (Claude Desktop, Cursor, Codex). For hosted use
// (e.g., a remote MCP gateway behind nginx), pass `--transport http
// --port 3030` and connect via the Streamable HTTP transport spec.
//
// All logging goes to stderr only; stdout is reserved for JSON-RPC frames
// per the MCP stdio transport contract.

import { parseArgs } from 'node:util';
import { loadConfig } from './config.js';
import { buildServer, PACKAGE_NAME, PACKAGE_VERSION } from './server.js';
import { connectStdio } from './transports/stdio.js';
import { startHttp } from './transports/http.js';

function usage(exitCode = 0): never {
  process.stderr.write(
    [
      `${PACKAGE_NAME}@${PACKAGE_VERSION}`,
      '',
      'Usage:',
      '  skillos-mcp [--transport stdio]                  # default; Claude Desktop / Cursor',
      '  skillos-mcp --transport http [--port 3030] [--host 127.0.0.1]',
      '',
      'Env:',
      '  SKILLOS_ENV               testnet | mainnet (default: testnet)',
      '  SKILLOS_BASE_URL          API origin override (default: https://api.skillos.network)',
      '  SKILLOS_AGENT_ADDRESS     0x-prefixed address of your base-mcp wallet (W); required for write tools',
      '  SKILLOS_AGENT_ID          ERC-8004 tokenId owned by W; required for agent tools',
      '  SKILLOS_SIWA_DOMAIN       SIWA domain (default: skillos.network)',
      '  SKILLOS_REGISTRY_ADDRESS  ERC-8004 IdentityRegistry override',
      '  SKILLOS_RPC_URL           Base RPC override',
      '',
      'SPEC-B1: @skillos/mcp holds NO private key. Signing (SIWA, ERC-8128) and',
      '  the register/fund txs are delegated to base-mcp by the host agent.',
      '',
      'Tools: list_tournaments, get_tournament, get_leaderboard,',
      '  get_board_state, make_move, prepare_register, complete_register,',
      '  prepare_siwa, complete_siwa, prepare_submit, complete_submit,',
      '  prepare_fund_pool, fetch_match_replay, fetch_cohort_snapshot (B2).',
      '  See README for schemas + the base-mcp composition contract.',
      '',
    ].join('\n'),
  );
  process.exit(exitCode);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      transport: { type: 'string', default: 'stdio' },
      port: { type: 'string' },
      host: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
    strict: true,
  });

  if (values.help) usage(0);
  if (values.version) {
    process.stderr.write(`${PACKAGE_NAME}@${PACKAGE_VERSION}\n`);
    return;
  }

  const config = loadConfig();
  const server = buildServer(config);

  const transport = (values.transport ?? 'stdio').toLowerCase();
  if (transport === 'stdio') {
    await connectStdio(server);
    return;
  }
  if (transport === 'http') {
    const port = values.port ? Number(values.port) : 3030;
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      process.stderr.write(`Invalid --port "${values.port}"\n`);
      process.exit(1);
    }
    const host = values.host ?? '127.0.0.1';
    await startHttp(server, { port, host });
    return;
  }

  process.stderr.write(`Unknown --transport "${transport}". Use stdio or http.\n`);
  process.exit(1);
}

main().catch((err: unknown) => {
  process.stderr.write(`[${PACKAGE_NAME}] fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});

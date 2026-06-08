// McpServer factory — composes config + SDK client + tool registrations.
//
// Public surface: `buildServer(config)` returns a configured McpServer that
// callers connect to a transport (stdio or Streamable HTTP). Tools are
// registered in stable alphabetical order to make `tools/list` output
// deterministic for LLM clients that fingerprint server capabilities.
//
// SPEC-B1: the agent write path is delegated to base-mcp via prepare_*/
// complete_* pairs — @skillos/mcp holds no key and signs nothing for identity,
// SIWA, or score writes. Play tools (get_board_state/make_move) and read tools
// are unchanged.
//
// B2-A exception (data tiers only): the x402 data tools sign an EIP-3009 USDC
// authorization with a funded EOA (SKILLOS_X402_PAYER_KEY) because the x402
// "exact" EVM rail verifies ECDSA only — a smart-wallet Base Account cannot
// settle it. That key pays data purchases ONLY; it never signs identity/writes.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createSkillOSClient, type SkillOSClient } from '@skillos/sdk';
import type { SkillOSMcpConfig } from './config.js';
import { registerCompleteRegisterTool, registerPrepareRegisterTool } from './tools/agent_register.js';
import { registerFetchCohortSnapshotTool } from './tools/fetch_cohort_snapshot.js';
import { registerFetchMatchReplayTool } from './tools/fetch_match_replay.js';
import { registerPrepareFundPoolTool } from './tools/fund_pool.js';
import { registerGetBoardStateTool } from './tools/get_board_state.js';
import { registerGetLeaderboardTool } from './tools/get_leaderboard.js';
import { registerGetTournamentTool } from './tools/get_tournament.js';
import { registerListTournamentsTool } from './tools/list_tournaments.js';
import { registerMakeMoveTool } from './tools/make_move.js';
import { registerCompleteSiwaTool, registerPrepareSiwaTool } from './tools/siwa_auth.js';
import { registerCompleteSubmitTool, registerPrepareSubmitTool } from './tools/submit_score.js';

export interface ServerContext {
  config: SkillOSMcpConfig;
  sdk: SkillOSClient;
}

export const PACKAGE_NAME = '@skillos/mcp';
export const PACKAGE_VERSION = '0.2.2';

export function buildServer(config: SkillOSMcpConfig): McpServer {
  const sdk = createSkillOSClient({ env: config.env, baseUrl: config.baseUrl });
  const ctx: ServerContext = { config, sdk };

  const server = new McpServer({
    name: PACKAGE_NAME,
    version: PACKAGE_VERSION,
  });

  // Delegated agent write path (base-mcp signs) — prepare_*/complete_* pairs.
  registerPrepareRegisterTool(server, ctx);
  registerCompleteRegisterTool(server, ctx);
  registerPrepareSiwaTool(server, ctx);
  registerCompleteSiwaTool(server, ctx);
  registerPrepareSubmitTool(server, ctx);
  registerCompleteSubmitTool(server, ctx);
  registerPrepareFundPoolTool(server, ctx);

  // Data tiers (x402) — live via a funded EOA payer (SKILLOS_X402_PAYER_KEY).
  registerFetchCohortSnapshotTool(server, ctx);
  registerFetchMatchReplayTool(server, ctx);

  // Play surface — unchanged (no signing).
  registerGetBoardStateTool(server, ctx);
  registerMakeMoveTool(server, ctx);

  // Read tools — unchanged (no key).
  registerGetLeaderboardTool(server, ctx);
  registerGetTournamentTool(server, ctx);
  registerListTournamentsTool(server, ctx);

  return server;
}

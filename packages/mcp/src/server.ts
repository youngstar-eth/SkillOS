// McpServer factory — composes config + SDK client + tool registrations.
//
// Public surface: `buildServer(config)` returns a configured McpServer that
// callers connect to a transport (stdio or Streamable HTTP). Tools are
// registered in stable alphabetical order to make `tools/list` output
// deterministic for LLM clients that fingerprint server capabilities.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createSkillOSClient, type SkillOSClient } from '@skillos/sdk';
import type { SkillOSMcpConfig } from './config.js';
import { registerAgentRegisterTool } from './tools/agent_register.js';
import { registerFetchCohortSnapshotTool } from './tools/fetch_cohort_snapshot.js';
import { registerFetchMatchReplayTool } from './tools/fetch_match_replay.js';
import { registerFundPoolTool } from './tools/fund_pool.js';
import { registerGetLeaderboardTool } from './tools/get_leaderboard.js';
import { registerGetTournamentTool } from './tools/get_tournament.js';
import { registerListTournamentsTool } from './tools/list_tournaments.js';
import { registerSubmitScoreTool } from './tools/submit_score.js';

export interface ServerContext {
  config: SkillOSMcpConfig;
  sdk: SkillOSClient;
}

export const PACKAGE_NAME = '@skillos/mcp';
export const PACKAGE_VERSION = '0.1.0';

export function buildServer(config: SkillOSMcpConfig): McpServer {
  const sdk = createSkillOSClient({ env: config.env, baseUrl: config.baseUrl });
  const ctx: ServerContext = { config, sdk };

  const server = new McpServer({
    name: PACKAGE_NAME,
    version: PACKAGE_VERSION,
  });

  registerAgentRegisterTool(server, ctx);
  registerFetchCohortSnapshotTool(server, ctx);
  registerFetchMatchReplayTool(server, ctx);
  registerFundPoolTool(server, ctx);
  registerGetLeaderboardTool(server, ctx);
  registerGetTournamentTool(server, ctx);
  registerListTournamentsTool(server, ctx);
  registerSubmitScoreTool(server, ctx);

  return server;
}

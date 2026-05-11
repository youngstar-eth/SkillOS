// stdio transport — the canonical Claude Desktop / Cursor entrypoint.
//
// JSON-RPC frames are exchanged on stdin/stdout; any diagnostic output
// MUST go to stderr or the client's framing parser will desync. See
// modelcontextprotocol.io transports spec §"stdio".

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export async function connectStdio(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('[@skillos/mcp] stdio transport ready\n');
}

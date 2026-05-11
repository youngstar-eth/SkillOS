// Streamable HTTP transport — hosted MCP deployments.
//
// One HTTP endpoint (POST + GET, both at /mcp) serves all JSON-RPC traffic
// per the 2025-06-18 transport spec. Sessions are tracked via the
// `Mcp-Session-Id` header; the SDK's `StreamableHTTPServerTransport`
// handles session lifecycle automatically when `sessionIdGenerator` is set.
//
// Bind defaults to 127.0.0.1 per the MCP spec security note: "When running
// locally, servers SHOULD bind only to localhost (127.0.0.1) rather than
// all interfaces" — DNS rebinding mitigation.

import http from 'node:http';
import crypto from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export interface HttpOptions {
  port: number;
  host: string;
}

export async function startHttp(server: McpServer, opts: HttpOptions): Promise<void> {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  });
  await server.connect(transport);

  const httpServer = http.createServer(async (req, res) => {
    // Origin check — DNS rebinding mitigation. Allow same-origin localhost.
    const origin = req.headers.origin;
    if (origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      res.statusCode = 403;
      res.end(JSON.stringify({ error: { code: 'forbidden_origin', message: `Disallowed Origin: ${origin}` } }));
      return;
    }
    try {
      await transport.handleRequest(req, res);
    } catch (err) {
      process.stderr.write(`[@skillos/mcp] http handler error: ${err instanceof Error ? err.message : String(err)}\n`);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end();
      }
    }
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(opts.port, opts.host, () => resolve());
  });

  process.stderr.write(`[@skillos/mcp] http transport listening on http://${opts.host}:${opts.port}/\n`);
}

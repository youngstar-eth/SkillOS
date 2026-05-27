// MCP transport factories. The `@modelcontextprotocol/sdk` ships
// stdio + StreamableHTTP transports out of the box; this module just
// picks one off the discriminated `TransportConfig` so the caller
// never imports SDK internals directly.

import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

import type { TransportConfig } from './types.js';

export function createTransport(config: TransportConfig): Transport {
  if (config.kind === 'stdio') {
    return new StdioClientTransport({
      command: config.command,
      args: config.args ?? [],
      env: config.env,
      cwd: config.cwd,
    });
  }
  // streamableHttp
  return new StreamableHTTPClientTransport(new URL(config.url), {
    requestInit: { headers: config.headers },
  });
}

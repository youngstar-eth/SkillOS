// Thin wrapper around McpServer.registerTool that bridges zod v4 schemas
// to the SDK's ZodRawShapeCompat union. The SDK union (`z3.ZodTypeAny |
// z4.$ZodType`) prefers narrowing toward v3 — our zod v4 classic schemas
// lack v3 internals (_type, _parse, …) so TS rejects the call. Runtime is
// fine: the SDK's `isZ4Schema` detects v4 at execution time.
//
// Tracked upstream at modelcontextprotocol/typescript-sdk#925; remove this
// wrapper when the SDK switches to the Standard Schema interface natively.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { z } from 'zod';

export type RawShape = Record<string, z.ZodTypeAny>;
export type ShapeOutput<S extends RawShape> = { [K in keyof S]: z.infer<S[K]> };

export interface ToolTextResult {
  content: Array<{ type: 'text'; text: string }>;
}

export interface ToolDef<S extends RawShape> {
  name: string;
  description: string;
  inputSchema: S;
  handler: (args: ShapeOutput<S>) => Promise<ToolTextResult>;
}

export function registerTool<S extends RawShape>(server: McpServer, def: ToolDef<S>): void {
  server.registerTool(
    def.name,
    {
      description: def.description,
      inputSchema: def.inputSchema as never,
    },
    def.handler as never,
  );
}
